// Stateful Client-Side Demo Database for Inbox Harmony

export interface DemoEmail {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  labels: string[];
  receivedAt: string;
  category: "Work" | "Newsletter" | "Job" | "Finance" | "Personal" | "Notification";
  importance: "high" | "normal" | "low";
}

export interface DemoSummary {
  email_id: string;
  summary: string;
  key_takeaways: string[];
  action_items: string[];
}

export interface DemoThreadSummary {
  thread_id: string;
  summary: string;
  key_decisions: string[];
  action_items: string[];
  participants: string[];
}

export interface DemoDraft {
  id: string;
  senderName: string;
  senderEmail: string;
  senderInitials: string;
  avatarColor: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  unread: boolean;
  starred: boolean;
  category: string;
  importance: string;
  labels: string[];
  hasAttachments: boolean;
}

export interface DemoDb {
  emails: DemoEmail[];
  drafts: DemoDraft[];
  emailSummaries: Record<string, DemoSummary>;
  threadSummaries: Record<string, DemoThreadSummary>;
  agentChat: { role: "user" | "assistant"; content: string; sources?: any[] }[];
}

const DEMO_FLAG_KEY = "inbox_harmony_demo";
const DEMO_DB_KEY = "inbox_harmony_demo_db";

function timeAgo(msOffset: number): string {
  return new Date(Date.now() - msOffset).toISOString();
}

