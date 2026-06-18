import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Sparkles, Newspaper, Copy, Loader2 } from "lucide-react";
import { formatEmailDate } from "@/components/email-bits";
import { useState, useEffect, useCallback } from "react";
import { getNewslettersAction } from "@/lib/gmail/actions";
import { isDemoMode, getDemoNewsletters } from "@/lib/gmail/demoDb";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/newsletters")({
  head: () => ({ meta: [{ title: "Newsletter Intelligence — Repeatless AI" }] }),
  component: Newsletters,
});

function Newsletters() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [loading, setLoading] = useState(true);
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const isDemo = isDemoMode();

  const loadNewsletters = useCallback(() => {
    setLoading(true);
    const fetchPromise = isDemo
      ? getDemoNewsletters()
      : getNewslettersAction();

    fetchPromise
      .then((res) => {
        setNewsletters(res.newsletters);
      })
      .catch((err) => console.error("Failed to load newsletters:", err))
      .finally(() => {
        setLoading(false);
      });
  }, [isDemo]);

  useEffect(() => {
    loadNewsletters();

    window.addEventListener("gmail-synced", loadNewsletters);
    return () => {
      window.removeEventListener("gmail-synced", loadNewsletters);
    };
  }, [locationKey, loadNewsletters]);

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
          {newsletters.length > 0
            ? `${newsletters.length} newsletter sender${newsletters.length !== 1 ? "s" : ""} in your inbox`
            : "No newsletter digests yet"}
        </h2>
        {newsletters.length === 0 && !loading && (
          <p className="mt-2 text-sm text-muted-foreground">
            Sync your Gmail and emails with the CATEGORY_PROMOTIONS label will appear here.
          </p>
        )}
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Subscriptions
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-navy" />
          <span className="text-sm">Loading newsletters...</span>
        </div>
      ) : newsletters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Newspaper className="h-10 w-10 mb-3 opacity-30" />
          <span className="text-sm">No newsletter subscriptions found.</span>
          <span className="text-xs mt-1">Sync Gmail to populate newsletter senders.</span>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {newsletters.map((n) => (
            <div
              key={n.id}
              className={cn(
                "surface-card p-5 relative transition-colors",
                n.unread ? "bg-white dark:bg-card border-l-4 border-l-[#1a73e8]" : "bg-transparent border border-border/80"
              )}
            >
              {/* Unread indicator dot */}
              {n.unread && (
                <span
                  className="absolute top-4 right-4 h-2 w-2 rounded-full bg-[#1a73e8]"
                  aria-label="Unread newsletter"
                />
              )}
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-beige">
                  <Newspaper className="h-4 w-4 text-charcoal-soft" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn(
                    "truncate font-serif text-base text-charcoal",
                    n.unread ? "font-bold" : "font-semibold"
                  )}>
                    {n.name}
                  </div>
                  <div className={cn(
                    "truncate text-xs",
                    n.unread ? "font-semibold text-charcoal" : "text-muted-foreground"
                  )}>
                    {n.author} · {n.cadence}
                  </div>
                </div>
              </div>
              <div className={cn(
                "mt-4 text-[11px] uppercase tracking-[0.16em]",
                n.unread ? "font-bold text-charcoal" : "font-semibold text-muted-foreground"
              )}>
                Latest · {formatEmailDate(n.date, "MMM d")}
              </div>
              <div className={cn(
                "mt-1 text-sm line-clamp-2",
                n.unread ? "text-charcoal font-semibold" : "font-medium text-charcoal-soft"
              )}>
                {n.lastIssue}
              </div>
              {n.extracted && n.extracted.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-charcoal-soft">
                  {n.extracted.map((e: string) => (
                    <li key={e} className="flex gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-forest" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
