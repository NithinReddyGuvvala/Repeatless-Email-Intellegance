export type Category =
  | "Work"
  | "Newsletter"
  | "Job"
  | "Finance"
  | "Personal"
  | "Notification";

export type Importance = "high" | "normal" | "low";

export interface Email {
  id: string;
  threadId: string;
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
  category: Category;
  importance: Importance;
  labels: string[];
  hasAttachments?: boolean;
  summary?: string;
}

export interface Thread {
  id: string;
  subject: string;
  participants: string[];
  messages: Email[];
  category: Category;
  summary: string;
  insights: string[];
  lastActivity: string;
}

const palette = [
  "oklch(0.34 0.055 255)",
  "oklch(0.42 0.062 155)",
  "oklch(0.55 0.13 45)",
  "oklch(0.72 0.12 78)",
  "oklch(0.48 0.014 250)",
  "oklch(0.55 0.06 255)",
];

function color(i: number) {
  return palette[i % palette.length];
}

export const emails: Email[] = [
  {
    id: "e1",
    threadId: "t1",
    senderName: "Eleanor Whitfield",
    senderEmail: "eleanor@acmecorp.com",
    senderInitials: "EW",
    avatarColor: color(0),
    subject: "Q4 strategy review — final agenda",
    preview:
      "Attaching the deck for tomorrow. I've folded in the regional notes and moved the pricing discussion earlier so we…",
    body: `Hi team,\n\nAttaching the deck for tomorrow's Q4 review. I've folded in the regional notes from Sofia and moved the pricing discussion earlier so we have room to debate the EMEA expansion properly.\n\nThree things I'd like decisions on:\n\n1. Whether we commit to the Berlin office in Q1 or wait until earnings.\n2. The renewal terms for Helios — Marcus has prepared two scenarios.\n3. Headcount approvals for engineering.\n\nPlease come prepared. Talk tomorrow,\nEleanor`,
    date: "2025-06-17T09:14:00Z",
    unread: true,
    starred: true,
    category: "Work",
    importance: "high",
    labels: ["Leadership", "Q4"],
    hasAttachments: true,
    summary:
      "Eleanor shares the final Q4 review agenda. Three decisions needed: Berlin office timing, Helios renewal terms, and engineering headcount.",
  },
  {
    id: "e2",
    threadId: "t2",
    senderName: "Stripe",
    senderEmail: "receipts@stripe.com",
    senderInitials: "ST",
    avatarColor: color(2),
    subject: "Your May invoice is ready — $4,820.00",
    preview:
      "Thanks for using Stripe. Your May invoice for Repeatless Labs is attached and was paid automatically.",
    body: "Your May invoice for Repeatless Labs is attached and was paid automatically. View in dashboard for line items.",
    date: "2025-06-16T22:01:00Z",
    unread: false,
    starred: false,
    category: "Finance",
    importance: "normal",
    labels: ["Billing"],
    summary: "Stripe May invoice of $4,820.00 paid automatically.",
  },
  {
    id: "e3",
    threadId: "t3",
    senderName: "Marcus Chen",
    senderEmail: "marcus@helios.io",
    senderInitials: "MC",
    avatarColor: color(1),
    subject: "Re: Migration project — Kubernetes timeline",
    preview:
      "Quick update on the migration. We've finished the staging cutover and the new cluster has been stable for 11 days…",
    body: `Hey,\n\nQuick update on the migration. We've finished the staging cutover and the new cluster has been stable for 11 days. I'd like to schedule the production switch for the 28th — early morning window, four-hour budget.\n\nA few notes:\n• Postgres replication lag is steady at ~50ms.\n• We're keeping the legacy cluster warm for 30 days post-cutover.\n• Cost projection is tracking 18% under budget.\n\nLet me know if the 28th works. Otherwise the next clean window is July 12.\n\n— Marcus`,
    date: "2025-06-16T15:42:00Z",
    unread: true,
    starred: false,
    category: "Work",
    importance: "high",
    labels: ["Engineering", "Migration"],
    summary:
      "Migration staging stable for 11 days. Marcus proposes production cutover on June 28, four-hour window, costs tracking 18% under budget.",
  },
  {
    id: "e4",
    threadId: "t4",
    senderName: "Stratechery",
    senderEmail: "ben@stratechery.com",
    senderInitials: "ST",
    avatarColor: color(3),
    subject: "The Vertical Compute Bet",
    preview:
      "Three companies announced custom silicon strategies this week, and the pattern is becoming impossible to ignore…",
    body: "Newsletter content about vertical integration in AI compute.",
    date: "2025-06-16T11:00:00Z",
    unread: true,
    starred: false,
    category: "Newsletter",
    importance: "low",
    labels: ["Tech"],
    summary:
      "Three major firms announced custom silicon strategies this week, signaling a vertical compute shift across AI infrastructure.",
  },
  {
    id: "e5",
    threadId: "t5",
    senderName: "Linear",
    senderEmail: "noreply@linear.app",
    senderInitials: "LN",
    avatarColor: color(4),
    subject: "3 issues assigned to you in Repeatless",
    preview:
      "ENG-412 Refactor sync worker · ENG-415 Add pgvector index · ENG-419 Investigate Gmail rate limit handling",
    body: "Issue digest from Linear.",
    date: "2025-06-16T08:33:00Z",
    unread: false,
    starred: false,
    category: "Notification",
    importance: "normal",
    labels: ["Linear"],
  },
  {
    id: "e6",
    threadId: "t6",
    senderName: "Priya Raman",
    senderEmail: "priya.raman@northwind.vc",
    senderInitials: "PR",
    avatarColor: color(5),
    subject: "Following up on our intro chat",
    preview:
      "Lovely to meet you yesterday. As mentioned, I'd love to dig deeper into the email intelligence thesis — would the…",
    body: `Lovely to meet you yesterday. As mentioned, I'd love to dig deeper into the email intelligence thesis. Would the following week work for a 45-minute follow-up?\n\nIf helpful, I can also loop in our research partner who has been mapping the productivity-AI landscape.\n\nWarmly,\nPriya`,
    date: "2025-06-15T18:22:00Z",
    unread: false,
    starred: true,
    category: "Work",
    importance: "high",
    labels: ["Investors"],
    summary:
      "Priya from Northwind wants a 45-min follow-up next week and can loop in their productivity-AI research partner.",
  },
  {
    id: "e7",
    threadId: "t7",
    senderName: "Atlas Talent",
    senderEmail: "no-reply@atlastalent.com",
    senderInitials: "AT",
    avatarColor: color(0),
    subject: "Update on your application — Senior Product Engineer",
    preview:
      "Thank you for your interest in Atlas. After careful consideration, we've decided to move forward with other candidates…",
    body: "Application rejection notice.",
    date: "2025-06-15T14:09:00Z",
    unread: false,
    starred: false,
    category: "Job",
    importance: "normal",
    labels: ["Application"],
    summary: "Atlas Talent has rejected the Senior Product Engineer application.",
  },
  {
    id: "e8",
    threadId: "t8",
    senderName: "Mom",
    senderEmail: "mom@family.net",
    senderInitials: "MO",
    avatarColor: color(2),
    subject: "Dad's birthday weekend",
    preview:
      "Just confirming you're driving up Friday evening? I'll have the guest room ready and your sister lands at 6.",
    body: "Family logistics for the weekend.",
    date: "2025-06-15T08:14:00Z",
    unread: false,
    starred: true,
    category: "Personal",
    importance: "normal",
    labels: ["Family"],
  },
  {
    id: "e9",
    threadId: "t1",
    senderName: "Sofia Larsen",
    senderEmail: "sofia@acmecorp.com",
    senderInitials: "SL",
    avatarColor: color(1),
    subject: "Re: Q4 strategy review — final agenda",
    preview:
      "Eleanor — one note on EMEA: the Madrid team needs an answer on the office decision before they renew their lease…",
    body: `Eleanor — one note on EMEA: the Madrid team needs an answer on the Berlin office decision before they renew their Madrid lease on July 3. Worth flagging that as a hard deadline.\n\nOtherwise the agenda looks tight. See everyone tomorrow.\n\n— Sofia`,
    date: "2025-06-17T10:02:00Z",
    unread: true,
    starred: false,
    category: "Work",
    importance: "high",
    labels: ["Leadership", "Q4"],
  },
  {
    id: "e10",
    threadId: "t9",
    senderName: "Lenny's Newsletter",
    senderEmail: "lenny@substack.com",
    senderInitials: "LN",
    avatarColor: color(3),
    subject: "How the best PMs run their inbox",
    preview:
      "I asked 40 senior PMs how they manage email. Three patterns emerged, and one of them surprised me.",
    body: "Newsletter on inbox workflows.",
    date: "2025-06-14T07:00:00Z",
    unread: false,
    starred: false,
    category: "Newsletter",
    importance: "low",
    labels: ["Product"],
    summary:
      "Three inbox patterns from 40 senior PMs: batched triage, single-tab discipline, and weekly archive sweeps.",
  },
];

