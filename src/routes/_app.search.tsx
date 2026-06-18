import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search as SearchIcon, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { searchEmailsAction } from "@/lib/gmail/actions";
import { cn } from "@/lib/utils";
import { isDemoMode, getDemoSearchEmails } from "@/lib/gmail/demoDb";

export const Route = createFileRoute("/_app/search")({
  head: () => ({ meta: [{ title: "Search — Repeatless AI" }] }),
  component: SearchPage,
});

const CATEGORY_LIST = ["Work", "Newsletter", "Finance", "Job", "Personal", "Notification"] as const;
const DATE_RANGES = ["Today", "This week", "This month", "Last 90 days", "All time"] as const;

const PAGE_SIZE = 50;

function SearchPage() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [q, setQ] = useState("");
  const [sender, setSender] = useState("");
  const [label, setLabel] = useState("");
  const [dateRange, setDateRange] = useState<string>("All time");
  const [activeCats, setActiveCats] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDemo = isDemoMode();

  const runSearch = useCallback((pageNum: number, cursorVal: string | null) => {
    setLoading(true);
    const fetchPromise = isDemo
      ? getDemoSearchEmails({
          query: q,
          sender,
          label,
          dateRange,
          categories: activeCats,
          page: pageNum,
        })
      : searchEmailsAction({
          data: {
            query: q,
            sender,
            label,
            dateRange,
            categories: activeCats,
            cursor: cursorVal || undefined,
            pageSize: PAGE_SIZE,
          },
        });

    fetchPromise
      .then((res) => {
        setResults(res.emails);
        setTotalCount(res.totalCount);
        if (res.nextCursor) {
          setCursors((prev) => {
            const copy = [...prev];
            copy[pageNum + 1] = res.nextCursor;
            return copy;
          });
        }
      })
      .catch((err) => console.error("Search failed:", err))
      .finally(() => setLoading(false));
  }, [q, sender, label, dateRange, activeCats, isDemo]);

  // Reset pagination and trigger search on any filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setCursors([null]);
      runSearch(0, null);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [runSearch]);

  // Initial load (all emails) & reload on navigation or global sync event
  useEffect(() => {
    setPage(0);
    setCursors([null]);
    runSearch(0, null);

    const handleSyncComplete = () => {
      setPage(0);
      setCursors([null]);
      runSearch(0, null);
    };

    window.addEventListener("gmail-synced", handleSyncComplete);
    return () => {
      window.removeEventListener("gmail-synced", handleSyncComplete);
    };
  }, [locationKey, runSearch]);

  const handlePrevPage = () => {
    if (page > 0) {
      const prevPage = page - 1;
      setPage(prevPage);
      runSearch(prevPage, cursors[prevPage]);
    }
  };

  const handleNextPage = () => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page < totalPages - 1) {
      const nextPage = page + 1;
      setPage(nextPage);
      runSearch(nextPage, cursors[nextPage]);
    }
  };

  function toggleCat(c: string) {
    setActiveCats((arr) => (arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]));
  }

  function clearAll() {
    setQ("");
    setSender("");
    setLabel("");
    setDateRange("All time");
    setActiveCats([]);
  }

  const hasFilters = q || sender || label || dateRange !== "All time" || activeCats.length > 0;

  return (
    <AppShell title="Search">
      <PageHeader
        eyebrow="Global search"
        title="Find anything in your inbox"
        description="Search by sender, subject, date range, category, or label. Queries run directly against your synced emails."
      />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Categories
              </div>
              {activeCats.length > 0 && (
                <button
                  onClick={() => setActiveCats([])}
                  className="text-[10px] text-navy hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_LIST.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCat(c)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    activeCats.includes(c)
                      ? "border-navy bg-navy text-ivory"
                      : "border-border bg-card text-charcoal-soft hover:bg-beige",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
              Date range
            </div>
            <div className="space-y-1">
              {DATE_RANGES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDateRange(d)}
                  className={cn(
                    "block w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                    dateRange === d
                      ? "bg-navy text-ivory"
                      : "text-charcoal-soft hover:bg-beige/60",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-4 space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                From sender
              </div>
              <div className="relative">
                <Input
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="name@example.com"
                  className="h-9 rounded-lg bg-background"
                />
                {sender && (
                  <button
                    onClick={() => setSender("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-charcoal"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                Label
              </div>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. INBOX, STARRED, UNREAD"
                className="h-9 rounded-lg bg-background"
              />
            </div>
          </div>

          {hasFilters && (
            <Button
              variant="outline"
              onClick={clearAll}
              className="w-full rounded-xl border-border bg-card hover:bg-beige text-sm"
            >
              Clear all filters
            </Button>
          )}
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
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-navy" />
              ) : (
                <span>
                  {results.length === 0 ? "0 results" : `${results.length} of ${totalCount} shown`}
                  {q && (
                    <>
                      {" "}for "<span className="font-medium text-charcoal">{q}</span>"
                    </>
                  )}
                  {dateRange !== "All time" && (
                    <span className="ml-2 rounded-md bg-navy/10 px-1.5 py-0.5 text-navy font-medium">
                      {dateRange}
                    </span>
                  )}
                  {activeCats.map((c) => (
                    <span key={c} className="ml-1 rounded-md bg-forest/10 px-1.5 py-0.5 text-forest font-medium">
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-navy" />
              <span className="text-sm">Searching...</span>
            </div>
          ) : results.length > 0 ? (
            <>
              {results.map((e) => <EmailRow key={e.id} email={e} from="search" />)}
              {totalCount > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 border-t border-border bg-parchment/40 px-4 py-3 text-xs text-muted-foreground sm:px-6">
                  <span>
                    Page {page + 1} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={page === 0}
                      onClick={handlePrevPage}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={page >= Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) - 1}
                      onClick={handleNextPage}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-16 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-beige">
                <SearchIcon className="h-5 w-5 text-charcoal-soft" />
              </div>
              <div className="font-serif text-lg font-semibold text-charcoal">
                {hasFilters ? "No matches" : "Start typing to search"}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? "Try widening your filters or rephrasing the query."
                  : "Search across subjects, senders, and email content."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