// Generate the initial mock database
function createInitialDb(): DemoDb {
  const emails: DemoEmail[] = [
    // Thread 1: Q3 Roadmap
    {
      id: "demo-email-1",
      threadId: "demo-thread-1",
      senderName: "Sarah Jenkins",
      senderEmail: "sarah@acme.com",
      subject: "Q3 Roadmap Alignment & Product Specs",
      bodyText: "Hi all,\n\nHere is the initial plan for the Q3 roadmap. Please let me know your thoughts on the timeline and features. We want to align on the core components before the sprint planning meeting next week.\n\nBest,\nSarah",
      labels: ["INBOX"],
      receivedAt: timeAgo(24 * 60 * 60 * 1000), // 1 day ago
      category: "Work",
      importance: "normal",
    },
    {
      id: "demo-email-2",
      threadId: "demo-thread-1",
      senderName: "Sarah Jenkins",
      senderEmail: "sarah@acme.com",
      subject: "Re: Q3 Roadmap Alignment & Product Specs",
      bodyText: "Hi team,\n\nI reviewed the drafts for the Q3 roadmap. I agree with the timeline for phase 1 but we need to allocate more resources to the Supabase sync engine to support offline tokens. Let's schedule a brief call tomorrow at 10 AM to sync up.\n\nThanks,\nSarah",
      labels: ["INBOX", "UNREAD"],
      receivedAt: timeAgo(15 * 60 * 1000), // 15 mins ago
      category: "Work",
      importance: "high",
    },
    // Thread 2: Stripe Interview
    {
      id: "demo-email-3",
      threadId: "demo-thread-2",
      senderName: "Hiring at Stripe",
      senderEmail: "careers@stripe.com",
      subject: "Interview Scheduling: Senior Fullstack Engineer",
      bodyText: "Hi Nithin,\n\nThank you for taking the time to speak with us. We would love to move you forward to the next round of technical interviews. Please use this Calendly link to schedule 45 minutes with our engineering lead next week. Let us know if you have any questions.\n\nBest regards,\nStripe Recruiting Team",
      labels: ["INBOX", "UNREAD", "IMPORTANT"],
      receivedAt: timeAgo(60 * 60 * 1000), // 1 hour ago
      category: "Job",
      importance: "high",
    },
    // Thread 3: Acme Billing
    {
      id: "demo-email-4",
      threadId: "demo-thread-3",
      senderName: "Acme Billing",
      senderEmail: "billing@acme.com",
      subject: "Invoice INV-2026-0041 for Inbox Harmony implementation",
      bodyText: "Hello,\n\nPlease find attached invoice INV-2026-0041 for software consulting and integration services. Total due: $4,500.00. Payment is due within 15 days via bank transfer or credit card portal. Thank you for your business.\n\nAcme Accounts team",
      labels: ["INBOX", "UNREAD"],
      receivedAt: timeAgo(5 * 60 * 60 * 1000), // 5 hours ago
      category: "Finance",
      importance: "normal",
    },
    // Thread 4: TLDR
    {
      id: "demo-email-5",
      threadId: "demo-thread-4",
      senderName: "TLDR Newsletter",
      senderEmail: "tldr@tldrnewsletter.com",
      subject: "TLDR: Apple's AI plans, WebAssembly in 2026, and the future of frontends",
      bodyText: "APPLE'S NEXT GEN MODELS\nApple plans to roll out next-generation on-device generative models this autumn. The design focuses on offline-first tasks and local hardware optimization.\n\nWEBASSEMBLY RISE IN 2026\nWebAssembly sees massive adoption in cloud environment edge nodes, enabling multi-language serverless runtimes.\n\nVITE 7 RELEASED\nVite 7 is officially announced with native support for Rust-based compilers, cutting development rebuild times in half.",
      labels: ["INBOX"],
      receivedAt: timeAgo(6 * 60 * 60 * 1000), // 6 hours ago
      category: "Newsletter",
      importance: "low",
    },
    // Thread 5: Yosemite Hiking
    {
      id: "demo-email-6",
      threadId: "demo-thread-5",
      senderName: "David Miller",
      senderEmail: "david.miller@gmail.com",
      subject: "Weekend hiking trip to Yosemite",
      bodyText: "Hey man,\n\nAre we still on for hiking this Saturday? The weather looks great, clear skies and around 72 degrees. Let me know if you can drive or if I should pick you up. I'll bring the trail snacks and maps!\n\nDavid",
      labels: ["INBOX", "UNREAD"],
      receivedAt: timeAgo(3 * 60 * 60 * 1000), // 3 hours ago
      category: "Personal",
      importance: "normal",
    },
    // Thread 6: GitHub Alert
    {
      id: "demo-email-7",
      threadId: "demo-thread-6",
      senderName: "GitHub",
      senderEmail: "notifications@github.com",
      subject: "[GitHub] Security Alert: dependency update required in workspace",
      bodyText: "We found a known vulnerability in one of your dependencies. Please upgrade tar from 6.1.1 to 6.2.1 immediately to resolve this issue in the inbox-harmony repository. The vulnerability allows arbitrary file writing during extraction.",
      labels: ["INBOX"],
      receivedAt: timeAgo(30 * 60 * 60 * 1000), // 30 hours ago
      category: "Notification",
      importance: "high",
    },
    // Thread 7: Vercel Deploy
    {
      id: "demo-email-8",
      threadId: "demo-thread-7",
      senderName: "Vercel",
      senderEmail: "noreply@vercel.com",
      subject: "Deployment successful for inbox-harmony-prod",
      bodyText: "Production deployment for branch main has succeeded. Project URL: https://inbox-harmony.vercel.app. Commit message: fix: oauth callback handling. Build time: 1m 24s.",
      labels: ["INBOX"],
      receivedAt: timeAgo(2 * 60 * 60 * 1000), // 2 hours ago
      category: "Notification",
      importance: "low",
    },
    // Thread 8: Substack Newsletter
    {
      id: "demo-email-9",
      threadId: "demo-thread-8",
      senderName: "Gergely Orosz",
      senderEmail: "gergely@substack.com",
      subject: "The Pragmatic Engineer: Tech debt strategy, promotion cycles, and design patterns",
      bodyText: "Hi subscriber,\n\nIn this newsletter, we cover: How to effectively align tech debt priorities with your engineering manager without stopping product releases. Strategies for paying down tech debt. Notes on navigating senior promotion cycles.",
      labels: ["INBOX"],
      receivedAt: timeAgo(2 * 24 * 60 * 60 * 1000), // 2 days ago
      category: "Newsletter",
      importance: "normal",
    },
    // Thread 9: Mom
    {
      id: "demo-email-10",
      threadId: "demo-thread-9",
      senderName: "Mom",
      senderEmail: "mom@gmail.com",
      subject: "Checking in!",
      bodyText: "Hi dear, just checking in to see how your new project is going. We saw the dashboard you built, it looks very polished! Let me know when you have some time to chat. Love, Mom.",
      labels: ["INBOX"],
      receivedAt: timeAgo(3 * 24 * 60 * 60 * 1000), // 3 days ago
      category: "Personal",
      importance: "normal",
    },
    // Thread 10: Chase Statement
    {
      id: "demo-email-11",
      threadId: "demo-thread-10",
      senderName: "Chase Bank",
      senderEmail: "alerts@chase.com",
      subject: "Your credit card statement is ready",
      bodyText: "Your monthly credit card statement for the account ending in 1234 is now available online. Minimum payment due: $35.00 by July 5, 2026. Login to your Chase app to review and make payments.",
      labels: ["INBOX"],
      receivedAt: timeAgo(4 * 24 * 60 * 60 * 1000), // 4 days ago
      category: "Finance",
      importance: "normal",
    },
    // Thread 11: PR review
    {
      id: "demo-email-12",
      threadId: "demo-thread-11",
      senderName: "Dev Lead",
      senderEmail: "lead@acme.com",
      subject: "PR Review Request: Implement sync pipeline error handling",
      bodyText: "Hey Nithin, can you take a look at PR #452 when you get a chance? I've refactored the sync error middleware to catch server functions and serialize errors properly. Let me know if you see any edge cases. Thanks!",
      labels: ["INBOX", "UNREAD"],
      receivedAt: timeAgo(12 * 60 * 60 * 1000), // 12 hours ago
      category: "Work",
      importance: "normal",
    },
    // Thread 12: Slack direct messages
    {
      id: "demo-email-13",
      threadId: "demo-thread-12",
      senderName: "Slack",
      senderEmail: "no-reply@slack.com",
      subject: "3 new notifications in Acme Workspace",
      bodyText: "You have unread direct messages from Sarah Jenkins and Dev Lead in Acme Workspace. Open Slack to read them. Message snippet: 'Did you review the specs?'",
      labels: ["INBOX"],
      receivedAt: timeAgo(10 * 60 * 60 * 1000), // 10 hours ago
      category: "Notification",
      importance: "low",
    },
    // Thread 13: Uber ride (Archived)
    {
      id: "demo-email-14",
      threadId: "demo-thread-13",
      senderName: "Uber Receipts",
      senderEmail: "uber.us@uber.com",
      subject: "Your ride receipt with Uber",
      bodyText: "Thanks for riding, Nithin. Total: $18.42. Date: June 12, 2026. Trip detail from San Francisco to Oakland. Charged to Chase Card ending in 1234.",
      labels: [], // No inbox label = Archived
      receivedAt: timeAgo(3 * 24 * 60 * 60 * 1000), // 3 days ago
      category: "Finance",
      importance: "low",
    },
    // Thread 14: Zoom Invitation (Archived)
    {
      id: "demo-email-15",
      threadId: "demo-thread-14",
      senderName: "Zoom Video",
      senderEmail: "no-reply@zoom.us",
      subject: "Zoom Meeting Invitation - Q2 Retro",
      bodyText: "You are invited to Zoom meeting: Q2 Retro. Time: June 10, 2026 3:00 PM Pacific Time. Join Zoom Meeting link: https://zoom.us/j/123456789.",
      labels: [], // Archived
      receivedAt: timeAgo(5 * 24 * 60 * 60 * 1000), // 5 days ago
      category: "Notification",
      importance: "low",
    },
    // Mock Sent Email 1
    {
      id: "demo-email-sent-1",
      threadId: "demo-thread-sent-1",
      senderName: "Nithin Reddy (Me)",
      senderEmail: "me@repeatless.ai",
      subject: "Follow up: API integration guidelines",
      bodyText: "Hi team,\n\nI sent the updated API integration guidelines last night. Please make sure to read the section on OAuth scope permissions before starting your workspace task.\n\nThanks,\nNithin",
      labels: ["SENT"],
      receivedAt: timeAgo(4 * 60 * 60 * 1000), // 4 hours ago
      category: "Work",
      importance: "normal",
    },
    // Mock Sent Email 2
    {
      id: "demo-email-sent-2",
      threadId: "demo-thread-sent-2",
      senderName: "Nithin Reddy (Me)",
      senderEmail: "me@repeatless.ai",
      subject: "Stripe Technical Interview Availability",
      bodyText: "Hi Recruiting Team,\n\nThanks for reaching out! I've scheduled my 45-minute technical session using the Calendly link for next Tuesday at 2 PM. Looking forward to discussing the role.\n\nBest,\nNithin",
      labels: ["SENT"],
      receivedAt: timeAgo(50 * 60 * 1000), // 50 mins ago
      category: "Job",
      importance: "high",
    }
  ];

  const drafts: DemoDraft[] = [
    {
      id: "demo-draft-1",
      senderName: "Draft to: partners@acme.com",
      senderEmail: "partners@acme.com",
      senderInitials: "AC",
      avatarColor: "oklch(0.38 0.012 250)",
      subject: "Partnership Agreement Review",
      preview: "Hi Partners, I reviewed the draft agreement. There are a few sections we need to adjust, specifically the SLA terms in section 4.",
      body: "Hi Partners,\n\nI reviewed the draft agreement. There are a few sections we need to adjust, specifically the SLA terms in section 4. Let me know when you're available to hop on a quick review call.\n\nBest,\nNithin",
      date: timeAgo(2 * 60 * 60 * 1000), // 2 hours ago
      unread: false,
      starred: false,
      category: "Work",
      importance: "normal",
      labels: ["DRAFT"],
      hasAttachments: false
    },
    {
      id: "demo-draft-2",
      senderName: "Draft to: newsletter-subscribers",
      senderEmail: "",
      senderInitials: "NL",
      avatarColor: "oklch(0.38 0.012 250)",
      subject: "Inbox Harmony Release Notes v1.2",
      preview: "We are excited to announce the release of Inbox Harmony v1.2! This update brings native Gmail drafts sync and a brand new",
      body: "We are excited to announce the release of Inbox Harmony v1.2!\n\nThis update brings native Gmail drafts sync, a brand new Sent Mail view, and stability improvements across all AI pipelines. Let us know what you think!\n\nCheers,\nInbox Harmony Team",
      date: timeAgo(1 * 24 * 60 * 60 * 1000), // 1 day ago
      unread: false,
      starred: false,
      category: "Newsletter",
      importance: "normal",
      labels: ["DRAFT"],
      hasAttachments: false
    }
  ];

  const emailSummaries: Record<string, DemoSummary> = {
    "demo-email-2": {
      email_id: "demo-email-2",
      summary: "Sarah Jenkins suggests scheduling a Roadmap sync-up meeting tomorrow at 10 AM, raising resource allocation needs.",
      key_takeaways: [
        " Roadmaps specs for Q3 were reviewed by Sarah.",
        " Allocation of more developer resources is requested for Supabase sync engine.",
        " Meeting proposed for tomorrow morning at 10 AM."
      ],
      action_items: [
        "Schedule roadmap sync-up call with Sarah Jenkins.",
        "Review resource allocation for the Supabase sync engine."
      ]
    },
    "demo-email-3": {
      email_id: "demo-email-3",
      summary: "Stripe invites Nithin to schedule a 45-minute technical interview for the Senior Fullstack Engineer role.",
      key_takeaways: [
        " Passed the initial vetting stages.",
        " Requested to schedule a 45-minute panel with the technical lead next week."
      ],
      action_items: [
        "Open Stripe's Calendly invite and choose an interview time slot.",
        "Prepare coding and systems design templates."
      ]
    },
    "demo-email-4": {
      email_id: "demo-email-4",
      summary: "Acme Billing requests payment of $4,500.00 within 15 days for consulting services.",
      key_takeaways: [
        " Software consulting and integration invoice INV-2026-0041 has been issued.",
        " Total due is $4,500.00.",
        " Due date is in 15 days."
      ],
      action_items: [
        "Process invoice payment via the portal.",
        "Update the finance tracker with consulting expense."
      ]
    },
    "demo-email-5": {
      email_id: "demo-email-5",
      summary: "TLDR Newsletter summarizes Apple's new generative models, WebAssembly's edge adoption, and the release of Vite 7.",
      key_takeaways: [
        " Apple's AI models focus on offline tasks and on-device execution.",
        " WebAssembly runtimes are growing in serverless edge frameworks.",
        " Vite 7 utilizes Rust compilers to speed up builds by 50%."
      ],
      action_items: []
    },
    "demo-email-6": {
      email_id: "demo-email-6",
      summary: "David Miller proposes Yosemite hiking trip this Saturday and coordinates driving and snacks.",
      key_takeaways: [
        " Yosemite trip planned for Saturday.",
        " David offers to pick Nithin up or coordinate drivers."
      ],
      action_items: [
        "Reply to David about driving coordination.",
        "Check Saturday weather forecasts."
      ]
    }
  };

  const threadSummaries: Record<string, DemoThreadSummary> = {
    "demo-thread-1": {
      thread_id: "demo-thread-1",
      summary: "Sarah Jenkins initiated the Q3 roadmap specification plans and later proposed a sync meeting for tomorrow at 10 AM to discuss increasing developer allocation to the Supabase sync pipeline.",
      key_decisions: [
        "Sarah agrees with the overall roadmap phase 1 timeline."
      ],
      action_items: [
        "Confirm roadmap meeting availability for tomorrow at 10 AM.",
        "Formulate resource options for Supabase sync engineering."
      ],
      participants: ["Sarah Jenkins"]
    }
  };

  const agentChat = [
    {
      role: "assistant" as const,
      content: "Hello Nithin! I've indexed your mock inbox. You have 5 unread threads (Work, Job, Finance, Personal) and a total of 13 active emails. How can I help you digest your mail today?",
    }
  ];

  return {
    emails,
    drafts,
    emailSummaries,
    threadSummaries,
    agentChat,
  };
}

