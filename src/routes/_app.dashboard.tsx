import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Avatar, CategoryBadge } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import {
  Mail,
  MailOpen,
  Tags,
  MessagesSquare,
  FileText,
  Newspaper,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  dashboardStats,
  weeklyVolume,
  categoryDistribution,
  emails,
} from "@/lib/mock-data";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Repeatless AI" }] }),
  component: Dashboard,
});

const chartColors = [
  "var(--color-navy)",
  "var(--color-forest)",
  "var(--color-gold)",
  "var(--color-rust)",
  "var(--color-navy-soft)",
  "var(--color-charcoal-soft)",
];

const stats = [
  { label: "Total emails", value: dashboardStats.total.toLocaleString(), delta: "+312", trend: "up", icon: Mail },
  { label: "Unread", value: dashboardStats.unread.toString(), delta: "-24", trend: "down", icon: MailOpen },
  { label: "Categorized", value: dashboardStats.categorized.toLocaleString(), delta: "+286", trend: "up", icon: Tags },
  { label: "Active threads", value: dashboardStats.threads.toLocaleString(), delta: "+18", trend: "up", icon: MessagesSquare },
  { label: "AI summaries", value: dashboardStats.summaries.toString(), delta: "+47", trend: "up", icon: FileText },
  { label: "Newsletters", value: dashboardStats.newsletters.toString(), delta: "+12", trend: "up", icon: Newspaper },
];

function Dashboard() {
  const priorityEmails = emails.filter((e) => e.importance === "high").slice(0, 4);
  const recent = emails.slice(0, 5);

  return (
    <AppShell title="Dashboard">
      <PageHeader
        eyebrow="Today · Tuesday, June 17"
        title="Good morning, Alex."
        description="Your inbox is calmer than yesterday. 3 priority items need a decision today."
        actions={
          <Button asChild className="rounded-xl bg-navy text-ivory hover:bg-navy/90">
            <Link to="/agent">
              <Sparkles className="mr-2 h-4 w-4" /> Ask the agent
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="surface-card p-4">
            <div className="flex items-center justify-between">
              <s.icon className="h-4 w-4 text-charcoal-soft" strokeWidth={1.75} />
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                  s.trend === "up" ? "text-forest" : "text-rust"
                }`}
              >
                {s.trend === "up" ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {s.delta}
              </span>
            </div>
            <div className="mt-3 font-serif text-2xl font-semibold tracking-tight text-charcoal">
              {s.value}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                This week
              </div>
              <div className="mt-0.5 font-serif text-lg font-semibold">Email volume</div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-navy" /> Received
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-forest" /> Sent
              </span>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyVolume} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-navy)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-navy)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-forest)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-forest)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="received" stroke="var(--color-navy)" strokeWidth={2} fill="url(#rec)" />
                <Area type="monotone" dataKey="sent" stroke="var(--color-forest)" strokeWidth={2} fill="url(#sen)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Distribution
          </div>
          <div className="mt-0.5 font-serif text-lg font-semibold">By category</div>
          <div className="mt-2 h-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={categoryDistribution}
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryDistribution.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} stroke="var(--color-background)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {categoryDistribution.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: chartColors[i % chartColors.length] }}
                />
                <span className="text-charcoal-soft">{c.name}</span>
                <span className="ml-auto font-medium text-charcoal">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Today
              </div>
              <div className="mt-0.5 font-serif text-lg font-semibold">Priority items</div>
            </div>
            <Link to="/inbox" className="inline-flex items-center gap-1 text-sm text-navy hover:underline">
              View inbox <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="-mx-5 divide-y divide-border border-y border-border">
            {priorityEmails.map((e) => (
              <Link
                key={e.id}
                to="/threads/$threadId"
                params={{ threadId: e.threadId }}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-beige/60"
              >
                <Avatar initials={e.senderInitials} color={e.avatarColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-charcoal">{e.senderName}</span>
                    <CategoryBadge category={e.category} />
                  </div>
                  <div className="truncate text-sm text-charcoal-soft">{e.subject}</div>
                </div>
                <AlertCircle className="h-4 w-4 shrink-0 text-rust" />
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            AI insights
          </div>
          <div className="mt-0.5 font-serif text-lg font-semibold">Today's brief</div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
            <p>
              <span className="font-medium text-charcoal">Eleanor</span> and{" "}
              <span className="font-medium text-charcoal">Sofia</span> need a Berlin
              decision before <span className="font-medium text-charcoal">July 3</span>.
            </p>
            <p>
              <span className="font-medium text-charcoal">Marcus</span> wants a green
              light on the migration window — <span className="font-medium text-charcoal">June 28</span>.
            </p>
            <p>
              <span className="font-medium text-charcoal">Priya at Northwind</span>{" "}
              follow-up still unscheduled.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-beige/60 px-3 py-2 text-xs text-charcoal-soft">
            <Clock className="h-3.5 w-3.5" />
            Generated 8 minutes ago · Gemini 2.5 Pro
          </div>
        </div>
      </div>

      <div className="mt-6 surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Recent activity
            </div>
            <div className="mt-0.5 font-serif text-lg font-semibold">Latest from your inbox</div>
          </div>
        </div>
        <div className="-mx-5 -mb-5 divide-y divide-border border-t border-border">
          {recent.map((e) => (
            <Link
              key={e.id}
              to="/threads/$threadId"
              params={{ threadId: e.threadId }}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-beige/60"
            >
              <Avatar initials={e.senderInitials} color={e.avatarColor} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <span className="font-medium text-charcoal">{e.senderName}</span>{" "}
                  <span className="text-charcoal-soft">— {e.subject}</span>
                </div>
              </div>
              <CategoryBadge category={e.category} />
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}