import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ArrowDownUp,
  Inbox,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getArchivedEmailsAction, restoreEmailsAction, permanentlyDeleteEmailsAction } from "@/lib/gmail/actions";
import { toast } from "sonner";
import { useSelectionState, computeSelectAllState } from "@/lib/useSelectionState";
import { isDemoMode, getDemoArchivedEmails, demoRestoreEmails, demoPermanentlyDeleteEmails } from "@/lib/gmail/demoDb";

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/archived")({
  head: () => ({ meta: [{ title: "Archived — Repeatless AI" }] }),
  component: ArchivedPage,
  errorComponent: RouteErrorComponent,
});

const filters = [
  "All",
  "Unread",
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
  { value: "unread", label: "Unread first" },
] as const;

const PAGE_SIZE = 50;

function ArchivedPage() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [emails, setEmails] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("archived_cursors");
      return saved ? JSON.parse(saved) : [null];
    }
    return [null];
  });
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const p = sessionStorage.getItem("archived_page");
      return p ? parseInt(p, 10) : 0;
    }
    return 0;
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof filters)[number]>(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("archived_filter") as any) || "All";
    }
    return "All";
  });
  const [sort, setSort] = useState<"newest" | "oldest" | "unread">(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("archived_sort") as any) || "newest";
    }
    return "newest";
  });
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("archived_search") || "";
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

  // Derived select-all state computed from current visible emails
  const visibleIds = emails.map((e) => e.id);
  const { isAllSelected, isIndeterminate } = computeSelectAllState(selectedIds, visibleIds);

  const handleRestore = async () => {
    if (selectedIds.length === 0) return;
    setProcessingAction(true);
    const idsToProcess = [...selectedIds];

    // Compute how many unread emails are being restored
    const restoredUnreadCount = emails.filter(
      (e) => idsToProcess.includes(e.id) && e.labels?.map((l: string) => l.toUpperCase()).includes("UNREAD")
    ).length;
    
    // Optimistic UI update
    setEmails((prev) => prev.filter((e) => !idsToProcess.includes(e.id)));
    setTotalCount((prev) => Math.max(0, prev - idsToProcess.length));
    setSelectedIds([]);

    const promise = isDemo
      ? demoRestoreEmails(idsToProcess)
      : restoreEmailsAction({ data: idsToProcess });

    toast.promise(
      promise,
      {
        loading: `Restoring ${idsToProcess.length} email(s) to Inbox...`,
        success: () => {
          if (restoredUnreadCount > 0) {
            window.dispatchEvent(
              new CustomEvent("gmail-unread-changed", { detail: { delta: restoredUnreadCount } })
            );
          } else {
            window.dispatchEvent(new CustomEvent("gmail-synced"));
          }
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Successfully restored ${idsToProcess.length} email(s) to Inbox.`;
        },
        error: (err) => {
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Failed to restore: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
    setProcessingAction(false);
  };

  const handleDeletePermanently = async () => {
    if (selectedIds.length === 0) return;
    setProcessingAction(true);
    const idsToProcess = [...selectedIds];

    // Compute how many unread emails are being permanently deleted
    const deletedUnreadCount = emails.filter(
      (e) => idsToProcess.includes(e.id) && e.labels?.map((l: string) => l.toUpperCase()).includes("UNREAD")
    ).length;
    
    // Optimistic UI update
    setEmails((prev) => prev.filter((e) => !idsToProcess.includes(e.id)));
    setTotalCount((prev) => Math.max(0, prev - idsToProcess.length));
    setSelectedIds([]);

    const promise = isDemo
      ? demoPermanentlyDeleteEmails(idsToProcess)
      : permanentlyDeleteEmailsAction({ data: idsToProcess });

    toast.promise(
      promise,
      {
        loading: `Permanently deleting ${idsToProcess.length} email(s)...`,
        success: () => {
          if (deletedUnreadCount > 0) {
            window.dispatchEvent(
              new CustomEvent("gmail-unread-changed", { detail: { delta: -deletedUnreadCount } })
            );
          } else {
            window.dispatchEvent(new CustomEvent("gmail-synced"));
          }
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Successfully deleted ${idsToProcess.length} email(s) permanently.`;
        },
        error: (err) => {
          loadEmails(filter, sort, search, page, cursors[page]);
          return `Failed to delete permanently: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
    setProcessingAction(false);
  };

  const loadEmails = useCallback(
    (f: string, s: string, q: string, pageNum: number, cursorVal: string | null) => {
      setLoading(true);
      const fetchPromise = isDemo
        ? getDemoArchivedEmails({ filter: f, sort: s, search: q, page: pageNum })
        : getArchivedEmailsAction({
            data: {
              filter: f,
              sort: s,
              search: q,
              cursor: cursorVal || undefined,
              pageSize: PAGE_SIZE
            }
          });

      fetchPromise
        .then((res) => {
          setEmails(res.emails);
          setTotalCount(res.totalCount);
          // Calculate unread count among current mapped archived emails,
          // though typically archived emails are read.
          const unreadNum = res.emails.filter((e: any) =>
            e.labels?.map((l: string) => l.toUpperCase()).includes("UNREAD")
          ).length;
          setUnreadCount(unreadNum);
          if (res.nextCursor) {
            setCursors((prev) => {
              const copy = [...prev];
              copy[pageNum + 1] = res.nextCursor;
              return copy;
            });
          }
        })
        .catch((err) => console.error("Failed to load archived emails:", err))
        .finally(() => setLoading(false));
    },
    [isDemo],
  );

  const isInitialMountRef = useRef(true);
  const isInitialSearchMountRef = useRef(true);

  // Sync state to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("archived_filter", filter);
      sessionStorage.setItem("archived_sort", sort);
      sessionStorage.setItem("archived_search", search);
      sessionStorage.setItem("archived_page", page.toString());
      sessionStorage.setItem("archived_cursors", JSON.stringify(cursors));
    }
  }, [filter, sort, search, page, cursors]);

  // Scroll listener & restore hooks
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("archived_scroll", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!loading && emails.length > 0) {
      const savedScroll = sessionStorage.getItem("archived_scroll");
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

    const handleUnreadChanged = () => {
      loadEmails(filter, sort, search, page, cursors[page]);
    };

    window.addEventListener("gmail-synced", handleSyncComplete);
    window.addEventListener("gmail-unread-changed", handleUnreadChanged);
    return () => {
      window.removeEventListener("gmail-synced", handleSyncComplete);
      window.removeEventListener("gmail-unread-changed", handleUnreadChanged);
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

  // Close sort dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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
    <AppShell title="Archived">
      <PageHeader
        eyebrow={
          loading
            ? "Loading archived messages..."
            : `${totalCount.toLocaleString()} archived message${totalCount !== 1 ? "s" : ""}`
        }
        title="Archived"
        description="All conversations removed from Inbox. Restore them or delete them permanently."
        actions={
          <>
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
                        "block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-beige",
                        sort === o.value && "font-semibold text-navy",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
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
              placeholder="Search archived messages…"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
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
            id="archived-select-all"
            type="checkbox"
            className="mr-2 h-3.5 w-3.5 accent-navy cursor-pointer"
            aria-label="Select all archived emails on this page"
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
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={selectedIds.length === 0 || processingAction}
            onClick={handleRestore}
          >
            <Inbox className="h-3.5 w-3.5" /> Restore to Inbox
            {selectedIds.length > 0 && (
              <span className="ml-0.5 rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold text-navy">
                {selectedIds.length}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-rust hover:text-rust"
            disabled={selectedIds.length === 0 || processingAction}
            onClick={handleDeletePermanently}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete permanently
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
              <span className="text-sm">Loading archived messages...</span>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <span className="text-sm">
                {totalCount === 0
                  ? "No archived messages found."
                  : "No archived messages match the current filter."}
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
                from="archived"
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
