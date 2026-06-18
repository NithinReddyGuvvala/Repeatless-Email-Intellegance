import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  Loader2,
  FileText,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDraftsAction, deleteGmailDraftsAction } from "@/lib/gmail/actions";
import { toast } from "sonner";
import { isDemoMode, getDemoDrafts, demoDeleteDrafts } from "@/lib/gmail/demoDb";
import { formatEmailRelative } from "@/components/email-bits";

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/drafts")({
  head: () => ({ meta: [{ title: "Drafts — Repeatless AI" }] }),
  component: DraftsPage,
  errorComponent: RouteErrorComponent,
});

function DraftsPage() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processingAction, setProcessingAction] = useState(false);
  const isDemo = isDemoMode();
  const navigate = useNavigate();

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemo) {
        const res = await getDemoDrafts();
        setDrafts(res.drafts);
        setLoading(false);
        return;
      }

      const res = await getDraftsAction();
      setDrafts(res.drafts);
    } catch (err) {
      console.error("Failed to load drafts:", err);
      toast.error("Could not retrieve drafts from Gmail.");
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    setProcessingAction(true);
    const idsToProcess = [...selectedIds];

    // Optimistic UI update
    setDrafts((prev) => prev.filter((d) => !idsToProcess.includes(d.id)));
    setSelectedIds([]);

    const promise = isDemo
      ? demoDeleteDrafts(idsToProcess)
      : deleteGmailDraftsAction({ data: idsToProcess });

    toast.promise(
      promise,
      {
        loading: `Discarding ${idsToProcess.length} draft(s)...`,
        success: () => {
          loadDrafts();
          return `Successfully discarded ${idsToProcess.length} draft(s).`;
        },
        error: (err) => {
          loadDrafts();
          return `Failed to discard drafts: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
    setProcessingAction(false);
  };

  const handleRowClick = (draftId: string) => {
    navigate({
      to: "/compose",
      search: {
        draftId,
      },
    });
  };

  const isAllSelected = drafts.length > 0 && selectedIds.length === drafts.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < drafts.length;

  return (
    <AppShell title="Drafts">
      <PageHeader
        eyebrow={loading ? "Loading drafts..." : `${drafts.length} active drafts`}
        title="Drafts"
        description="Gmail drafts and templates. Click any row to continue writing or send."
      />

      <div className="surface-card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border bg-parchment/40 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <input
            id="drafts-select-all"
            type="checkbox"
            className="mr-2 h-3.5 w-3.5 accent-navy cursor-pointer"
            aria-label="Select all drafts"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={() => {
              if (isAllSelected) {
                setSelectedIds([]);
              } else {
                setSelectedIds(drafts.map((d) => d.id));
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
            <Trash2 className="h-3.5 w-3.5" /> Discard Draft
            {selectedIds.length > 0 && (
              <span className="ml-0.5 rounded-full bg-rust/10 px-1.5 py-0.5 text-[10px] font-semibold text-rust">
                {selectedIds.length}
              </span>
            )}
          </Button>
          <div className="ml-auto">
            {loading ? "Loading…" : `${drafts.length} drafts found`}
          </div>
        </div>

        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-navy" />
              <span className="text-sm">Loading drafts from Gmail...</span>
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <span className="text-sm">No drafts found in your Gmail account.</span>
            </div>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                onClick={() => handleRowClick(d.id)}
                className={cn(
                  "group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-beige/60 cursor-pointer sm:gap-4 sm:px-6",
                  selectedIds.includes(d.id) && "bg-beige/30",
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(d.id)}
                  onChange={() => {
                    setSelectedIds((prev) =>
                      prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                    );
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="h-4 w-4 rounded border-border border-2 accent-navy cursor-pointer z-10"
                />
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-beige text-charcoal-soft border border-border">
                  <Pencil className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-charcoal truncate">
                      {d.senderName}
                    </span>
                    <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold border border-gold/20">
                      Draft
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[14px] font-medium text-charcoal truncate">
                      {d.subject}
                    </span>
                    <span className="hidden text-[13px] text-muted-foreground sm:inline truncate">
                      — {d.preview}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <time className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    {formatEmailRelative(d.date, { addSuffix: false })}
                  </time>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