// Check if demo mode is enabled
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_FLAG_KEY) === "true";
}

// Enter demo mode and reset database
export function enterDemoMode(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_FLAG_KEY, "true");
  initializeDemoDb(true);
}

// Exit demo mode and clean up
export function exitDemoMode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_FLAG_KEY);
  localStorage.removeItem(DEMO_DB_KEY);
}

// Initialize the demo database
export function initializeDemoDb(force = false): DemoDb {
  if (typeof window === "undefined") return createInitialDb();
  
  const existing = localStorage.getItem(DEMO_DB_KEY);
  if (existing && !force) {
    try {
      return JSON.parse(existing);
    } catch {
      // corrupt, regenerate
    }
  }
  
  const db = createInitialDb();
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  return db;
}

// Write the database back to localStorage
function saveDb(db: DemoDb): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
}

// Helper to map emails into UI format
export function mapDemoEmail(email: DemoEmail) {
  const palette = [
    "oklch(0.34 0.055 255)",
    "oklch(0.42 0.062 155)",
    "oklch(0.55 0.13 45)",
    "oklch(0.72 0.12 78)",
    "oklch(0.48 0.014 250)",
    "oklch(0.55 0.06 255)",
  ];

  let hash = 0;
  const name = email.senderName;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const avatarColor = palette[Math.abs(hash) % palette.length];

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??";

  const labels = email.labels;
  const unread = labels.map(l => l.toUpperCase()).includes("UNREAD");
  const starred = labels.map(l => l.toUpperCase()).includes("STARRED");

  return {
    id: email.id,
    threadId: email.threadId,
    senderName: name,
    senderEmail: email.senderEmail,
    senderInitials: initials,
    avatarColor,
    subject: email.subject,
    bodyText: email.bodyText,
    body: email.bodyText,
    preview: email.bodyText ? email.bodyText.slice(0, 120) : "",
    labels,
    receivedAt: email.receivedAt,
    date: email.receivedAt,
    category: email.category,
    importance: email.importance,
    unread,
    starred,
  };
}

