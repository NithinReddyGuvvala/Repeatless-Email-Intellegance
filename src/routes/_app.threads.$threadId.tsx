import { createFileRoute, Link, notFound, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Avatar, CategoryBadge, formatEmailDate } from "@/components/email-bits";
import { RouteErrorComponent } from "./__root";
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
  Loader2,
} from "lucide-react";
import { type Thread } from "@/components/email-bits";
// date-fns format removed in favor of safe formatEmailDate helper
import {
  getThreadDetailAction,
  archiveEmailsAction,
  markEmailsReadAction,
  categorizeEmailsAction,
} from "@/lib/gmail/actions";
import {
  isDemoMode,
  getDemoThreadDetail,
  demoArchiveEmails,
  demoMarkEmailsRead,
  demoCategorizeEmails,
} from "@/lib/gmail/demoDb";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useState, useEffect, useRef, useCallback } from "react";
import { z } from "zod";

const threadSearchSchema = z.object({
  from: z.string().optional(),
});

export const Route = createFileRoute("/_app/threads/$threadId")({
  validateSearch: (search) => threadSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Thread — Repeatless AI" }] }),
  loader: async ({ params }) => {
    if (params.threadId.startsWith("demo-")) {
      return { id: params.threadId, isDemoPlaceholder: true };
    }
    try {
      const t = await getThreadDetailAction({ data: params.threadId });
      return t;
    } catch (err) {
      console.error("Failed to load thread details:", err);
      throw notFound();
    }
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
  errorComponent: RouteErrorComponent,
  component: ThreadView,
});

function ThreadView() {
  const router = useRouter();
  const loaderData = Route.useLoaderData() as Thread;
  const { threadId } = Route.useParams();
  const [demoThread, setDemoThread] = useState<any>(null);
  const [modelBadge, setModelBadge] = useState("gemini-2.5-pro");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeModel = localStorage.getItem("repeatless_ai_model") || "gemini-2.5-pro";
      setModelBadge(activeModel.replace("models/", ""));
    }
  }, []);

  const isDemo = threadId.startsWith("demo-") || (typeof window !== "undefined" && localStorage.getItem("inbox_harmony_demo") === "true");

  const loadDemoThread = useCallback(() => {
    const tDetail = getDemoThreadDetail(threadId);
    setDemoThread(tDetail);
  }, [threadId]);

  useEffect(() => {
    if (isDemo) {
      loadDemoThread();
    }
  }, [threadId, isDemo, loadDemoThread]);

  const t = isDemo ? demoThread : loaderData;

  const navigate = useNavigate();
  const { from } = Route.useSearch();

  const [archiving, setArchiving] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const markedReadRef = useRef(false);

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      if (from === "inbox") {
        navigate({ to: "/inbox" });
      } else if (from === "archived") {
        navigate({ to: "/archived" });
      } else if (from === "categories") {
        navigate({ to: "/categories" });
      } else if (from === "search") {
        navigate({ to: "/search" });
      } else if (from === "sent") {
        navigate({ to: "/sent" });
      } else if (from === "threads") {
        navigate({ to: "/threads" });
      } else if (from === "dashboard") {
        navigate({ to: "/dashboard" });
      } else {
        navigate({ to: "/threads" });
      }
    }
  };

  const getBackLabel = (fromVal?: string) => {
    switch (fromVal) {
      case "inbox":
        return "Back to Inbox";
      case "archived":
        return "Back to Archived";
      case "search":
        return "Back to Search";
      case "categories":
        return "Back to Categories";
      case "threads":
        return "Back to Threads";
      case "sent":
        return "Back to Sent Mail";
      case "dashboard":
        return "Back to Dashboard";
      default:
        return "All threads";
    }
  };

  // Mark all unread messages in this thread as read on mount
  useEffect(() => {
    if (markedReadRef.current || !t) return;
    markedReadRef.current = true;

    const unreadIds = t.messages
      .filter((m: any) => m.unread)
      .map((m: any) => m.id);

    if (unreadIds.length === 0) return;

    const promise = isDemo
      ? demoMarkEmailsRead(unreadIds)
      : markEmailsReadAction({ data: unreadIds });

    promise
      .then((res) => {
        if (res.count > 0) {
          // Notify sidebar/dashboard/inbox that unread counts changed
          window.dispatchEvent(
            new CustomEvent("gmail-unread-changed", { detail: { delta: -res.count } })
          );
          if (isDemo) {
            loadDemoThread();
          }
        }
      })
      .catch((err) => {
        // Silent — reading emails should never surface an error to the user
        console.warn("[ThreadView] Failed to mark emails as read:", err);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, isDemo, loadDemoThread]);

  const handleReplyClick = () => {
    const lastMsg = t.messages[t.messages.length - 1];
    const recipient = lastMsg ? lastMsg.senderEmail : "";
    const replySubject = t.subject.toLowerCase().startsWith("re:") ? t.subject : `Re: ${t.subject}`;
    navigate({
      to: "/compose",
      search: {
        to: recipient,
        subject: replySubject,
        threadId: t.id,
      },
    });
  };

  const handleForwardClick = () => {
    const forwardHeader = `---------- Forwarded message ---------`;
    const forwardedContent = t.messages
      .map((m: any) => {
        const formattedDate = new Date(m.date).toLocaleString();
        const toList = m.toAddresses && m.toAddresses.length > 0 ? m.toAddresses.join(", ") : "me";
        return `${forwardHeader}\nFrom: ${m.senderName || "Unknown Sender"} <${m.senderEmail || ""}>\nDate: ${formattedDate}\nSubject: ${m.subject || "(No Subject)"}\nTo: ${toList}\n\n${m.body || ""}`;
      })
      .join("\n\n");

    const fwdSubject = t.subject.toLowerCase().startsWith("fwd:") ? t.subject : `Fwd: ${t.subject}`;

    navigate({
      to: "/compose",
      search: {
        to: "",
        subject: fwdSubject,
        body: forwardedContent,
      },
    });
  };

  const handleCategorize = async (category: "Newsletter" | "Job" | "Finance" | "Notification" | "Personal" | "Work") => {
    const emailIds = t.messages?.map((m: any) => m.id) || [];
    if (emailIds.length === 0) return;

    setCategorizing(true);
    const promise = isDemo
      ? demoCategorizeEmails(emailIds, category)
      : categorizeEmailsAction({ data: { emailIds, category } });

    toast.promise(
      promise,
      {
        loading: `Updating category to ${category}...`,
        success: () => {
          window.dispatchEvent(new CustomEvent("gmail-synced"));
          setCategorizing(false);
          if (isDemo) {
            loadDemoThread();
          } else {
            router.invalidate();
          }
          return `Category successfully updated to ${category}.`;
        },
        error: (err) => {
          setCategorizing(false);
          return `Failed to update category: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
  };

  const handleArchive = async () => {
    const emailIds = t.messages?.map((m: any) => m.id) || [];
    if (emailIds.length === 0) return;
    setArchiving(true);

    const unreadCount = t.messages.filter((m: any) => m.unread).length;

    const promise = isDemo
      ? demoArchiveEmails(emailIds)
      : archiveEmailsAction({ data: emailIds });

    toast.promise(
      promise,
      {
        loading: "Archiving conversation thread...",
        success: () => {
          if (unreadCount > 0) {
            window.dispatchEvent(
              new CustomEvent("gmail-unread-changed", { detail: { delta: -unreadCount } })
            );
          } else {
            window.dispatchEvent(new CustomEvent("gmail-synced"));
          }
          setArchiving(false);
          navigate({ to: from === "archived" ? "/archived" : "/inbox" });
          return "Thread successfully archived.";
        },
        error: (err) => {
          setArchiving(false);
          return `Failed to archive thread: ${err instanceof Error ? err.message : String(err)}`;
        },
      }
    );
  };

  if (!t) {
    return (
      <AppShell title="Loading thread...">
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-navy" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.subject}>
      <button
        onClick={handleBackClick}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-charcoal cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" /> {getBackLabel(from)}
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="surface-card p-6">
            <div className="mb-2 flex items-center gap-2">
              <CategoryBadge category={t.category} />
              <span className="text-xs text-muted-foreground">
                {t.messages.length} messages · {t.participants.length} participants
              </span>
            </div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-charcoal sm:text-[28px]">
              {t.subject}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="rounded-xl bg-navy text-ivory hover:bg-navy/90" onClick={handleReplyClick}>
                <Reply className="mr-2 h-4 w-4" /> Reply
              </Button>
              <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige" onClick={handleForwardClick}>
                <Forward className="mr-2 h-4 w-4" /> Forward
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-border bg-card hover:bg-beige"
                onClick={handleArchive}
                disabled={archiving}
              >
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige" disabled={categorizing}>
                    <Tag className="mr-2 h-4 w-4" /> Categorize
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-xl">
                  {["Work", "Personal", "Finance", "Newsletter", "Job", "Notification"].map((cat) => (
                    <DropdownMenuItem
                      key={cat}
                      onClick={() => handleCategorize(cat as any)}
                    >
                      {cat}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {t.gmailThreadId && (
                <Button variant="ghost" className="rounded-xl" asChild>
                  <a
                    href={`https://mail.google.com/mail/#all/${t.gmailThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Open in Gmail
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {t.messages.map((m: any, idx: number) => (
              <div key={m.id} className="surface-card overflow-hidden">
                <div className="flex items-start gap-4 border-b border-border p-5">
                  <Avatar initials={m.senderInitials} color={m.avatarColor} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium text-charcoal">{m.senderName}</span>
                      <span className="text-xs text-muted-foreground">{m.senderEmail}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.userEmails?.includes(m.senderEmail?.toLowerCase())
                        ? `to ${m.toAddresses && m.toAddresses.length > 0 ? m.toAddresses.join(", ") : "me"}`
                        : "to me"} · {formatEmailDate(m.date, "PPp")}
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-navy" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Thread summary
                </span>
              </div>
              <span className="rounded bg-navy/5 border border-navy/15 px-1.5 py-0.5 text-[9px] font-bold text-navy font-mono">
                Using: {modelBadge}
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
              {t.insights.map((i: string) => (
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
              {t.messages.map((m: any) => (
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
