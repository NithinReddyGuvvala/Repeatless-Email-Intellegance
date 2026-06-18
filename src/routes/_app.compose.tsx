import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { Sparkles, Send, Save, Trash2, Eye, Pencil, Wand2, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendGmailEmailAction, generateAIDraftAction, saveGmailDraftAction, checkGmailScopesAction, getGmailDraftAction } from "@/lib/gmail/actions";
import { isDemoMode, demoSendMessage, getDemoDrafts, demoSaveDraft } from "@/lib/gmail/demoDb";
import { toast } from "sonner";

type ComposeSearchParams = {
  to?: string;
  subject?: string;
  threadId?: string;
  body?: string;
  draftId?: string;
};

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/compose")({
  validateSearch: (search: Record<string, unknown>): ComposeSearchParams => {
    return {
      to: search.to as string | undefined,
      subject: search.subject as string | undefined,
      threadId: search.threadId as string | undefined,
      body: search.body as string | undefined,
      draftId: search.draftId as string | undefined,
    };
  },
  head: () => ({ meta: [{ title: "Compose — Repeatless AI" }] }),
  component: Compose,
  errorComponent: RouteErrorComponent,
});

function Compose() {
  const router = useRouter();
  const search = Route.useSearch();
  const isDemo = isDemoMode();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [draftId, setDraftId] = useState(search.draftId || "");
  const [to, setTo] = useState(search.to || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(search.subject || "");
  const [draft, setDraft] = useState(search.body || "");
  const [threadId] = useState(search.threadId || "");

  // Load draft details if draftId exists
  useEffect(() => {
    if (!draftId) return;

    const loadDraftDetails = async () => {
      try {
        if (isDemo) {
          const res = await getDemoDrafts();
          const found = res.drafts.find((d: any) => d.id === draftId);
          if (found) {
            setTo(found.senderEmail || "");
            setSubject(found.subject || "");
            setDraft(found.body || "");
          }
          return;
        }

        const res = await getGmailDraftAction({ data: draftId });
        if (res) {
          setTo(res.to || "");
          setCc(res.cc || "");
          setSubject(res.subject || "");
          setDraft(res.body || "");
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
        toast.error("Could not retrieve draft details.");
      }
    };

    loadDraftDetails();
  }, [draftId, isDemo]);
  
  // AI draft settings
  const [promptText, setPromptText] = useState("");
  const [tone, setTone] = useState("Standard");
  const [style, setStyle] = useState("Warm");
  
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Scope state — checked once on mount
  const [scopesMissing, setScopesMissing] = useState(false);
  const [scopesChecked, setScopesChecked] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setScopesMissing(false);
      setScopesChecked(true);
      return;
    }
    checkGmailScopesAction()
      .then((res) => {
        setScopesMissing(!res.hasRequiredScopes && !res.noAccount);
        setScopesChecked(true);
      })
      .catch(() => {
        // Non-fatal — allow compose to work, send will surface the real error
        setScopesChecked(true);
      });
  }, [isDemo]);

  // Validate email address format
  const validateEmails = (emailStr: string): boolean => {
    const list = emailStr.split(",").map(e => e.trim()).filter(Boolean);
    if (list.length === 0) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return list.every(e => emailRegex.test(e));
  };

  const handleSend = async () => {
    if (!to || !to.trim()) {
      toast.error("Please specify at least one recipient (To)");
      return;
    }
    
    if (!validateEmails(to)) {
      toast.error("Please enter valid recipient email address(es)");
      return;
    }

    if (cc && cc.trim() && !validateEmails(cc)) {
      toast.error("Please enter a valid CC email address");
      return;
    }

    if (scopesMissing) {
      toast.error("Gmail send permissions are missing. Please reconnect your Gmail account in Settings.", {
        action: { label: "Go to Settings", onClick: () => router.navigate({ to: "/settings" }) },
        duration: 8000,
      });
      return;
    }

    setSending(true);
    const toastId = toast.loading("Sending email via Gmail...");
    
    if (isDemo) {
      setTimeout(() => {
        demoSendMessage({
          to: to.trim(),
          subject: subject.trim() || "(No Subject)",
          body: draft,
          threadId: threadId || undefined,
          draftId: draftId || undefined
        }).then(() => {
          toast.success("Email sent successfully!", { id: toastId });
          window.dispatchEvent(new CustomEvent("gmail-synced"));
          setTimeout(() => {
            if (threadId) {
              router.navigate({ to: "/threads/$threadId", params: { threadId } });
            } else {
              router.navigate({ to: "/inbox" });
            }
          }, 1000);
        });
      }, 800);
      return;
    }

    try {
      const res = await sendGmailEmailAction({
        data: {
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim() || "(No Subject)",
          body: draft,
          threadId: threadId || undefined,
          draftId: draftId || undefined,
        }
      });

      if (res.success) {
        toast.success("Email sent successfully!", { id: toastId });
        
        // Dispatch the custom event to sync/refresh other views immediately
        window.dispatchEvent(new CustomEvent("gmail-synced"));
        
        // Navigate back to the thread page if threadId is present, otherwise to the inbox page
        setTimeout(() => {
          if (threadId) {
            router.navigate({ to: "/threads/$threadId", params: { threadId } });
          } else {
            router.navigate({ to: "/inbox" });
          }
        }, 1000);
      } else {
        toast.error("Failed to send email.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Failed to send email.";
      // Detect scope errors from the server
      if (errMsg.toLowerCase().includes("insufficientpermissions") || errMsg.toLowerCase().includes("scope")) {
        setScopesMissing(true);
        toast.error("Gmail send permission denied. Please reconnect your Gmail account in Settings.", {
          id: toastId,
          action: { label: "Settings", onClick: () => router.navigate({ to: "/settings" }) },
          duration: 10000,
        });
      } else {
        toast.error(errMsg, { id: toastId });
      }
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (scopesMissing) {
      toast.error("Gmail draft permissions are missing. Please reconnect your Gmail account in Settings.", {
        action: { label: "Go to Settings", onClick: () => router.navigate({ to: "/settings" }) },
        duration: 8000,
      });
      return;
    }

    setSaving(true);
    const toastId = toast.loading("Saving draft to Gmail...");
    
    if (isDemo) {
      setTimeout(() => {
        demoSaveDraft({
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          body: draft,
          draftId: draftId || undefined,
        }).then((res) => {
          if (res.draftId) {
            setDraftId(res.draftId);
          }
          toast.success("Draft saved successfully to Gmail!", { id: toastId });
          setSaving(false);
        });
      }, 700);
      return;
    }

    try {
      const res = await saveGmailDraftAction({
        data: {
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          body: draft,
          draftId: draftId || undefined,
        }
      });

      if (res.success) {
        if (res.draftId) {
          setDraftId(res.draftId);
        }
        toast.success("Draft saved successfully to Gmail!", { id: toastId });
      } else {
        toast.error("Failed to save draft.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Failed to save draft.";
      if (errMsg.toLowerCase().includes("insufficientpermissions") || errMsg.toLowerCase().includes("scope")) {
        setScopesMissing(true);
        toast.error("Gmail draft permission denied. Please reconnect in Settings.", {
          id: toastId,
          action: { label: "Settings", onClick: () => router.navigate({ to: "/settings" }) },
          duration: 10000,
        });
      } else {
        toast.error(errMsg, { id: toastId });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAIDraft = async () => {
    if (!promptText || !promptText.trim()) {
      toast.error("Please describe what you want the draft to say first");
      return;
    }
    
    setGenerating(true);
    const toastId = toast.loading("Writing email draft in your voice...");
    
    if (isDemo) {
      setTimeout(() => {
        setDraft(`Dear ${to.split('@')[0] || "there"},\n\nThis is a simulated AI draft generated in Demo Mode in response to your prompt: "${promptText}".\n\nRegarding ${subject || "our roadmap"}, we have successfully integrated the sync engine and aligned on the spec roadmap. Please let me know your thoughts.\n\nBest regards,\nJane Doe`);
        setMode("edit");
        toast.success("Draft generated successfully!", { id: toastId });
        setGenerating(false);
      }, 1100);
      return;
    }

    try {
      const preferredModel = typeof window !== "undefined" ? localStorage.getItem("repeatless_ai_model") || "gemini-2.5-pro" : "gemini-2.5-pro";
      const res = await generateAIDraftAction({
        data: {
          promptText: promptText.trim(),
          tone,
          style,
          model: preferredModel,
        }
      });
      
      setDraft(res.draft);
      setMode("edit");
      toast.success("Draft generated successfully!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate draft.", { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const handleDiscard = () => {
    if (confirm("Are you sure you want to discard this draft?")) {
      setTo("");
      setCc("");
      setSubject("");
      setDraft("");
      setPromptText("");
      toast.success("Draft discarded");
    }
  };

  return (
    <AppShell title="Compose">
      <PageHeader
        eyebrow="New message"
        title="Compose"
        description="Describe what you want to say. Repeatless drafts it in your voice."
        actions={
          <>
            <Button variant="ghost" className="rounded-xl" onClick={handleDiscard} disabled={sending || saving}>
              <Trash2 className="mr-2 h-4 w-4" /> Discard
            </Button>
            <Button 
              variant="outline" 
              className="rounded-xl border-border bg-card hover:bg-beige"
              onClick={handleSaveDraft}
              disabled={sending || saving}
            >
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            <Button
              className="rounded-xl bg-navy text-ivory hover:bg-navy/90"
              disabled={sending || saving}
              onClick={handleSend}
            >
              <Send className="mr-2 h-4 w-4" /> {sending ? "Sending..." : "Send"}
            </Button>
          </>
        }
      />

      {/* Scope warning banner */}
      {scopesChecked && scopesMissing && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-charcoal">Gmail send permissions are missing</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your Gmail account is connected with read-only access. To send emails and save drafts,
              please reconnect your account to grant the required permissions.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="shrink-0 rounded-lg bg-navy text-ivory hover:bg-navy/90 h-7 text-xs"
          >
            <Link to="/settings">Reconnect →</Link>
          </Button>
        </div>
      )}

      {/* Thread Reply Banner */}
      {threadId && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-forest/30 bg-forest/5 px-4 py-3 text-sm text-charcoal">
          <Sparkles className="h-4 w-4 text-forest shrink-0 animate-pulse" />
          <div className="flex-1">
            Replying to conversation: <span className="font-semibold text-charcoal-soft">"{subject}"</span>. This response will continue the existing Gmail thread.
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="surface-card overflow-hidden">
          <div className="space-y-0 border-b border-border">
            <Field label="To" value={to} onChange={setTo} placeholder="recipient@example.com" />
            <Field label="Cc" value={cc} onChange={setCc} placeholder="cc@example.com (optional)" />
            <Field label="Subject" value={subject} onChange={setSubject} placeholder="Enter subject" readOnly={!!threadId} />
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
              placeholder="Start typing your email body here..."
              className="min-h-[420px] rounded-none border-0 bg-transparent p-6 font-serif text-[16px] leading-relaxed focus-visible:ring-0 animate-fade-in"
            />
          ) : (
            <div className="min-h-[420px] whitespace-pre-wrap p-6 font-serif text-[16px] leading-relaxed text-charcoal">
              {draft || <span className="text-muted-foreground font-sans text-sm italic">Draft is empty</span>}
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
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Describe what you want to say — e.g. 'Reply confirming I'm available Friday, keep it brief and warm.'"
              className="mt-3 min-h-[120px] rounded-xl border-border bg-background"
            />
            <Button 
              className="mt-3 w-full rounded-xl bg-forest text-ivory hover:bg-forest/90"
              onClick={handleGenerateAIDraft}
              disabled={generating}
            >
              <Wand2 className="mr-2 h-4 w-4" /> {generating ? "Generating..." : "Generate draft"}
            </Button>
          </div>

          <div className="surface-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Tone & length
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {["Concise", "Standard", "Detailed"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "rounded-lg border px-2 py-2 font-medium transition-colors",
                    tone === t
                      ? "border-navy bg-navy text-ivory"
                      : "border-border bg-card text-charcoal-soft hover:bg-beige",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              {["Formal", "Warm", "Direct"].map((t) => (
                <button
                  key={t}
                  onClick={() => setStyle(t)}
                  className={cn(
                    "rounded-lg border px-2 py-2 font-medium transition-colors",
                    style === t
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

interface FieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

function Field({ label, value, onChange, placeholder, readOnly }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-border px-6 py-3.5 transition-all duration-200 w-full",
        focused ? "bg-navy/[0.02] dark:bg-navy/10 border-navy/40" : "hover:bg-muted/10",
        readOnly && "bg-muted/5 opacity-80"
      )}
    >
      <span className={cn(
        "w-16 shrink-0 text-xs font-semibold uppercase tracking-wider transition-colors duration-200",
        focused ? "text-navy dark:text-gold" : "text-muted-foreground"
      )}>
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "h-8 border-0 bg-transparent p-0 text-sm font-sans focus-visible:ring-0 w-full shadow-none rounded-none focus-visible:ring-offset-0 focus:outline-none focus:ring-0",
          readOnly && "text-muted-foreground/75 cursor-not-allowed select-none"
        )}
      />
    </div>
  );
}
