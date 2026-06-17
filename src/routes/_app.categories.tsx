import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { categories, categoryDistribution, emails } from "@/lib/mock-data";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Briefcase, Newspaper, Banknote, Bell, Heart, BriefcaseBusiness } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/categories")({
  head: () => ({ meta: [{ title: "Categories — Repeatless AI" }] }),
  component: Categories,
});

const icons = {
  Work: Briefcase,
  Newsletter: Newspaper,
  Job: BriefcaseBusiness,
  Finance: Banknote,
  Personal: Heart,
  Notification: Bell,
} as const;

const colors = ["var(--color-navy)", "var(--color-forest)", "var(--color-rust)", "var(--color-gold)", "var(--color-navy-soft)", "var(--color-charcoal-soft)"];

function Categories() {
  const [active, setActive] = useState<string>("Work");
  const filtered = emails.filter((e) => e.category === active);

  return (
    <AppShell title="Categories">
      <PageHeader
        eyebrow="Categorization center"
        title="Categories"
        description="Automatic classification powered by Gemini. Drill into any category to see what landed there."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {categories.map((c, i) => {
          const Icon = icons[c.name];
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
                style={{ background: colors[i] + "22" }}
              >
                <Icon className="h-4 w-4" style={{ color: colors[i] }} strokeWidth={1.75} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
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
                    <Cell key={i} fill={colors[i]} />
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
            <li><span className="font-medium text-charcoal">Work</span> volume is up 14% week-over-week — driven by Q4 planning.</li>
            <li><span className="font-medium text-charcoal">Newsletters</span> are down 6%; 4 subscriptions look dormant.</li>
            <li><span className="font-medium text-charcoal">Finance</span> is on its normal monthly cadence.</li>
            <li><span className="font-medium text-charcoal">Job</span> activity peaked Tuesday — 3 recruiter intros, 1 rejection.</li>
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
          filtered.map((e) => <EmailRow key={e.id} email={e} />)
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nothing in {active} yet.
          </div>
        )}
      </div>
    </AppShell>
  );
}