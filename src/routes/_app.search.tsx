import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { emails, categories } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/search")({
  head: () => ({ meta: [{ title: "Search — Repeatless AI" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("kubernetes");
  const [activeCats, setActiveCats] = useState<string[]>([]);

  const results = emails.filter((e) => {
    const matchQ =
      !q ||
      e.subject.toLowerCase().includes(q.toLowerCase()) ||
      e.preview.toLowerCase().includes(q.toLowerCase()) ||
      e.body.toLowerCase().includes(q.toLowerCase()) ||
      e.senderName.toLowerCase().includes(q.toLowerCase());
    const matchCat = activeCats.length === 0 || activeCats.includes(e.category);
    return matchQ && matchCat;
  });

  function toggleCat(c: string) {
    setActiveCats((arr) => (arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]));
  }

  return (
    <AppShell title="Search">
      <PageHeader
        eyebrow="Global search"
        title="Find anything in your inbox"
        description="Search by sender, subject, content, category, label, or date. Repeatless ranks by relevance."
      />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Categories
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.name}
                  onClick={() => toggleCat(c.name)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    activeCats.includes(c.name)
                      ? "border-navy bg-navy text-ivory"
                      : "border-border bg-card text-charcoal-soft hover:bg-beige",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Date range
            </div>
            <div className="mt-3 space-y-1.5">
              {["Today", "This week", "This month", "Last 90 days", "All time"].map((d, i) => (
                <button
                  key={d}
                  className={cn(
                    "block w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                    i === 2 ? "bg-beige text-charcoal" : "text-charcoal-soft hover:bg-beige/60",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              From sender
            </div>
            <Input placeholder="name@example.com" className="mt-3 h-9 rounded-lg bg-background" />
          </div>

          <div className="surface-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Labels
            </div>
            <Input placeholder="Search labels…" className="mt-3 h-9 rounded-lg bg-background" />
          </div>
        </aside>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-11 rounded-xl border-border bg-background pl-10 pr-10 text-[15px]"
                placeholder="Search emails, threads, people…"
              />
              {q && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQ("")}
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {results.length} results {q && <>for "<span className="font-medium text-charcoal">{q}</span>"</>}
            </div>
          </div>
          {results.length > 0 ? (
            results.map((e) => <EmailRow key={e.id} email={e} />)
          ) : (
            <div className="p-16 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-beige">
                <SearchIcon className="h-5 w-5 text-charcoal-soft" />
              </div>
              <div className="font-serif text-lg font-semibold text-charcoal">No matches</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Try widening your filters or rephrasing the query.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}