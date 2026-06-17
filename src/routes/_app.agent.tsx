import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
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
} from "lucide-react";
import { chatHistory, suggestedPrompts, emails } from "@/lib/mock-data";
import { Avatar, CategoryBadge } from "@/components/email-bits";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/agent")({
  head: () => ({ meta: [{ title: "AI Agent — Repeatless AI" }] }),
  component: Agent,
});

type Msg = { role: "user" | "assistant"; content: string; sources?: typeof emails };

const seed: Msg[] = [
  {
    role: "user",
    content: "Summarize all emails from Acme Corp this month.",
  },
  {
    role: "assistant",
    content:
      "Acme Corp activity this month centres on Q4 strategy. Eleanor circulated the final review agenda and asked for decisions on three items: the Berlin office, the Helios renewal, and engineering headcount. Sofia flagged that the Madrid lease renewal on July 3 makes the Berlin call a hard deadline. Across the thread, the tone is collaborative but action-oriented — decisions are expected at tomorrow's review.",
    sources: emails.filter((e) => e.senderEmail.includes("acmecorp")),
  },
];

function Agent() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [input, setInput] = useState("");

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setMessages((m) => [
      ...m,
      { role: "user", content },
      {
        role: "assistant",
        content:
          "Here's what I found across your inbox. (This is a UI preview — wire to Gemini and pgvector to enable live retrieval.)",
        sources: emails.slice(0, 2),
      },
    ]);
    setInput("");
  }

  return (
    <AppShell title="AI Agent">
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 lg:-my-8 grid h-[calc(100dvh-4rem)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* History sidebar */}
        <aside className="hidden border-r border-border bg-sidebar lg:flex lg:flex-col">
          <div className="p-4">
            <Button className="h-10 w-full justify-start rounded-xl bg-card text-charcoal hover:bg-beige">
              <Plus className="mr-2 h-4 w-4" /> New conversation
            </Button>
          </div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div className="flex items-center gap-1.5 px-1">
              <History className="h-3 w-3" /> History
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {chatHistory.map((c, i) => (
              <button
                key={c.id}
                className={cn(
                  "block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  i === 0 ? "bg-beige text-charcoal" : "text-charcoal-soft hover:bg-beige/60",
                )}
              >
                <div className="truncate font-medium">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {format(new Date(c.date), "MMM d")}
                </div>
              </button>
            ))}
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
                    Connected to your Gmail · Gemini 2.5 Pro
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {messages.map((m, i) => (
                  <MessageBubble key={i} m={m} />
                ))}
              </div>
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
                />
                <Button
                  onClick={() => send()}
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
                  className="group surface-card flex items-start gap-3 p-3 transition-all hover:shadow-lifted"
                >
                  <Avatar initials={s.senderInitials} color={s.avatarColor} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-charcoal">{s.senderName}</span>
                      <CategoryBadge category={s.category} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-charcoal-soft">{s.subject}</div>
                  </div>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-navy" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
            <MessagesSquare className="h-3 w-3" /> Follow up
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" /> Draft reply
          </Button>
        </div>
      </div>
    </div>
  );
}