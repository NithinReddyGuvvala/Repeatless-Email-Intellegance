import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Avatar, CategoryBadge, formatEmailRelative } from "@/components/email-bits";
import { MessagesSquare, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { getThreadsAction } from "@/lib/gmail/actions";
import { isDemoMode, getDemoThreads } from "@/lib/gmail/demoDb";
import { cn } from "@/lib/utils";

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/threads/")({
  head: () => ({ meta: [{ title: "Threads — Repeatless AI" }] }),
  component: ThreadsList,
  errorComponent: RouteErrorComponent,
});

function ThreadsList() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [threads, setThreads] = useState<any[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("threads_list");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [totalCount, setTotalCount] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("threads_total_count");
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [hasMore, setHasMore] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("threads_has_more");
      return saved === "true";
    }
    return false;
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("threads_list");
      return saved ? false : true;
    }
    return true;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDemo = isDemoMode();

  const fetchPage = useCallback(async (currentOffset: number, isInitial: boolean) => {
    if (isInitial) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      if (isDemo) {
        const pageNum = Math.floor(currentOffset / 20);
        const res = await getDemoThreads({ page: pageNum });
        if (isInitial) {
          setThreads(res.threads || []);
        } else {
          setThreads(prev => [...prev, ...(res.threads || [])]);
        }
        setTotalCount(res.totalCount);
        setHasMore(!!res.nextCursor);
        return;
      }

      const res = await getThreadsAction({
        data: { limit: 50, offset: currentOffset }
      });
      const returnedCount = res.threads?.length ?? 0;
      const totalCountVal = res.totalCount ?? 0;
      console.log(`[getThreadsAction Client] Loaded ${returnedCount} threads. Supabase Total Count: ${totalCountVal}`);

      if (isInitial) {
        setThreads(res.threads || []);
      } else {
        setThreads(prev => [...prev, ...(res.threads || [])]);
      }
      setTotalCount(totalCountVal);
      setHasMore(!!res.hasMore);
    } catch (err) {
      console.error("[ThreadsList] Failed to fetch threads:", err);
      if (isInitial) {
        setError(err instanceof Error ? err.message : "Failed to load threads.");
      }
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [isDemo]);

  const loadInitial = useCallback(() => {
    fetchPage(0, true).catch(() => {});
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(threads.length, false).catch(() => {});
  }, [loading, loadingMore, hasMore, threads.length, fetchPage]);

  // Sync state to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("threads_list", JSON.stringify(threads));
      sessionStorage.setItem("threads_total_count", totalCount.toString());
      sessionStorage.setItem("threads_has_more", hasMore ? "true" : "false");
    }
  }, [threads, totalCount, hasMore]);

  // Scroll listener & restore hooks
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("threads_scroll", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!loading && threads.length > 0) {
      const savedScroll = sessionStorage.getItem("threads_scroll");
      if (savedScroll) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedScroll, 10));
        }, 100);
      }
    }
  }, [loading, threads]);

  useEffect(() => {
    const hasCache = typeof window !== "undefined" && sessionStorage.getItem("threads_list");
    if (!hasCache) {
      loadInitial();
    }

    const handleSync = () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("threads_list");
        sessionStorage.removeItem("threads_total_count");
        sessionStorage.removeItem("threads_has_more");
        sessionStorage.removeItem("threads_scroll");
      }
      loadInitial();
    };
    window.addEventListener("gmail-synced", handleSync);
    window.addEventListener("gmail-unread-changed", handleSync);
    return () => {
      window.removeEventListener("gmail-synced", handleSync);
      window.removeEventListener("gmail-unread-changed", handleSync);
    };
  }, [locationKey, loadInitial]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById("threads-sentinel");
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, loadingMore, loadMore]);

  return (
    <AppShell title="Threads">
      <PageHeader
        eyebrow={
          loading
            ? "Loading conversations..."
            : error
            ? "Error loading threads"
            : `${totalCount} conversation${totalCount !== 1 ? "s" : ""}`
        }
        title="Threads"
        description="Multi-message conversations grouped and summarised for fast scanning."
      />
      <div className="surface-card divide-y divide-border overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-navy" />
            <span className="text-sm">Loading conversations...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <span className="text-sm text-rust">{error}</span>
            <button
              onClick={loadInitial}
              className="text-sm text-navy hover:underline"
            >
              Try again
            </button>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <MessagesSquare className="h-8 w-8 text-muted-foreground/40" />
            <span className="text-sm font-medium">No threads found.</span>
            <span className="text-xs text-muted-foreground/70">
              Sync your Gmail account to load conversations.
            </span>
          </div>
        ) : (
          threads.map((t) => (
            <Link
              key={t.id}
              to="/threads/$threadId"
              params={{ threadId: t.id }}
              search={{ from: "threads" }}
              className={cn(
                "block p-5 transition-colors hover:bg-beige/60 sm:p-6",
                t.unread ? "bg-white dark:bg-card" : "bg-transparent",
              )}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center">
                <div className="min-w-0 flex-1">
                  {/* Sender + meta row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Blue unread dot — always occupies space to keep layout stable */}
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition-all duration-200",
                        t.unread
                          ? "bg-[#1a73e8] opacity-100 scale-100"
                          : "bg-transparent opacity-0 scale-75",
                      )}
                      aria-label={t.unread ? "Unread thread" : undefined}
                    />
                    <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span
                      className={cn(
                        "text-xs",
                        t.unread
                          ? "font-bold text-charcoal"
                          : "font-normal text-muted-foreground",
                      )}
                    >
                      {t.latestSender || "Unknown Sender"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({t.messages.length} message{t.messages.length !== 1 ? "s" : ""} · {t.participantCount} participant{t.participantCount !== 1 ? "s" : ""})
                    </span>
                    <CategoryBadge category={t.category} />
                  </div>

                  {/* Subject */}
                  <div
                    className={cn(
                      "mt-2 font-serif text-lg text-charcoal",
                      t.unread ? "font-bold" : "font-semibold",
                    )}
                  >
                    {t.subject}
                  </div>

                  {/* Preview / summary */}
                  <p className={cn(
                    "mt-1.5 line-clamp-2 text-sm",
                    t.unread ? "text-charcoal/70" : "text-charcoal-soft",
                  )}>
                    {t.summary}
                  </p>

                  {/* Participant avatars */}
                  {t.messages.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex -space-x-2">
                        {t.messages.slice(0, 3).map((m: any) => (
                          <div key={m.id} className="ring-2 ring-card rounded-full">
                            <Avatar initials={m.senderInitials} color={m.avatarColor} size={26} />
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t.participants.join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    t.unread
                      ? "font-semibold text-charcoal"
                      : "font-medium text-muted-foreground",
                  )}
                >
                  {formatEmailRelative(t.lastActivity, { addSuffix: true })}
                </span>
              </div>
            </Link>
          ))

        )}
      </div>

      {/* Sentinel for infinite scroll */}
      {threads.length > 0 && (
        <div id="threads-sentinel" className="h-14 flex items-center justify-center mt-2">
          {loadingMore && (
            <Loader2 className="h-5 w-5 animate-spin text-navy" />
          )}
        </div>
      )}
    </AppShell>
  );
}