export const threads: Thread[] = [
  {
    id: "t1",
    subject: "Q4 strategy review — final agenda",
    participants: ["Eleanor Whitfield", "Sofia Larsen", "You"],
    messages: [emails[0], emails[8]],
    category: "Work",
    summary:
      "Eleanor circulated the final Q4 agenda with three open decisions. Sofia flagged a hard deadline: Madrid lease renewal on July 3 depends on the Berlin office call.",
    insights: [
      "Decision required before July 3 on the Berlin office (drives Madrid lease).",
      "Helios renewal scenarios prepared by Marcus need review.",
      "Engineering headcount approval still pending.",
    ],
    lastActivity: "2025-06-17T10:02:00Z",
  },
  {
    id: "t3",
    subject: "Migration project — Kubernetes timeline",
    participants: ["Marcus Chen", "You"],
    messages: [emails[2]],
    category: "Work",
    summary:
      "Staging cutover complete and stable for 11 days. Marcus proposes production switch June 28 with a four-hour window, or July 12 as fallback.",
    insights: [
      "Production cutover target: June 28, 04:00 window.",
      "Postgres replication lag steady at ~50ms.",
      "Cost projection 18% under budget.",
    ],
    lastActivity: "2025-06-16T15:42:00Z",
  },
];

export const categories: { name: Category; count: number; description: string }[] = [
  { name: "Work", count: 412, description: "Direct work threads, leadership, and project updates." },
  { name: "Newsletter", count: 186, description: "Curated reading from publications you subscribe to." },
  { name: "Job", count: 24, description: "Recruiter outreach and application correspondence." },
  { name: "Finance", count: 73, description: "Invoices, receipts, and statements." },
  { name: "Personal", count: 58, description: "Friends, family, and personal correspondence." },
  { name: "Notification", count: 209, description: "System notifications from tools and services." },
];

