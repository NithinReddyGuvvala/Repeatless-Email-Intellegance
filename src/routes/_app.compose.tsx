import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Sparkles, Send, Save, Trash2, Eye, Pencil, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/compose")({
  head: () => ({ meta: [{ title: "Compose — Repeatless AI" }] }),
  component: Compose,
});

const sample = `Hi Eleanor,

Thanks for circulating the Q4 agenda. A few quick thoughts before tomorrow:

• Berlin office — given Sofia's note on Madrid's July 3 lease, I'd like to make the call this week. I'm leaning yes, with a phased fit-out.
• Helios renewal — I've reviewed Marcus's two scenarios; option B (24-month, indexed) looks materially better. Happy to walk through.
• Engineering headcount — supportive of the original ask. Will share a one-pager.

See you at 9.

Alex`;

function Compose() {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState(sample);
  return (
    <AppShell title="Compose">
      <PageHeader
        eyebrow="New message"
        title="Compose"
        description="Describe what you want to say. Repeatless drafts it in your voice."
        actions={
          <>
            <Button variant="ghost" className="rounded-xl">
              <Trash2 className="mr-2 h-4 w-4" /> Discard
            </Button>
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            <Button className="rounded-xl bg-navy text-ivory hover:bg-navy/90">
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="surface-card overflow-hidden">
          <div className="space-y-0 border-b border-border">
            <Field label="To" defaultValue="eleanor@acmecorp.com" />
            <Field label="Cc" defaultValue="sofia@acmecorp.com" />
            <Field label="Subject" defaultValue="Re: Q4 strategy review — final agenda" />
          </div>

          <div className="flex items-center gap-1 border-b border-border bg-parchment/40 px-4 py-2">
            {(["edit", "preview"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium capitalize",
                  mode === m
                    ? "bg-card text-charcoal shadow-soft"
                    : "text-charcoal-soft hover:text-charcoal",
                )}
              >
                {m === "edit" ? (
                  <Pencil className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {m}
              </button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">{draft.length} characters</div>
          </div>

          {mode === "edit" ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[420px] rounded-none border-0 bg-transparent p-6 font-serif text-[16px] leading-relaxed focus-visible:ring-0"
            />
          ) : (
            <div className="min-h-[420px] whitespace-pre-wrap p-6 font-serif text-[16px] leading-relaxed text-charcoal">
              {draft}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-forest" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Draft with AI
              </span>
            </div>
            <Textarea
              placeholder="Reply confirming we're a yes on Berlin, lean toward Helios option B, and supportive on headcount. Keep it brief and warm."
              className="mt-3 min-h-[120px] rounded-xl border-border bg-background"
            />
            <Button className="mt-3 w-full rounded-xl bg-forest text-ivory hover:bg-forest/90">
              <Wand2 className="mr-2 h-4 w-4" /> Generate draft
            </Button>
          </div>

          <div className="surface-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Tone & length
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {["Concise", "Standard", "Detailed"].map((t, i) => (
                <button
                  key={t}
                  className={cn(
                    "rounded-lg border px-2 py-2 font-medium transition-colors",
                    i === 1
                      ? "border-navy bg-navy text-ivory"
                      : "border-border bg-card text-charcoal-soft hover:bg-beige",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              {["Formal", "Warm", "Direct"].map((t, i) => (
                <button
                  key={t}
                  className={cn(
                    "rounded-lg border px-2 py-2 font-medium transition-colors",
                    i === 1
                      ? "border-navy bg-navy text-ivory"
                      : "border-border bg-card text-charcoal-soft hover:bg-beige",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <label className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
      <span className="w-14 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        defaultValue={defaultValue}
        className="h-8 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
      />
    </label>
  );
}
