import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Send,
  Copy,
  History,
  Plus,
  Mail,
  MessagesSquare,
  FileText,
  ArrowRight,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Avatar, CategoryBadge, formatEmailDate } from "@/components/email-bits";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
// date-fns format removed in favor of safe formatEmailDate helper
import { getAgentHistoryAction, askAgentAction, createNewSessionAction, renameChatSessionAction, deleteChatSessionAction } from "@/lib/gmail/actions";
import { isDemoMode, getDemoAgentHistory, getDemoAgentResponse } from "@/lib/gmail/demoDb";

export const Route = createFileRoute("/_app/agent")({
  head: () => ({ meta: [{ title: "AI Agent — Repeatless AI" }] }),
  component: Agent,
});

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: {
    id: string;
    threadId: string;
    senderName: string;
    senderEmail: string;
    senderInitials: string;
    avatarColor: string;
    subject: string;
    category: "Work" | "Newsletter" | "Job" | "Finance" | "Personal" | "Notification";
    matchReason?: string;
    relevanceScore?: number;
    unread?: boolean;
  }[];
  searchedCount?: number;
  matchedCount?: number;
};

const suggestedPrompts = [
  "What are the most important emails I haven't replied to?",
  "Summarize my unread emails from the past week.",
  "Are there any action items or deadlines in my inbox?",
  "Who have I been emailing the most recently?",
];