export const dashboardStats = {
  total: 12480,
  unread: 184,
  categorized: 11920,
  threads: 2104,
  summaries: 642,
  newsletters: 186,
};

export const weeklyVolume = [
  { day: "Mon", received: 142, sent: 28 },
  { day: "Tue", received: 188, sent: 41 },
  { day: "Wed", received: 164, sent: 36 },
  { day: "Thu", received: 201, sent: 52 },
  { day: "Fri", received: 173, sent: 44 },
  { day: "Sat", received: 62, sent: 9 },
  { day: "Sun", received: 48, sent: 6 },
];

export const categoryDistribution = [
  { name: "Work", value: 412 },
  { name: "Newsletter", value: 186 },
  { name: "Notification", value: 209 },
  { name: "Finance", value: 73 },
  { name: "Personal", value: 58 },
  { name: "Job", value: 24 },
];

export const newsletters = [
  {
    id: "n1",
    name: "Stratechery",
    author: "Ben Thompson",
    cadence: "Daily",
    lastIssue: "The Vertical Compute Bet",
    date: "2025-06-16T11:00:00Z",
    extracted: [
      "Apple announced second-gen M-series server silicon.",
      "Anthropic confirmed Trainium partnership expansion.",
      "Meta open-sourced new MTIA tooling.",
    ],
  },
  {
    id: "n2",
    name: "Lenny's Newsletter",
    author: "Lenny Rachitsky",
    cadence: "Weekly",
    lastIssue: "How the best PMs run their inbox",
    date: "2025-06-14T07:00:00Z",
    extracted: [
      "Batched triage outperforms continuous polling for senior PMs.",
      "Single-tab discipline correlates with faster reply times.",
    ],
  },
  {
    id: "n3",
    name: "The Pragmatic Engineer",
    author: "Gergely Orosz",
    cadence: "Weekly",
    lastIssue: "What changed in platform engineering in 2026",
    date: "2025-06-13T07:00:00Z",
    extracted: [
      "Internal developer platforms consolidating around Backstage forks.",
      "Kubernetes operator usage up 34% YoY among scale-ups.",
    ],
  },
];

export const chatHistory = [
  { id: "c1", title: "Summarize Acme Corp activity this month", date: "2025-06-17T09:40:00Z" },
  { id: "c2", title: "Which companies rejected my applications?", date: "2025-06-15T14:22:00Z" },
  { id: "c3", title: "Migration project status", date: "2025-06-14T11:05:00Z" },
  { id: "c4", title: "What's discussed about Kubernetes?", date: "2025-06-12T16:18:00Z" },
];

export const suggestedPrompts = [
  "Summarize all emails from Acme Corp this month",
  "Which companies rejected my applications?",
  "What has been discussed about the migration project?",
  "List important tech news from the last four days",
  "Draft a polite follow-up to Priya at Northwind",
  "What deadlines do I have this week?",
];

export const categoryColors: Record<Category, string> = {
  Work: "bg-navy/10 text-navy border-navy/20",
  Newsletter: "bg-gold/15 text-charcoal border-gold/30",
  Job: "bg-rust/10 text-rust border-rust/20",
  Finance: "bg-forest/10 text-forest border-forest/20",
  Personal: "bg-beige text-charcoal border-border",
  Notification: "bg-muted text-muted-foreground border-border",
};