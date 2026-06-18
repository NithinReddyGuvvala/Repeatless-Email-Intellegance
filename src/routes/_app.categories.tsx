import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Briefcase, Newspaper, Banknote, Bell, Heart, BriefcaseBusiness, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getCategoriesAction } from "@/lib/gmail/actions";
import { isDemoMode, getDemoInboxEmails } from "@/lib/gmail/demoDb";

export const Route = createFileRoute("/_app/categories")({
  head: () => ({ meta: [{ title: "Categories — Repeatless AI" }] }),
  component: Categories,
});

const icons: Record<string, any> = {
  Work: Briefcase,
  Newsletter: Newspaper,
  Job: BriefcaseBusiness,
  Finance: Banknote,
  Personal: Heart,
  Notification: Bell,
};

const colors = [
  "var(--color-navy)",
  "var(--color-forest)",
  "var(--color-rust)",
  "var(--color-gold)",
  "var(--color-navy-soft)",
  "var(--color-charcoal-soft)",
];

function Categories() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [active, setActive] = useState<string>("Work");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    categories: { name: string; count: number; description: string }[];
    categoryDistribution: { name: string; value: number }[];
    emails: any[];
  } | null>(null);
  const isDemo = isDemoMode();

  const loadCategories = useCallback(() => {
    setLoading(true);
    if (isDemo) {
      getDemoInboxEmails({ filter: "All", sort: "newest", search: "", page: 0 })
        .then((inboxRes) => {
          const all = inboxRes.emails;
          const categoryStats = [
            { name: "Work", count: all.filter(e => e.category === "Work").length, description: "Professional communications and project details" },
            { name: "Newsletter", count: all.filter(e => e.category === "Newsletter").length, description: "Subscribed feeds, news bulletins, and TLDRs" },
            { name: "Job", count: all.filter(e => e.category === "Job").length, description: "Recruitment trackers, interviews, and job alerts" },
            { name: "Finance", count: all.filter(e => e.category === "Finance").length, description: "Invoices, billing reports, and statement updates" },
            { name: "Personal", count: all.filter(e => e.category === "Personal").length, description: "Friends, hiking coordinates, and family checkins" },
            { name: "Notification", count: all.filter(e => e.category === "Notification").length, description: "Deploy messages, security alerts, and Slack pings" },
          ];
          
          setData({
            categories: categoryStats,
            categoryDistribution: categoryStats.map(s => ({ name: s.name, value: s.count })).filter(c => c.value > 0),
            emails: all
          });
          
          const top = categoryStats.reduce((a, b) => (a.count > b.count ? a : b));
          setActive(top.name);
          setLoading(false);
        });
      return;
    }

    getCategoriesAction()
      .then((res) => {
        setData(res);
        if (res.categories.length > 0) {
          const top = res.categories.reduce((a, b) => (a.count > b.count ? a : b));
          setActive(top.name);
        }
      })
      .catch((err) => console.error("Failed to load categories:", err))
      .finally(() => {
        setLoading(false);
      });
  }, [isDemo]);

  useEffect(() => {
    loadCategories();

    window.addEventListener("gmail-synced", loadCategories);
    return () => {
      window.removeEventListener("gmail-synced", loadCategories);
    };
  }, [locationKey, loadCategories]);

  const categories = data?.categories || [];
  const categoryDistribution = data?.categoryDistribution || [];
  const allEmails = data?.emails || [];
  const filtered = allEmails.filter((e) => e.category === active);

  return (
    <AppShell title="Categories">
      <PageHeader
        eyebrow="Categorization center"
        title="Categories"
        description="Automatic classification powered by Gemini. Drill into any category to see what landed there."
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-navy" />
          <span className="text-sm">Loading categories...</span>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {categories.map((c, i) => {
              const Icon = icons[c.name] || Briefcase;
              const isActive = c.name === active;
              return (
                <button
                  key={c.name}
                  onClick={() => setActive(c.name)}
                  className={cn(
                    "surface-card p-4 text-left transition-all hover:shadow-lifted",
                    isActive && "ring-2 ring-navy",
                  )}
                >
                  <div
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{ background: colors[i % colors.length] + "22" }}
                  >
                    <Icon className="h-4 w-4" style={{ color: colors[i % colors.length] }} strokeWidth={1.75} />
                  </div>
                  <div className="mt-3 font-serif text-xl font-semibold tracking-tight text-charcoal">
                    {c.count}
                  </div>
                  <div className="text-sm font-medium text-charcoal">{c.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="surface-card p-5">
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Distribution
                </div>
                <div className="mt-0.5 font-serif text-lg font-semibold">Volume by category</div>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={categoryDistribution} margin={{ left: -10, right: 8, top: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
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
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {categoryDistribution.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface-card p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Insights
              </div>
              <div className="mt-0.5 font-serif text-lg font-semibold">What's standing out</div>
              <ul className="mt-4 space-y-3 text-sm text-charcoal-soft">
                {categories.slice(0, 4).map((c) => (
                  <li key={c.name}>
                    <span className="font-medium text-charcoal">{c.name}</span> — {c.count} email{c.count !== 1 ? "s" : ""}.
                  </li>
                ))}
                {categories.length === 0 && (
                  <li className="text-muted-foreground">Sync your Gmail to see category insights.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-6 surface-card overflow-hidden">
            <div className="border-b border-border p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recent in {active}
              </div>
              <div className="mt-0.5 font-serif text-lg font-semibold">{filtered.length} messages</div>
            </div>
            {filtered.length > 0 ? (
              filtered.map((e) => <EmailRow key={e.id} email={e} from="categories" />)
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {allEmails.length === 0
                  ? "No emails synced yet. Click Sync Gmail in Settings."
                  : `Nothing in ${active} yet.`}
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
