-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector" with schema public;

-- Enable automatic updating of updated_at columns
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- 1. USERS TABLE (Linked to auth.users)
-------------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Stores user profile metadata synced automatically from auth.users.';
comment on column public.users.id is 'Primary key, references auth.users(id).';

-- Automatically sync profiles from auth.users on signup
create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger for users updated_at
create trigger update_users_updated_at
  before update on public.users
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 2. GMAIL_ACCOUNTS TABLE
-------------------------------------------------------------------------------
create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email_address text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_token text, -- Store sync_token for incremental sync
  gmail_history_id bigint, -- [MODIFIED IN V2] Store the latest Gmail History ID for incremental sync
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique mapping of email account per user
  constraint unique_user_email_account unique (user_id, email_address)
);

comment on table public.gmail_accounts is 'Stores OAuth tokens and sync status for each integrated Gmail account.';
comment on column public.gmail_accounts.sync_token is 'Used for incremental Gmail sync (sync tokens).';
comment on column public.gmail_accounts.gmail_history_id is '[MODIFIED IN V2] Used for incremental Gmail sync tracking (the latest History ID).';

-- Trigger for gmail_accounts updated_at
create trigger update_gmail_accounts_updated_at
  before update on public.gmail_accounts
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 3. EMAIL_THREADS TABLE
-------------------------------------------------------------------------------
create table public.email_threads (
  id uuid primary key default gen_random_uuid(),
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  gmail_thread_id text not null, -- The unique thread ID from Gmail API
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure thread ID is unique per Gmail integration
  constraint unique_gmail_thread unique (gmail_account_id, gmail_thread_id)
);

comment on table public.email_threads is 'Groups related email messages into threads, mimicking the Gmail threading model.';

-- Trigger for email_threads updated_at
create trigger update_email_threads_updated_at
  before update on public.email_threads
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 4. EMAILS TABLE
-------------------------------------------------------------------------------
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  gmail_account_id uuid not null references public.gmail_accounts(id) on delete cascade,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  gmail_message_id text not null, -- The unique message ID from Gmail API
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text,
  body_text text,
  body_html text,
  labels text[] not null default '{}', -- Gmail labels (e.g. INBOX, SENT, CATEGORY_PROMOTIONS)
  in_reply_to text, -- [MODIFIED IN V2] Stores Gmail In-Reply-To header for thread-aware replies
  references_header text[] not null default '{}', -- [MODIFIED IN V2] Stores Gmail References header array for thread-aware replies
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure message ID is unique per Gmail integration
  constraint unique_gmail_message unique (gmail_account_id, gmail_message_id)
);

comment on table public.emails is 'Stores individual email messages, metadata, bodies, and labels.';
comment on column public.emails.in_reply_to is '[MODIFIED IN V2] Stores the message ID this email is in reply to, aiding conversation threading.';
comment on column public.emails.references_header is '[MODIFIED IN V2] Stores thread-aware reference headers to maintain correct email thread associations.';

