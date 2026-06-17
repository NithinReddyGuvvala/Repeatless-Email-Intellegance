import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Avatar, CategoryBadge } from "@/components/email-bits";
import { threads } from "@/lib/mock-data";
import { formatDistanceToNow } from "date-fns";
import { MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/_app/threads/")({
  head: () => ({ meta: [{ title: "Threads — Repeatless AI" }] }),
  component: ThreadsList,
});

function ThreadsList() {
  return (
    <AppShell title="Threads">
      <PageHeader
        eyebrow="Active conversations"
        title="Threads"
        description="Multi-message conversations grouped and summarised for fast scanning."
      />
      <div className="surface-card divide-y divide-border">
        {threads.map((t) => (
          <Link
            key={t.id}
            to="/threads/$threadId"
            params={{ threadId: t.id }}
            className="block p-5 transition-colors hover:bg-beige/60 sm:p-6"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{t.messages.length} messages</span>
                  <CategoryBadge category={t.category} />
                </div>
                <div className="mt-2 font-serif text-lg font-semibold text-charcoal">
                  {t.subject}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-charcoal-soft">{t.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex -space-x-2">
                    {t.messages.slice(0, 3).map((m) => (
                      <div key={m.id} className="ring-2 ring-card rounded-full">
                        <Avatar initials={m.senderInitials} color={m.avatarColor} size={26} />
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t.participants.join(", ")}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(t.lastActivity), { addSuffix: true })}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}