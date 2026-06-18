-- Create the match_embeddings function for pgvector similarity search
create or replace function public.match_embeddings (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  email_id uuid,
  thread_id uuid,
  content text,
  similarity float
)
language plpgsql stable
as $$
begin
  return query
  select
    embeddings.id,
    embeddings.email_id,
    embeddings.thread_id,
    embeddings.content,
    1 - (embeddings.embedding <=> query_embedding) as similarity
  from public.embeddings
  where 1 - (embeddings.embedding <=> query_embedding) > match_threshold
  order by embeddings.embedding <=> query_embedding
  limit match_count;
end;
$$;
