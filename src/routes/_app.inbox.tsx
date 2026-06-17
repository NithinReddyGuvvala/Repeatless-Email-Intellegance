import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailRow } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  Archive,
  Tag,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { emails } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Repeatless AI" }] }),
  component: InboxPage,
});

const filters = ["All", "Unread", "Work", "Newsletter", "Finance", "Job", "Personal", "Notification"] as const;

function InboxPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const filtered =
    filter === "All"
      ? emails
      : filter === "Unread"
      ? emails.filter((e) => e.unread)
      : emails.filter((e) => e.category === filter);

  return (
    <AppShell title="Inbox">
      <PageHeader
        eyebrow={`${emails.length.toLocaleString()} messages · ${emails.filter((e) => e.unread).length} unread`}
        title="Inbox"
        description="Sorted by AI relevance, then recency. Use filters to focus."
        actions={
          <>
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters
            </Button>
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
              <ArrowDownUp className="mr-2 h-4 w-4" /> Sort
            </Button>
          </>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl border-border bg-background pl-9"
              placeholder="Search inbox…"
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
          <input type="checkbox" className="mr-2 h-3.5 w-3.5 accent-navy" aria-label="Select all" />
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
            <Tag className="h-3.5 w-3.5" /> Label
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <div className="ml-auto">{filtered.length} shown</div>
        </div>

        <div>
          {filtered.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-parchment/40 px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <span>Page 1 of 24</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}