function Agent() {
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [modelLabel, setModelLabel] = useState("Gemini 2.5 Pro");
  const isDemo = isDemoMode();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const activeModel = localStorage.getItem("repeatless_ai_model") || "gemini-2.5-pro";
      const formatted = activeModel
        .replace("models/", "")
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      setModelLabel(formatted);
    }
  }, []);

  const loadAgentHistory = useCallback((sessId: string | null) => {
    setLoading(true);
    const fetchPromise = isDemo
      ? getDemoAgentHistory()
      : getAgentHistoryAction({ data: sessId ?? undefined });

    fetchPromise
      .then((res) => {
        setSessions(res.sessions);
        setActiveSessionId(res.activeSessionId);
        setMessages(res.messages as any);
      })
      .catch((err) => {
        console.error("Failed to load agent history:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isDemo]);

  useEffect(() => {
    loadAgentHistory(activeSessionId);

    const handleSyncComplete = () => {
      loadAgentHistory(activeSessionId);
    };

    window.addEventListener("gmail-synced", handleSyncComplete);
    return () => {
      window.removeEventListener("gmail-synced", handleSyncComplete);
    };
  }, [activeSessionId, locationKey, loadAgentHistory]);

  async function handleNewSession() {
    const title = prompt("Enter a topic for the new conversation:", "New Conversation");
    if (!title) return;
    if (isDemo) {
      const newId = "demo-sess-" + Date.now();
      setSessions(prev => [
        { id: newId, title, date: new Date().toISOString() },
        ...prev
      ]);
      setActiveSessionId(newId);
      setMessages([]);
      return;
    }
    try {
      setLoading(true);
      const newSess = await createNewSessionAction({ data: title });
      setActiveSessionId(newSess.id);
    } catch (err) {
      console.error("Failed to create new session:", err);
      alert("Failed to create conversation session.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRenameSession(id: string, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation();
    const newTitle = prompt("Enter a new title for this conversation:", currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle === currentTitle) return;

    try {
      if (isDemo) {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle.trim() } : s));
        toast.success("Conversation renamed (demo)");
      } else {
        await renameChatSessionAction({ data: { sessionId: id, title: newTitle.trim() } });
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle.trim() } : s));
        toast.success("Conversation renamed successfully");
      }
    } catch (err) {
      console.error("Failed to rename conversation:", err);
      toast.error("Failed to rename conversation.");
    }
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation history?")) return;

    try {
      if (isDemo) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeSessionId === id) {
          const remaining = sessions.filter(s => s.id !== id);
          setActiveSessionId(remaining[0]?.id || null);
          setMessages([]);
        }
        toast.success("Conversation deleted (demo)");
      } else {
        await deleteChatSessionAction({ data: id });
        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeSessionId === id) {
          const remaining = sessions.filter(s => s.id !== id);
          setActiveSessionId(remaining[0]?.id || null);
          setMessages([]);
        }
        toast.success("Conversation deleted successfully");
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      toast.error("Failed to delete conversation.");
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || !activeSessionId || sending) return;

    const userMsg: Msg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const preferredModel = typeof window !== "undefined" ? localStorage.getItem("repeatless_ai_model") || "gemini-2.5-pro" : "gemini-2.5-pro";
      const promise = isDemo
        ? getDemoAgentResponse(content, messages)
        : askAgentAction({
            data: {
              query: content,
              sessionId: activeSessionId,
              history: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
              model: preferredModel,
            },
          });

      const response = await promise;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.content,
          sources: response.sources as any,
          searchedCount: (response as any).searchedCount,
          matchedCount: (response as any).matchedCount,
        },
      ]);
    } catch (err) {
      console.error("Failed to query AI Agent:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error answering your request. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell title="AI Agent">
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8 grid h-[calc(100dvh-4rem)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* History sidebar */}
        <aside className="hidden border-r border-border bg-sidebar lg:flex lg:flex-col">
          <div className="p-4">
            <Button
              onClick={handleNewSession}
              disabled={loading}
              className="h-10 w-full justify-start rounded-xl bg-card text-charcoal hover:bg-beige"
            >
              <Plus className="mr-2 h-4 w-4" /> New conversation
            </Button>
          </div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div className="flex items-center gap-1.5 px-1">
              <History className="h-3 w-3" /> History
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading && sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group relative flex items-center justify-between rounded-lg transition-colors",
                    activeSessionId === s.id ? "bg-beige text-charcoal" : "text-charcoal-soft hover:bg-beige/60"
                  )}
                >
                  <button
                    onClick={() => setActiveSessionId(s.id)}
                    className="flex-1 min-w-0 px-3 py-2 text-left text-sm"
                  >
                    <div className="truncate font-medium pr-10">{s.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatEmailDate(s.date, "MMM d")}
                    </div>
                  </button>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-beige/95 dark:bg-card/95 pl-2 py-1 rounded-md">
                    <button
                      onClick={(e) => handleRenameSession(s.id, s.title, e)}
                      className="p-1 text-muted-foreground hover:text-navy dark:hover:text-gold hover:bg-navy/5 rounded transition-colors"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="p-1 text-muted-foreground hover:text-rust hover:bg-rust/5 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Conversation */}
        <div className="flex min-h-0 flex-col bg-background">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
              <div className="mb-8 flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-forest text-ivory">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-serif text-base font-semibold">Repeatless Agent</div>
                  <div className="text-xs text-muted-foreground">
                    Connected to your Gmail · {modelLabel}
                  </div>
                </div>
              </div>

              {loading && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-navy" />
                  <span className="text-sm">Loading chat...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((m, i) => (
                    <MessageBubble key={i} m={m} />
                  ))}
                  {sending && (
                    <div className="flex gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-forest text-ivory">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-center py-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-navy" />
                          <span>Thinking...</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/80 pl-6">
                          <span className="h-1.5 w-1.5 rounded-full bg-navy animate-ping" />
                          <span>Searching entire mailbox (RAG query)...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border bg-background">
            <div className="mx-auto max-w-3xl px-4 py-4 sm:px-8">
              {messages.length <= 2 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {suggestedPrompts.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      disabled={sending}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-charcoal-soft transition-colors hover:bg-beige hover:text-charcoal"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
              <div className="surface-card flex items-end gap-2 p-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask about your emails…"
                  className="min-h-[44px] flex-1 resize-none border-0 bg-transparent text-[15px] focus-visible:ring-0"
                  rows={1}
                  disabled={sending}
                />
                <Button
                  onClick={() => send()}
                  disabled={sending}
                  className="h-10 w-10 shrink-0 rounded-lg bg-navy p-0 text-ivory hover:bg-navy/90"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-center text-[11px] text-muted-foreground">
                Repeatless can make mistakes. Verify important details against the source emails.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[15px] text-ivory">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-forest text-ivory">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-relaxed text-charcoal">{m.content}</p>

        {m.searchedCount !== undefined && m.matchedCount !== undefined && (
          <div className="mt-2 text-xs text-muted-foreground bg-beige/40 dark:bg-card/40 px-2.5 py-1.5 rounded-lg border border-border inline-flex items-center gap-1.5 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-forest animate-pulse" />
            <span>Searched entire mailbox ({m.searchedCount.toLocaleString()} emails) and found {m.matchedCount} matching email{m.matchedCount !== 1 ? "s" : ""}.</span>
          </div>
        )}

        {m.sources && m.sources.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <FileText className="h-3 w-3" /> {m.sources.length} sources referenced
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {m.sources.map((s) => (
                <Link
                  key={s.id}
                  to="/threads/$threadId"
                  params={{ threadId: s.threadId }}
                  className={cn(
                    "group surface-card flex items-start gap-3 p-3 transition-all hover:shadow-lifted relative",
                    s.unread ? "bg-white dark:bg-card border-l-2 border-l-[#1a73e8]" : "bg-transparent border border-border/80"
                  )}
                >
                  {/* Unread indicator dot */}
                  {s.unread && (
                    <span
                      className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#1a73e8]"
                      aria-label="Unread source email"
                    />
                  )}
                  <Avatar initials={s.senderInitials} color={s.avatarColor} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "truncate text-xs text-charcoal",
                        s.unread ? "font-bold" : "font-medium"
                      )}>
                        {s.senderName}
                      </span>
                      <CategoryBadge category={s.category} />
                    </div>
                    <div className={cn(
                      "mt-0.5 truncate text-xs",
                      s.unread ? "font-semibold text-charcoal" : "text-charcoal-soft"
                    )}>{s.subject}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground/80">
                      {s.matchReason && (
                        <span className="bg-beige dark:bg-card px-1.5 py-0.5 rounded border border-border/60 font-medium capitalize">
                          {s.matchReason} Match
                        </span>
                      )}
                      {s.relevanceScore !== undefined && (
                        <span className="bg-forest/10 dark:bg-forest/20 text-forest px-1.5 py-0.5 rounded font-semibold">
                          Score: {Math.round(s.relevanceScore * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-navy" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <MessagesSquare className="h-3 w-3" /> Follow up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Mail className="h-3 w-3" /> Draft reply
          </Button>
        </div>
      </div>
    </div>
  );
}
