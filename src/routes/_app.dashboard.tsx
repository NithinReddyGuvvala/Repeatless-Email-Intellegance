import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Avatar, CategoryBadge } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
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
  Loader2,
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
import { getDashboardDataAction, getUserSettingsAction, generateDailyBriefAction } from "@/lib/gmail/actions";
import { isDemoMode, getDemoDashboardData } from "@/lib/gmail/demoDb";
import { format } from "date-fns";

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

function Dashboard() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [briefItems, setBriefItems] = useState<string[]>([]);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefIsStale, setBriefIsStale] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefIsEmpty, setBriefIsEmpty] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const isDemo = isDemoMode();

  const loadBrief = useCallback((cacheKey: string, forceRefresh = false) => {
    if (isDemo) {
      setBriefLoading(true);
      setBriefError(null);
      setTimeout(() => {
        setBriefItems([
          "Sarah Jenkins requested developer resources for the Supabase sync engine and wants to meet tomorrow at 10 AM.",
          "Stripe Careers sent an invitation to schedule your Senior Fullstack technical interview panel next week.",
          "You have a pending invoice INV-2026-0041 from Acme Billing for $4,500.00 due in 15 days.",
          "TLDR Newsletter reports that Vite 7 was released with Rust compiler speedups and Apple is launching local on-device AI models."
        ]);
        setBriefLoading(false);
      }, 600);
      return;
    }

    const CACHE_KEY_KEY = "dashboard_brief_cache_key";
    const CACHE_DATA_KEY = "dashboard_brief_data";

    const cachedKey = localStorage.getItem(CACHE_KEY_KEY);
    const cachedData = localStorage.getItem(CACHE_DATA_KEY);

    // If cache hit and not forcing refresh, use it immediately
    if (!forceRefresh && cachedKey === cacheKey && cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBriefItems(parsed);
          setBriefIsStale(false);
          setBriefError(null);
          setBriefIsEmpty(false);
          return; // Done — use cache
        }
      } catch {
        // Corrupt cache — fall through to generation
      }
    }

    // Generate fresh brief
    setBriefLoading(true);
    setBriefError(null);

    generateDailyBriefAction()
      .then((briefRes) => {
        const { brief = [], error = null, isEmpty = false } = briefRes as any;

        if (error) {
          // Gemini failed — show stale cache if available, else error message
          const displayError = error.includes("quota") || error.includes("Quota")
            ? "AI temporarily unavailable due to quota limits."
            : error;

          const staleData = localStorage.getItem(CACHE_DATA_KEY);
          if (staleData) {
            try {
              const staleParsed = JSON.parse(staleData);
              if (Array.isArray(staleParsed) && staleParsed.length > 0) {
                setBriefItems(staleParsed);
                setBriefIsStale(true);
                setBriefError(displayError);
                return;
              }
            } catch { /* ignore */ }
          }
          // No stale cache at all
          setBriefItems([]);
          setBriefIsStale(true);
          setBriefError(displayError);
          return;
        }

        if (isEmpty) {
          setBriefIsEmpty(true);
          setBriefItems([]);
          setBriefError(null);
          return;
        }

        // Success — update state and persist cache
        setBriefItems(brief);
        setBriefIsStale(false);
        setBriefError(null);
        setBriefIsEmpty(false);
        localStorage.setItem(CACHE_KEY_KEY, cacheKey);
        localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(brief));
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to call generateDailyBriefAction:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const displayError = errMsg.includes("quota") || errMsg.includes("Quota") || errMsg.includes("temporarily unavailable")
          ? "AI temporarily unavailable due to quota limits."
          : "Brief generation is temporarily unavailable.";

        // Network/server error — try showing stale cache
        const staleData = localStorage.getItem(CACHE_DATA_KEY);
        if (staleData) {
          try {
            const staleParsed = JSON.parse(staleData);
            if (Array.isArray(staleParsed) && staleParsed.length > 0) {
              setBriefItems(staleParsed);
              setBriefIsStale(true);
              setBriefError(displayError);
              return;
            }
          } catch { /* ignore */ }
        }
        setBriefError(displayError);
      })
      .finally(() => {
        setBriefLoading(false);
      });
  }, [isDemo]);


  const loadDashboard = useCallback(() => {
    setLoading(true);
    if (isDemo) {
      const dashRes = getDemoDashboardData();
      setData(dashRes);
      setUserName("Jane Doe");
      setLoading(false);
      loadBrief(dashRes.cacheKey);
      return;
    }

    Promise.all([
      getDashboardDataAction(),
      getUserSettingsAction(),
    ])
      .then(([dashRes, userRes]) => {
        setData(dashRes);
        setUserName(userRes.user.displayName || "");
        if (dashRes.cacheKey) {
          loadBrief(dashRes.cacheKey);
        }
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to load dashboard data:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadBrief, isDemo]);

  const handleRetryBrief = useCallback(() => {
    const cacheKey = data?.cacheKey;
    if (!cacheKey) return;
    setRetryCount(c => c + 1);
    setBriefIsStale(false);
    setBriefError(null);
    loadBrief(cacheKey, true);
  }, [data, loadBrief]);


  const statsData = data?.stats || { total: 0, unread: 0, categorized: 0, threads: 0, summaries: 0, newsletters: 0 };
  const stats = [
    {
      label: "Total emails",
      value: statsData.total.toLocaleString(),
      delta: "+312",
      trend: "up",
      icon: Mail,
    },
    {
      label: "Unread",
      value: statsData.unread.toString(),
      delta: "-24",
      trend: "down",
      icon: MailOpen,
    },
    {
      label: "Categorized",
      value: statsData.categorized.toLocaleString(),
      delta: "+286",
      trend: "up",
      icon: Tags,
    },
    {
      label: "Active threads",
      value: statsData.threads.toLocaleString(),
      delta: "+18",
      trend: "up",
      icon: MessagesSquare,
    },
    {
      label: "AI summaries",
      value: statsData.summaries.toString(),
      delta: "+47",
      trend: "up",
      icon: FileText,
    },
    {
      label: "Newsletters",
      value: statsData.newsletters.toString(),
      delta: "+12",
      trend: "up",
      icon: Newspaper,
    },
  ];

  const weeklyVolume = data?.weeklyVolume || [];
  const categoryDistribution = data?.categoryDistribution || [];
  const priorityEmails = data?.priorityEmails || [];
  const recent = data?.recentEmails || [];


  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(/\s+/)[0] : "";
  const greetingText = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  const dateStr = format(now, "EEEE, MMMM d");

  useEffect(() => {
    loadDashboard();

    const handleSynced = () => loadDashboard();
    const handleUnreadChanged = () => loadDashboard();

    window.addEventListener("gmail-synced", handleSynced);
    window.addEventListener("gmail-unread-changed", handleUnreadChanged);
    return () => {
      window.removeEventListener("gmail-synced", handleSynced);
      window.removeEventListener("gmail-unread-changed", handleUnreadChanged);
    };
  }, [locationKey, loadDashboard]);

  if (loading) {
    return (
      <AppShell title="Dashboard">
        <div className="flex flex-col items-center justify-center py-40 text-muted-foreground gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-navy" />
          <span className="text-sm">Loading dashboard data...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <PageHeader
        eyebrow={`Today · ${dateStr}`}
        title={greetingText}
        description={
          statsData.unread > 0
            ? `You have ${statsData.unread} unread email${statsData.unread !== 1 ? "s" : ""}.${priorityEmails.length > 0 ? ` ${priorityEmails.length} priority item${priorityEmails.length !== 1 ? "s" : ""} need attention.` : ""}`
            : "Your inbox is up to date."
        }
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
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="received"
                  stroke="var(--color-navy)"
                  strokeWidth={2}
                  fill="url(#rec)"
                />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke="var(--color-forest)"
                  strokeWidth={2}
                  fill="url(#sen)"
                />
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
                  {categoryDistribution.map((_: any, i: number) => (
                    <Cell
                      key={i}
                      fill={chartColors[i % chartColors.length]}
                      stroke="var(--color-background)"
                      strokeWidth={2}
                    />
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
            {categoryDistribution.map((c: any, i: number) => (
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
            <Link
              to="/inbox"
              className="inline-flex items-center gap-1 text-sm text-navy hover:underline"
            >
              View inbox <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="-mx-5 divide-y divide-border border-y border-border">
            {priorityEmails.map((e: any) => (
              <Link
                key={e.id}
                to="/threads/$threadId"
                params={{ threadId: e.threadId }}
                search={{ from: "dashboard" }}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-beige/60"
              >
                <Avatar initials={e.senderInitials} color={e.avatarColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-charcoal">
                      {e.senderName}
                    </span>
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
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              AI insights
            </div>
            {briefIsStale && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold uppercase tracking-wide">
                <Clock className="h-2.5 w-2.5" /> Cached
              </span>
            )}
          </div>
          <div className="mt-0.5 font-serif text-lg font-semibold">Today's brief</div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-charcoal-soft">
            {briefLoading ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-navy" />
                <span className="text-xs">Generating your daily brief...</span>
              </div>
            ) : briefItems.length > 0 ? (
              <>
                {briefItems.map((line: string, i: number) => (
                  <p key={i} className="flex items-start gap-2 text-charcoal-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                    <span>{line}</span>
                  </p>
                ))}
                {briefError && (
                  <p className="text-[11px] text-muted-foreground italic mt-2">{briefError}</p>
                )}
              </>
            ) : briefIsEmpty ? (
              <p className="text-muted-foreground">No emails synced yet. Sync your Gmail to generate a brief.</p>
            ) : briefError ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">{briefError}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {statsData.total === 0
                  ? "Sync your Gmail to generate a daily brief."
                  : "No tasks or updates found today."}
              </p>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-xl bg-beige/60 px-3 py-2 text-xs text-charcoal-soft">
              <Clock className="h-3.5 w-3.5" />
              <span>AI powered · Refreshed automatically</span>
            </div>
            {(briefIsStale || briefError) && !briefLoading && (
              <button
                onClick={handleRetryBrief}
                className="text-xs text-navy hover:underline font-medium"
              >
                Retry
              </button>
            )}
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
          {recent.map((e: any) => (
            <Link
              key={e.id}
              to="/threads/$threadId"
              params={{ threadId: e.threadId }}
              search={{ from: "dashboard" }}
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
