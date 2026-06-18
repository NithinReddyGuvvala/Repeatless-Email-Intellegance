import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ArrowDownUp,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSentEmailsAction, deleteEmailsAction } from "@/lib/gmail/actions";
import { toast } from "sonner";
import { useSelectionState, computeSelectAllState } from "@/lib/useSelectionState";
import { isDemoMode, getDemoSentEmails, demoDeleteEmails } from "@/lib/gmail/demoDb";

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/sent")({
  head: () => ({ meta: [{ title: "Sent Mail — Repeatless AI" }] }),
  component: SentPage,
  errorComponent: RouteErrorComponent,
});

const filters = [
  "All",
  "Work",
  "Newsletter",
  "Finance",
  "Job",
  "Personal",
  "Notification",
] as const;

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

const PAGE_SIZE = 50;

function SentPage() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [emails, setEmails] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("sent_cursors");
      return saved ? JSON.parse(saved) : [null];
    }
    return [null];
  });
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const p = sessionStorage.getItem("sent_page");
      return p ? parseInt(p, 10) : 0;
    }
    return 0;
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof filters)[number]>(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("sent_filter") as any) || "All";
    }
    return "All";
  });
  const [sort, setSort] = useState<"newest" | "oldest">(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("sent_sort") as any) || "newest";
    }
    return "newest";
  });
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("sent_search") || "";
    }
    return "";
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toggleItem, clearSelection } = useSelectionState();
  const [processingAction, setProcessingAction] = useState(false);
  const isDemo = isDemoMode();

  const visibleIds = emails.map((e) => e.id);
  const { isAllSelected, isIndeterminate } = computeSelectAllState(selectedIds, visibleIds);

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    setProcessingAction(true);
    const idsToProcess = [...selectedIds];

    // Optimistic UI update
    setEmails((prev) => prev.filter((e) => !idsToProcess.includes(e.id)));
    setTotalCount((prev) => Math.max(0, prev - idsToProcess.length));
    setSelectedIds([]);

    const promise = isDemo
      ? demoDeleteEmails(idsToProcess)
      : deleteEmailsAction({ data: idsToProcess });

    toast.promise(
      promise,
      {
        loading: `Deleting ${idsToProcess.length} email(s)...`,
        success: () => {
          window.dispatchEvent(new CustomEvent("gmail-synced"));
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Successfully deleted ${idsToProcess.length} email(s).`;
        },
        error: (err) => {
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Failed to delete: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
    setProcessingAction(false);
  };

  const loadEmails = useCallback(
    async (
      currFilter: string,
      currSort: string,
      currSearch: string,
      targetPage: number,
      pageCursor: string | null = null,
    ) => {
      setLoading(true);
      try {
        if (isDemo) {
          const res = await getDemoSentEmails({
            query: currSearch,
            category: currFilter !== "All" ? currFilter : undefined,
            sort: currSort as "newest" | "oldest",
            page: targetPage,
          });
          setEmails(res.emails);
          setTotalCount(res.totalCount);
          
          if (targetPage === 0) {
            setCursors([null, res.nextCursor]);
          } else {
            setCursors((prev) => {
              const updated = [...prev];
              updated[targetPage + 1] = res.nextCursor;
              return updated;
            });
          }
          setLoading(false);
          return;
        }

        const res = await getSentEmailsAction({
          data: {
            filter: currFilter,
            sort: currSort,
            search: currSearch,
            cursor: pageCursor || undefined,
            pageSize: PAGE_SIZE,
          },
        });

        setEmails(res.emails);
        setTotalCount(res.totalCount);

        if (targetPage === 0) {
          setCursors([null, res.nextCursor]);
        } else {
          setCursors((prev) => {
            const updated = [...prev];
            updated[targetPage + 1] = res.nextCursor;
            return updated;
          });
        }
      } catch (err) {
        console.error("Failed to load sent emails:", err);
        toast.error("Could not retrieve sent emails.");
      } finally {
        setLoading(false);
      }
    },
    [isDemo],
  );

  const isInitialMountRef = useRef(true);
  const isInitialSearchMountRef = useRef(true);

  // Sync state to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sent_filter", filter);
      sessionStorage.setItem("sent_sort", sort);
      sessionStorage.setItem("sent_search", search);
      sessionStorage.setItem("sent_page", page.toString());
      sessionStorage.setItem("sent_cursors", JSON.stringify(cursors));
    }
  }, [filter, sort, search, page, cursors]);

  // Scroll listener & restore hooks
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("sent_scroll", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!loading && emails.length > 0) {
      const savedScroll = sessionStorage.getItem("sent_scroll");
      if (savedScroll) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedScroll, 10));
        }, 100);
      }
    }
  }, [loading, emails]);

  // Reset pagination when filter, sort, navigation, or global sync event changes
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      loadEmails(filter, sort, search, page, cursors[page] || null);
      return;
    }

    setPage(0);
    setCursors([null]);
    setSelectedIds([]);
    loadEmails(filter, sort, search, 0, null);

    const handleSyncComplete = () => {
      setPage(0);
      setCursors([null]);
      setSelectedIds([]);
      loadEmails(filter, sort, search, 0, null);
    };

    window.addEventListener("gmail-synced", handleSyncComplete);
    return () => {
      window.removeEventListener("gmail-synced", handleSyncComplete);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sort, locationKey, loadEmails]);

  // Debounced search (resets pagination)
  useEffect(() => {
    if (isInitialSearchMountRef.current) {
      isInitialSearchMountRef.current = false;
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(0);
      setCursors([null]);
      setSelectedIds([]);
      loadEmails(filter, sort, search, 0, null);
    }, 350);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Click outside to close sort dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrevPage = () => {
    if (page > 0) {
      const prevPage = page - 1;
      setPage(prevPage);
      loadEmails(filter, sort, search, prevPage, cursors[prevPage]);
    }
  };

  const handleNextPage = () => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page < totalPages - 1) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadEmails(filter, sort, search, nextPage, cursors[nextPage]);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentSortLabel = sortOptions.find((o) => o.value === sort)?.label || "Newest first";

  return (
    <AppShell title="Sent Mail">
      <PageHeader
        eyebrow={loading ? "Loading messages..." : `${totalCount.toLocaleString()} sent messages`}
        title="Sent Mail"
        description="View emails successfully sent from your linked Gmail account."
        actions={
          <div className="relative" ref={sortMenuRef}>
            <Button
              variant="outline"
              className="rounded-xl border-border bg-card hover:bg-beige"
              onClick={() => setShowSortMenu((v) => !v)}
            >
              <ArrowDownUp className="mr-2 h-4 w-4" />
              {currentSortLabel}
              <ChevronDown className="ml-1.5 h-3 w-3 opacity-60" />
            </Button>
            {showSortMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-card py-1 shadow-lifted">
                {sortOptions.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => {
                      setSort(o.value);
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-beige cursor-pointer",
                      sort === o.value && "font-semibold text-navy",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl border-border bg-background pl-9"
              placeholder="Search by subject or recipient…"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  filter === f
                    ? "border-navy bg-navy text-ivory"
                    : "border-border bg-card text-charcoal-soft hover:bg-beige",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-border bg-parchment/40 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <input
            id="sent-select-all"
            type="checkbox"
            className="mr-2 h-3.5 w-3.5 accent-navy cursor-pointer"
            aria-label="Select all emails on this page"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={() => {
              if (isAllSelected) {
                setSelectedIds([]);
              } else {
                setSelectedIds(visibleIds);
              }
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-rust hover:text-rust"
            disabled={selectedIds.length === 0 || processingAction}
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
            {selectedIds.length > 0 && (
              <span className="ml-0.5 rounded-full bg-rust/10 px-1.5 py-0.5 text-[10px] font-semibold text-rust">
                {selectedIds.length}
              </span>
            )}
          </Button>
          <div className="ml-auto">
            {loading ? "Loading…" : `${emails.length} of ${totalCount} shown`}
          </div>
        </div>

        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-navy" />
              <span className="text-sm">Loading sent mail...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <span className="text-sm">
                {totalCount === 0
                  ? "No sent emails found."
                  : "No messages match the current filter."}
              </span>
            </div>
          ) : (
            emails.map((e) => (
              <EmailRow
                key={e.id}
                email={e}
                isSelected={selectedIds.includes(e.id)}
                onSelectToggle={(id) => {
                  setSelectedIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  );
                }}
                from="sent"
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-parchment/40 px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <span>
            Page {page + 1} of {totalPages}
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
              disabled={page >= totalPages - 1}
              onClick={handleNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