-- Trigger for emails updated_at
create trigger update_emails_updated_at
  before update on public.emails
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 5. EMAIL_SUMMARIES TABLE
-------------------------------------------------------------------------------
create table public.email_summaries (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null unique references public.emails(id) on delete cascade,
  summary text not null,
  key_takeaways text[] not null default '{}',
  action_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_summaries is 'Stores AI-generated metadata, short summaries, and key takeaways for single emails.';

-- Trigger for email_summaries updated_at
create trigger update_email_summaries_updated_at
  before update on public.email_summaries
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 6. THREAD_SUMMARIES TABLE
-------------------------------------------------------------------------------
create table public.thread_summaries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.email_threads(id) on delete cascade,
  summary text not null,
  key_decisions text[] not null default '{}',
  action_items text[] not null default '{}',
  participants text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.thread_summaries is 'Stores AI-generated summaries and consolidation statistics for whole conversation threads.';

-- Trigger for thread_summaries updated_at
create trigger update_thread_summaries_updated_at
  before update on public.thread_summaries
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 7. EMAIL_CATEGORIES TABLE
-------------------------------------------------------------------------------
create table public.email_categories (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null unique references public.emails(id) on delete cascade,
  category text not null constraint check_email_category check (category in ('Newsletter', 'Job', 'Finance', 'Notification', 'Personal', 'Work')), -- [MODIFIED IN V2] AI assigned category restricted by CHECK constraint
  confidence_score double precision not null, -- Score between 0.0 and 1.0
  reasoning text, -- Explanation of why this category was assigned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_categories is 'Stores AI categorization tags, confidence levels, and logic explanations.';

-- Trigger for email_categories updated_at
create trigger update_email_categories_updated_at
  before update on public.email_categories
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 8. EMBEDDINGS TABLE (pgvector for semantic search)
-------------------------------------------------------------------------------
create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references public.emails(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete cascade,
  chunk_index integer not null, -- Sequences the chunks within the same email
  content text not null, -- The text snippet represented by this vector
  embedding vector(768) not null, -- 768-dimensions (matches Google text-embedding-004)
  created_at timestamptz not null default now(),
  
  -- Ensure embedding links to either an email, a thread, or both
  constraint check_embedding_target check (email_id is not null or thread_id is not null)
);

comment on table public.embeddings is 'Stores vector embeddings of segmented email content or summaries for semantic RAG queries.';

-------------------------------------------------------------------------------
-- 9. CHAT_SESSIONS TABLE
-------------------------------------------------------------------------------
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chat_sessions is 'Tracks active context sessions between users and the AI email intelligence assistant.';

-- Trigger for chat_sessions updated_at
create trigger update_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute procedure public.update_updated_at_column();

-------------------------------------------------------------------------------
-- 10. CHAT_MESSAGES TABLE
-------------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}', -- Stores citation sources, attribution nodes, and model metadata
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Stores conversational elements within a session, including sources cited from email embeddings.';

-------------------------------------------------------------------------------
-- INDEXES FOR HIGH-PERFORMANCE QUERYING
-------------------------------------------------------------------------------
-- Foreign Key Indexes
create index idx_gmail_accounts_user_id on public.gmail_accounts(user_id);
create index idx_email_threads_account_id on public.email_threads(gmail_account_id);
create index idx_emails_thread_id on public.emails(thread_id);
create index idx_emails_account_id on public.emails(gmail_account_id);
create index idx_embeddings_email_id on public.embeddings(email_id);
create index idx_embeddings_thread_id on public.embeddings(thread_id);
create index idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index idx_chat_messages_session_id on public.chat_messages(session_id);

-- Lookup / Unique Key Fast Indexes
create index idx_emails_gmail_message_id on public.emails(gmail_message_id);
create index idx_email_threads_gmail_thread_id on public.email_threads(gmail_thread_id);
create index idx_emails_received_at on public.emails(received_at desc);

-- Vector Similarity Index (HNSW for faster Cosine similarity queries)
create index idx_embeddings_vector_hnsw 
on public.embeddings 
using hnsw (embedding vector_cosine_ops);

-------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-------------------------------------------------------------------------------
-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.gmail_accounts enable row level security;
alter table public.email_threads enable row level security;
alter table public.emails enable row level security;
alter table public.email_summaries enable row level security;
alter table public.thread_summaries enable row level security;
alter table public.email_categories enable row level security;
alter table public.embeddings enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- 1. Users policies
create policy "Users can view their own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.users
  for update using (auth.uid() = id);

-- 2. Gmail accounts policies
create policy "Users can view their own Gmail accounts" on public.gmail_accounts
  for all using (auth.uid() = user_id);

-- 3. Email threads policies
create policy "Users can access threads of their Gmail accounts" on public.email_threads
  for all using (
    exists (
      select 1 from public.gmail_accounts
      where gmail_accounts.id = email_threads.gmail_account_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 4. Emails policies
create policy "Users can access emails of their Gmail accounts" on public.emails
  for all using (
    exists (
      select 1 from public.gmail_accounts
      where gmail_accounts.id = emails.gmail_account_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 5. Email summaries policies
create policy "Users can access summaries of their emails" on public.email_summaries
  for all using (
    exists (
      select 1 from public.emails
      join public.gmail_accounts on gmail_accounts.id = emails.gmail_account_id
      where emails.id = email_summaries.email_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 6. Thread summaries policies
create policy "Users can access summaries of their threads" on public.thread_summaries
  for all using (
    exists (
      select 1 from public.email_threads
      join public.gmail_accounts on gmail_accounts.id = email_threads.gmail_account_id
      where email_threads.id = thread_summaries.thread_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 7. Email categories policies
create policy "Users can access categories of their emails" on public.email_categories
  for all using (
    exists (
      select 1 from public.emails
      join public.gmail_accounts on gmail_accounts.id = emails.gmail_account_id
      where emails.id = email_categories.email_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 8. Embeddings policies
create policy "Users can access embeddings of their emails" on public.embeddings
  for all using (
    exists (
      select 1 from public.emails
      join public.gmail_accounts on gmail_accounts.id = emails.gmail_account_id
      where emails.id = embeddings.email_id
      and gmail_accounts.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.email_threads
      join public.gmail_accounts on gmail_accounts.id = email_threads.gmail_account_id
      where email_threads.id = embeddings.thread_id
      and gmail_accounts.user_id = auth.uid()
    )
  );

-- 9. Chat sessions policies
create policy "Users can access their own chat sessions" on public.chat_sessions
  for all using (auth.uid() = user_id);

-- 10. Chat messages policies
create policy "Users can access messages of their chat sessions" on public.chat_messages
  for all using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
    )
  );
