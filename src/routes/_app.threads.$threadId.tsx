import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Avatar, CategoryBadge } from "@/components/email-bits";
import { Button } from "@/components/ui/button";
import {
  Reply,
  Forward,
  Archive,
  Tag,
  ExternalLink,
  Sparkles,
  Paperclip,
  ChevronLeft,
  FileText,
} from "lucide-react";
import { threads, type Thread } from "@/lib/mock-data";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/threads/$threadId")({
  head: () => ({ meta: [{ title: "Thread — Repeatless AI" }] }),
  loader: ({ params }) => {
    const t = threads.find((x) => x.id === params.threadId);
    if (!t) throw notFound();
    return t;
  },
  notFoundComponent: () => (
    <AppShell title="Thread not found">
      <div className="surface-card p-10 text-center">
        <p className="text-muted-foreground">This thread doesn't exist.</p>
        <Link to="/threads" className="mt-3 inline-block text-sm text-navy hover:underline">
          Back to threads
        </Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell title="Error">
      <div className="surface-card p-10 text-center text-rust">Couldn't load thread.</div>
    </AppShell>
  ),
  component: ThreadView,
});

function ThreadView() {
  const t = Route.useLoaderData() as Thread;
  return (
    <AppShell title={t.subject}>
      <Link
        to="/threads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-charcoal"
      >
        <ChevronLeft className="h-4 w-4" /> All threads
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="surface-card p-6">
            <div className="mb-2 flex items-center gap-2">
              <CategoryBadge category={t.category} />
              <span className="text-xs text-muted-foreground">{t.messages.length} messages · {t.participants.length} participants</span>
            </div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-charcoal sm:text-[28px]">
              {t.subject}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="rounded-xl bg-navy text-ivory hover:bg-navy/90">
                <Reply className="mr-2 h-4 w-4" /> Reply
              </Button>
              <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
                <Forward className="mr-2 h-4 w-4" /> Forward
              </Button>
              <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
              <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
                <Tag className="mr-2 h-4 w-4" /> Categorize
              </Button>
              <Button variant="ghost" className="rounded-xl">
                <ExternalLink className="mr-2 h-4 w-4" /> Open in Gmail
              </Button>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {t.messages.map((m, idx) => (
              <div key={m.id} className="surface-card overflow-hidden">
                <div className="flex items-start gap-4 border-b border-border p-5">
                  <Avatar initials={m.senderInitials} color={m.avatarColor} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-charcoal">{m.senderName}</span>
                      <span className="text-xs text-muted-foreground">{m.senderEmail}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      to me · {format(new Date(m.date), "PPp")}
                    </div>
                  </div>
                  {idx === 0 && (
                    <span className="rounded-md bg-forest/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-forest">
                      Original
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap p-5 text-[15px] leading-relaxed text-charcoal-soft">
                  {m.body}
                </div>
                {m.hasAttachments && (
                  <div className="flex items-center gap-2 border-t border-border bg-parchment/40 px-5 py-3 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    Q4_Review_Agenda.pdf · 1.4 MB
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-navy" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Thread summary
              </span>
            </div>
            <p className="mt-3 text-[14.5px] leading-relaxed text-charcoal">{t.summary}</p>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-forest" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                AI insights
              </span>
            </div>
            <ul className="mt-3 space-y-2.5 text-sm text-charcoal-soft">
              {t.insights.map((i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="surface-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Participants
            </div>
            <div className="mt-3 space-y-2.5">
              {t.messages.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <Avatar initials={m.senderInitials} color={m.avatarColor} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-charcoal">{m.senderName}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.senderEmail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}