// Query mock emails for Inbox page
export function getDemoInboxEmails(params: { filter: string; sort: string; search: string; page: number }) {
  const db = initializeDemoDb();
  let list = db.emails.filter(e => e.labels.includes("INBOX"));

  // Apply search
  if (params.search && params.search.trim()) {
    const q = params.search.toLowerCase().trim();
    list = list.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.senderName.toLowerCase().includes(q) ||
      e.bodyText.toLowerCase().includes(q)
    );
  }

  // Apply filter
  if (params.filter === "Unread") {
    list = list.filter(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD"));
  } else if (params.filter !== "All") {
    list = list.filter(e => e.category === params.filter);
  }

  // Apply sorting
  if (params.sort === "oldest") {
    list.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  } else if (params.sort === "unread") {
    list.sort((a, b) => {
      const aUnread = a.labels.map(l => l.toUpperCase()).includes("UNREAD");
      const bUnread = b.labels.map(l => l.toUpperCase()).includes("UNREAD");
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  } else {
    // default: newest first
    list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  // Get unread counts
  const unreadCount = db.emails.filter(e => e.labels.includes("INBOX") && e.labels.map(l => l.toUpperCase()).includes("UNREAD")).length;

  const pageSize = 50;
  const offset = params.page * pageSize;
  const paginated = list.slice(offset, offset + pageSize);
  const nextCursor = list.length > offset + pageSize ? `demo-offset:${offset + pageSize}` : null;

  return Promise.resolve({
    emails: paginated.map(mapDemoEmail),
    totalCount: list.length,
    unreadCount,
    nextCursor,
  });
}

// Query mock emails for Archived page
export function getDemoArchivedEmails(params: { filter: string; sort: string; search: string; page: number }) {
  const db = initializeDemoDb();
  // Archived emails have no INBOX and no TRASH label
  let list = db.emails.filter(e => !e.labels.includes("INBOX") && !e.labels.includes("TRASH"));

  // Apply search
  if (params.search && params.search.trim()) {
    const q = params.search.toLowerCase().trim();
    list = list.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.senderName.toLowerCase().includes(q) ||
      e.bodyText.toLowerCase().includes(q)
    );
  }

  // Apply filter
  if (params.filter === "Unread") {
    list = list.filter(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD"));
  } else if (params.filter !== "All") {
    list = list.filter(e => e.category === params.filter);
  }

  // Apply sorting
  if (params.sort === "oldest") {
    list.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  } else {
    list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  const pageSize = 50;
  const offset = params.page * pageSize;
  const paginated = list.slice(offset, offset + pageSize);
  const nextCursor = list.length > offset + pageSize ? `demo-offset:${offset + pageSize}` : null;

  return Promise.resolve({
    emails: paginated.map(e => ({
      id: e.id,
      threadId: e.threadId,
      fromAddress: e.senderEmail,
      senderName: e.senderName,
      subject: e.subject,
      bodyText: e.bodyText,
      labels: e.labels,
      receivedAt: e.receivedAt,
      category: e.category,
    })),
    totalCount: list.length,
    nextCursor,
  });
}

// Query mock threads list
export function getDemoThreads(params: { page: number }) {
  const db = initializeDemoDb();
  // Group emails by threadId
  const threadMap = new Map<string, DemoEmail[]>();
  db.emails.forEach(e => {
    if (e.labels.includes("INBOX")) {
      const existing = threadMap.get(e.threadId) || [];
      existing.push(e);
      threadMap.set(e.threadId, existing);
    }
  });

  const threads = Array.from(threadMap.entries()).map(([threadId, emails]) => {
    // Sort emails in thread to find latest message
    emails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    const latest = emails[0];
    const isUnread = emails.some(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD"));

    return {
      id: threadId,
      subject: latest.subject,
      snippet: latest.bodyText.substring(0, 120),
      messageCount: emails.length,
      lastMessageAt: latest.receivedAt,
      isUnread,
      category: latest.category,
      participants: Array.from(new Set(emails.map(e => e.senderName))),
    };
  });

  // Sort threads by latest message
  threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  const pageSize = 20;
  const offset = params.page * pageSize;
  const paginated = threads.slice(offset, offset + pageSize);
  const nextCursor = threads.length > offset + pageSize ? `demo-thread-offset:${offset + pageSize}` : null;

  return Promise.resolve({
    threads: paginated,
    nextCursor,
    totalCount: threads.length,
  });
}

// Retrieve single mock thread details
export function getDemoThreadDetail(threadId: string) {
  const db = initializeDemoDb();
  const emails = db.emails.filter(e => e.threadId === threadId);
  emails.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  if (emails.length === 0) return null;

  const firstMsg = emails[0];
  const summaryObj = db.threadSummaries[threadId] || {
    thread_id: threadId,
    summary: "Roadmap discussions and items context.",
    key_decisions: [],
    action_items: [],
    participants: [firstMsg.senderName]
  };

  const messages = emails.map(e => {
    const isUnread = e.labels.map(l => l.toUpperCase()).includes("UNREAD");
    const initials = e.senderName.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return {
      id: e.id,
      senderName: e.senderName,
      senderEmail: e.senderEmail,
      senderInitials: initials,
      avatarColor: "oklch(0.34 0.055 255)",
      subject: e.subject,
      body: e.bodyText,
      date: e.receivedAt,
      unread: isUnread,
    };
  });

  const participants = Array.from(new Set(emails.map(e => e.senderName)));
  const insights = summaryObj.key_decisions && summaryObj.action_items && (summaryObj.key_decisions.length > 0 || summaryObj.action_items.length > 0)
    ? [
        ...summaryObj.key_decisions.map((d: string) => `Decision: ${d}`),
        ...summaryObj.action_items.map((a: string) => `Action Item: ${a}`)
      ]
    : [
        `Thread consists of ${emails.length} emails`,
        `Involves ${participants.length} unique participants: ${participants.join(", ")}`,
        `Last activity registered at ${emails[emails.length - 1]?.receivedAt ? new Date(emails[emails.length - 1].receivedAt).toLocaleString() : "unknown"}`
      ];

  return {
    id: threadId,
    subject: firstMsg.subject,
    category: firstMsg.category,
    summary: summaryObj.summary,
    keyDecisions: summaryObj.key_decisions,
    actionItems: summaryObj.action_items,
    messages,
    participants,
    insights,
  };
}

// Mutator: Archive mock emails
export function demoArchiveEmails(emailIds: string[]) {
  const db = initializeDemoDb();
  let count = 0;
  db.emails = db.emails.map(e => {
    if (emailIds.includes(e.id)) {
      count++;
      return {
        ...e,
        labels: e.labels.filter(l => l !== "INBOX")
      };
    }
    return e;
  });
  saveDb(db);
  return Promise.resolve({ success: true, count });
}

// Mutator: Delete mock emails (Move to Trash)
export function demoDeleteEmails(emailIds: string[]) {
  const db = initializeDemoDb();
  let count = 0;
  db.emails = db.emails.map(e => {
    if (emailIds.includes(e.id)) {
      count++;
      return {
        ...e,
        labels: [...new Set([...e.labels.filter(l => l !== "INBOX"), "TRASH"])]
      };
    }
    return e;
  });
  saveDb(db);
  return Promise.resolve({ success: true, count });
}

// Mutator: Restore mock emails (Add to Inbox)
export function demoRestoreEmails(emailIds: string[]) {
  const db = initializeDemoDb();
  let count = 0;
  db.emails = db.emails.map(e => {
    if (emailIds.includes(e.id)) {
      count++;
      return {
        ...e,
        labels: [...new Set([...e.labels.filter(l => l !== "TRASH"), "INBOX"])]
      };
    }
    return e;
  });
  saveDb(db);
  return Promise.resolve({ success: true, count });
}

// Mutator: Permanent delete
export function demoPermanentlyDeleteEmails(emailIds: string[]) {
  const db = initializeDemoDb();
  const initialLength = db.emails.length;
  db.emails = db.emails.filter(e => !emailIds.includes(e.id));
  saveDb(db);
  return Promise.resolve({ success: true, count: initialLength - db.emails.length });
}

// Mutator: Mark read
export function demoMarkEmailsRead(emailIds: string[]) {
  const db = initializeDemoDb();
  let count = 0;
  db.emails = db.emails.map(e => {
    if (emailIds.includes(e.id) && e.labels.includes("UNREAD")) {
      count++;
      return {
        ...e,
        labels: e.labels.filter(l => l !== "UNREAD")
      };
    }
    return e;
  });
  saveDb(db);
  return Promise.resolve({ success: true, count });
}

// Mutator: Categorize
export function demoCategorizeEmails(emailIds: string[], category: any) {
  const db = initializeDemoDb();
  let count = 0;
  db.emails = db.emails.map(e => {
    if (emailIds.includes(e.id)) {
      count++;
      return {
        ...e,
        category,
      };
    }
    return e;
  });
  saveDb(db);
  return Promise.resolve({ success: true, count });
}

// Query mock Dashboard data
export function getDemoDashboardData() {
  const db = initializeDemoDb();
  const activeEmails = db.emails.filter(e => e.labels.includes("INBOX"));

  const total = activeEmails.length;
  const unread = activeEmails.filter(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD")).length;
  const threads = new Set(activeEmails.map(e => e.threadId)).size;
  const newsletters = activeEmails.filter(e => e.category === "Newsletter").length;

  const emailSummariesCount = Object.keys(db.emailSummaries).length;
  const threadSummariesCount = Object.keys(db.threadSummaries).length;

  // Pie chart categories distribution
  const categories = ["Work", "Newsletter", "Job", "Finance", "Personal", "Notification"];
  const categoryDistribution = categories.map(cat => ({
    name: cat,
    value: activeEmails.filter(e => e.category === cat).length
  })).filter(c => c.value > 0);

  // Weekly volume simulation (last 7 days)
  const weeklyVolume = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toLocaleDateString("en-US", { weekday: "short" });
    return {
      day: dayStr,
      work: i === 6 ? 4 : Math.floor(Math.random() * 5) + 1,
      newsletters: i === 6 ? 2 : Math.floor(Math.random() * 3) + 1,
      other: i === 6 ? 1 : Math.floor(Math.random() * 2),
    };
  });

  // Recent emails lists
  const recentEmails = activeEmails
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, 5)
    .map(mapDemoEmail);

  // Priority emails lists
  const priorityEmails = activeEmails
    .filter(e => e.importance === "high")
    .slice(0, 5)
    .map(mapDemoEmail);

  return {
    stats: {
      total,
      unread,
      categorized: activeEmails.length,
      threads,
      summaries: emailSummariesCount + threadSummariesCount,
      newsletters,
    },
    weeklyVolume,
    categoryDistribution,
    recentEmails,
    priorityEmails,
    cacheKey: "demo-cache-key-" + Date.now(),
  };
}

// Query summaries list (Summaries page)
export function getDemoSummaries() {
  const db = initializeDemoDb();
  
  const threadSummaries = Array.from(Object.entries(db.threadSummaries)).map(([threadId, s]) => {
    const threadEmails = db.emails.filter(e => e.threadId === threadId);
    const date = threadEmails.length > 0 ? threadEmails[threadEmails.length - 1].receivedAt : new Date().toISOString();
    const firstEmail = threadEmails[0];
    const unread = threadEmails.some(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD"));
    return {
      id: threadId,
      threadId,
      title: firstEmail ? firstEmail.subject : "Mock Conversation Thread",
      summary: s.summary,
      date,
      category: firstEmail ? firstEmail.category : "Work",
      source: "Thread",
      unread,
    };
  });

  const emailSummaries = Array.from(Object.entries(db.emailSummaries)).map(([emailId, s]) => {
    const email = db.emails.find(e => e.id === emailId);
    const date = email ? email.receivedAt : new Date().toISOString();
    const unread = email ? email.labels.map(l => l.toUpperCase()).includes("UNREAD") : false;
    return {
      id: emailId,
      threadId: email ? email.threadId : "mock-thread",
      title: email ? email.subject : "Mock Email Message",
      summary: s.summary,
      date,
      category: email ? email.category : "Work",
      source: "Single Email",
      unread,
    };
  });

  return Promise.resolve({
    threadSummaries,
    emailSummaries,
    totalThreadSummaries: threadSummaries.length,
    totalEmailSummaries: emailSummaries.length,
    remainingEmails: 0,
    remainingThreads: 0,
  });
}

// Query newsletter senders (Newsletters page)
export function getDemoNewsletters() {
  const db = initializeDemoDb();
  const newsletters = db.emails.filter(e => e.category === "Newsletter");
  
  const senderMap = new Map<string, typeof newsletters>();
  newsletters.forEach(n => {
    const list = senderMap.get(n.senderEmail) || [];
    list.push(n);
    senderMap.set(n.senderEmail, list);
  });

  const mapped = Array.from(senderMap.entries()).map(([email, items]) => {
    items.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    const latest = items[0];
    const summary = db.emailSummaries[latest.id]?.summary || "Monthly digest of technical publications.";
    const keyTakeaways = db.emailSummaries[latest.id]?.key_takeaways || [
      "Covers recent design patterns.",
      "Engineering culture tips."
    ];
    const unread = items.some(e => e.labels.map(l => l.toUpperCase()).includes("UNREAD"));
    
    return {
      id: email,
      name: latest.senderName,
      author: email,
      cadence: `${items.length} email${items.length !== 1 ? "s" : ""}`,
      date: latest.receivedAt,
      lastIssue: latest.subject,
      unread,
      extracted: keyTakeaways.length > 0 ? keyTakeaways : [summary],
      avatarColor: "oklch(0.34 0.055 255)",
    };
  });

  return Promise.resolve({
    newsletters: mapped,
    emails: newsletters.map(mapDemoEmail),
  });
}

// Mutator: Send a compose message in Demo mode
export function demoSendMessage(payload: { to: string; subject: string; body: string; threadId?: string; draftId?: string }) {
  const db = initializeDemoDb();
  
  const newEmailId = "demo-email-sent-" + Date.now();
  const threadId = payload.threadId || "demo-thread-sent-" + Date.now();

  const newEmail: DemoEmail = {
    id: newEmailId,
    threadId,
    senderName: "Nithin Reddy (Me)",
    senderEmail: "me@repeatless.ai",
    subject: payload.subject,
    bodyText: payload.body,
    labels: ["SENT"],
    receivedAt: new Date().toISOString(),
    category: "Work",
    importance: "normal",
  };

  db.emails.push(newEmail);
  
  if (payload.draftId && db.drafts) {
    db.drafts = db.drafts.filter(d => d.id !== payload.draftId);
  }
  
  saveDb(db);

  return Promise.resolve({ success: true, messageId: newEmailId });
}

// Retrieve Chatbot RAG Response (AI Agent Page)
export function getDemoAgentResponse(query: string, history: any[]) {
  const db = initializeDemoDb();
  const cleanQuery = query.toLowerCase();

  let replyText = "";
  let sources: any[] = [];

  if (cleanQuery.includes("unread") || cleanQuery.includes("new")) {
    const unreadEmails = db.emails.filter(e => e.labels.includes("INBOX") && e.labels.includes("UNREAD"));
    if (unreadEmails.length > 0) {
      replyText = `You have ${unreadEmails.length} unread email(s) in your inbox. Here are the key highlights:\n\n` +
        unreadEmails.map(e => `• **${e.senderName}** (${e.category}): "${e.subject}" — ${db.emailSummaries[e.id]?.summary || e.bodyText.substring(0, 80) + "..."}`).join("\n");
      sources = unreadEmails.slice(0, 3).map(mapDemoEmail);
    } else {
      replyText = "You have no unread emails! Your inbox is fully synchronized and up to date.";
    }
  } else if (cleanQuery.includes("roadmap") || cleanQuery.includes("sarah")) {
    const roadmapEmails = db.emails.filter(e => e.threadId === "demo-thread-1");
    replyText = "Based on Sarah Jenkins' emails, she has reviewed the Q3 roadmap drafts. While she agrees with phase 1, she is requesting additional engineering allocations for the Supabase sync engine. She proposed a roadmap alignment meeting tomorrow at 10 AM.";
    sources = roadmapEmails.map(mapDemoEmail);
  } else if (cleanQuery.includes("stripe") || cleanQuery.includes("interview") || cleanQuery.includes("job")) {
    const stripeEmail = db.emails.find(e => e.id === "demo-email-3");
    replyText = "Stripe's recruitment team has reached out asking you to schedule a 45-minute technical interview with their engineering lead for next week. You have a pending action item to click their Calendly link.";
    if (stripeEmail) {
      sources = [mapDemoEmail(stripeEmail)];
    }
  } else if (cleanQuery.includes("invoice") || cleanQuery.includes("invoice") || cleanQuery.includes("bill") || cleanQuery.includes("billing")) {
    const invoiceEmail = db.emails.find(e => e.id === "demo-email-4");
    replyText = "You received an invoice INV-2026-0041 from Acme Billing for software consulting services. The total due is $4,500.00, due within 15 days.";
    if (invoiceEmail) {
      sources = [mapDemoEmail(invoiceEmail)];
    }
  } else {
    replyText = "I found matches for your request in your correspondence. Acme Billing sent an invoice for $4,500.00 due in 15 days, and Sarah Jenkins wants to meet tomorrow at 10 AM to discuss Q3 Roadmap resources. Let me know if you would like me to draft replies or summarize specific threads.";
    sources = db.emails.filter(e => ["demo-email-2", "demo-email-4"].includes(e.id)).map(mapDemoEmail);
  }

  // Persist user chat and model response
  const userMsg = { role: "user" as const, content: query };
  const assistantMsg = { role: "assistant" as const, content: replyText, sources };
  db.agentChat.push(userMsg);
  db.agentChat.push(assistantMsg);
  saveDb(db);

  return Promise.resolve(assistantMsg);
}

// Retrieve chat history
export function getDemoAgentHistory() {
  const db = initializeDemoDb();
  return Promise.resolve({
    sessions: [
      { id: "demo-session-1", title: "Recent Emails Digest", date: timeAgo(1 * 60 * 60 * 1000) },
      { id: "demo-session-2", title: "Q3 Project Alignment", date: timeAgo(24 * 60 * 60 * 1000) }
    ],
    activeSessionId: "demo-session-1",
    messages: db.agentChat
  });
}

// Query mock emails for Search page
export function getDemoSearchEmails(params: {
  query?: string;
  sender?: string;
  label?: string;
  dateRange?: string;
  categories?: string[];
  page: number;
}) {
  const db = initializeDemoDb();
  let list = db.emails;

  // Apply query (keyword search)
  if (params.query && params.query.trim()) {
    const q = params.query.toLowerCase().trim();
    list = list.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.senderName.toLowerCase().includes(q) ||
      e.bodyText.toLowerCase().includes(q)
    );
  }

  // Apply sender filter
  if (params.sender && params.sender.trim()) {
    const s = params.sender.toLowerCase().trim();
    list = list.filter(e =>
      e.senderName.toLowerCase().includes(s) ||
      e.senderEmail.toLowerCase().includes(s)
    );
  }

  // Apply label filter
  if (params.label && params.label.trim()) {
    const l = params.label.toUpperCase().trim();
    list = list.filter(e => e.labels.map(lbl => lbl.toUpperCase()).includes(l));
  }

  // Apply categories filter
  if (params.categories && params.categories.length > 0) {
    list = list.filter(e => params.categories!.includes(e.category));
  }

  // Apply date range filter
  if (params.dateRange && params.dateRange !== "All time") {
    const now = Date.now();
    let limitMs = 0;
    if (params.dateRange === "Today") {
      limitMs = 24 * 60 * 60 * 1000;
    } else if (params.dateRange === "This week") {
      limitMs = 7 * 24 * 60 * 60 * 1000;
    } else if (params.dateRange === "This month") {
      limitMs = 30 * 24 * 60 * 60 * 1000;
    } else if (params.dateRange === "Last 90 days") {
      limitMs = 90 * 24 * 60 * 60 * 1000;
    }
    if (limitMs > 0) {
      list = list.filter(e => now - new Date(e.receivedAt).getTime() <= limitMs);
    }
  }

  // Sort newest first
  list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  const pageSize = 50;
  const offset = params.page * pageSize;
  const paginated = list.slice(offset, offset + pageSize);
  const nextCursor = list.length > offset + pageSize ? `demo-search-offset:${offset + pageSize}` : null;

  return Promise.resolve({
    emails: paginated.map(mapDemoEmail),
    totalCount: list.length,
    nextCursor,
  });
}

export function getDemoSentEmails(params: {
  query?: string;
  category?: string;
  sort?: "newest" | "oldest";
  page: number;
}) {
  const db = initializeDemoDb();
  let list = db.emails.filter(e => e.labels.map(l => l.toUpperCase()).includes("SENT"));

  if (params.query && params.query.trim()) {
    const q = params.query.toLowerCase().trim();
    list = list.filter(e =>
      e.subject.toLowerCase().includes(q) ||
      e.senderName.toLowerCase().includes(q) ||
      e.bodyText.toLowerCase().includes(q)
    );
  }

  if (params.category && params.category !== "All") {
    list = list.filter(e => e.category === params.category);
  }

  const newest = params.sort !== "oldest";
  list.sort((a, b) => {
    const timeA = new Date(a.receivedAt).getTime();
    const timeB = new Date(b.receivedAt).getTime();
    return newest ? timeB - timeA : timeA - timeB;
  });

  const pageSize = 50;
  const offset = params.page * pageSize;
  const paginated = list.slice(offset, offset + pageSize);
  const nextCursor = list.length > offset + pageSize ? `demo-sent-offset:${offset + pageSize}` : null;

  return Promise.resolve({
    emails: paginated.map(mapDemoEmail),
    totalCount: list.length,
    nextCursor,
  });
}

export function getDemoDrafts() {
  const db = initializeDemoDb();
  const list = db.drafts || [];
  return Promise.resolve({
    drafts: list
  });
}

export function demoDeleteDrafts(draftIds: string[]) {
  const db = initializeDemoDb();
  if (db.drafts) {
    db.drafts = db.drafts.filter(d => !draftIds.includes(d.id));
    saveDb(db);
  }
  return Promise.resolve({ success: true });
}

export function demoSaveDraft(payload: { to: string; cc?: string; subject: string; body: string; draftId?: string }) {
  const db = initializeDemoDb();
  if (!db.drafts) {
    db.drafts = [];
  }
  
  const draftId = payload.draftId || "demo-draft-" + Date.now();
  const existingIndex = db.drafts.findIndex(d => d.id === draftId);
  
  const toClean = payload.to || "";
  const name = toClean ? `Draft to: ${toClean}` : "Draft (No Recipient)";
  
  const draftItem = {
    id: draftId,
    senderName: name,
    senderEmail: toClean,
    senderInitials: toClean ? toClean.split("@")[0].slice(0, 2).toUpperCase() : "DR",
    avatarColor: "oklch(0.38 0.012 250)",
    subject: payload.subject || "(No Subject)",
    preview: payload.body ? payload.body.slice(0, 120) : "",
    body: payload.body,
    date: new Date().toISOString(),
    unread: false,
    starred: false,
    category: "Personal",
    importance: "normal",
    labels: ["DRAFT"],
    hasAttachments: false
  };

  if (existingIndex > -1) {
    db.drafts[existingIndex] = draftItem;
  } else {
    db.drafts.push(draftItem);
  }
  
  saveDb(db);
  return Promise.resolve({ success: true, draftId });
}
