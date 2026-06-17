import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { newsletters } from "@/lib/mock-data";
import { Sparkles, Newspaper, Copy } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/newsletters")({
  head: () => ({ meta: [{ title: "Newsletter Intelligence — Repeatless AI" }] }),
  component: Newsletters,
});

function Newsletters() {
  return (
    <AppShell title="Newsletter Intelligence">
      <PageHeader
        eyebrow="Bonus Intelligence"
        title="Newsletter Intelligence"
        description="Repeatless extracts the news from every newsletter, deduplicates across sources, and assembles a unified digest."
      />

      <div className="surface-lifted mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-forest" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Unified digest · Today
          </span>
        </div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-charcoal">
          Three stories worth your attention
        </h2>
        <div className="mt-5 space-y-4">
          {[
            {
              title: "Custom silicon is the new compute moat",
              body: "Apple, Anthropic, and Meta all advanced vertical-compute strategies this week. Read: the pure GPU-rental era is ending.",
              sources: ["Stratechery", "Pragmatic Engineer"],
              dedup: 2,
            },
            {
              title: "Internal developer platforms consolidate around Backstage",
              body: "Multiple newsletters report scale-ups standardising on Backstage forks, with operator usage up 34% YoY.",
              sources: ["Pragmatic Engineer"],
              dedup: 1,
            },
            {
              title: "PMs are rebuilding their inbox rituals",
              body: "Batched triage and weekly archive sweeps are emerging as best practice among senior PMs.",
              sources: ["Lenny's Newsletter"],
              dedup: 1,
            },
          ].map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="font-serif text-lg font-semibold text-charcoal">{s.title}</div>
                {s.dedup > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rust/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-rust">
                    <Copy className="h-2.5 w-2.5" /> {s.dedup}× sources
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-charcoal-soft">{s.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.sources.map((src) => (
                  <span
                    key={src}
                    className="rounded-md border border-border bg-background px-2 py-0.5 text-[10.5px] font-medium text-charcoal-soft"
                  >
                    {src}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Subscriptions
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {newsletters.map((n) => (
          <div key={n.id} className="surface-card p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-beige">
                <Newspaper className="h-4 w-4 text-charcoal-soft" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-base font-semibold text-charcoal">{n.name}</div>
                <div className="truncate text-xs text-muted-foreground">{n.author} · {n.cadence}</div>
              </div>
            </div>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Latest · {format(new Date(n.date), "MMM d")}
            </div>
            <div className="mt-1 text-sm font-medium text-charcoal">{n.lastIssue}</div>
            <ul className="mt-3 space-y-1.5 text-xs text-charcoal-soft">
              {n.extracted.map((e) => (
                <li key={e} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-forest" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </AppShell>
  );
}