import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";
import { ShieldCheck, Lock, Eye, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { getGoogleAuthUrlAction } from "@/lib/gmail/actions";

export const Route = createFileRoute("/connect")({
  head: () => ({ meta: [{ title: "Connect Gmail — Repeatless AI" }] }),
  component: Connect,
});

const trust = [
  {
    icon: Lock,
    title: "End-to-end encrypted",
    desc: "All sync traffic is encrypted in transit and at rest.",
  },
  {
    icon: Eye,
    title: "Read-only by default",
    desc: "We never send, modify, or delete email without your consent.",
  },
  {
    icon: RefreshCw,
    title: "Revoke any time",
    desc: "One click in Settings disconnects Repeatless and purges data.",
  },
];

function Connect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthorize = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/oauth-callback`;
      const result = await getGoogleAuthUrlAction({ data: redirectUri });
      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error("Failed to generate Google authorization link.");
      }
    } catch (err) {
      console.error("Authorize error:", err);
      const msg =
        err instanceof Error ? err.message : "An error occurred while connecting to Google.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <AuthShell
      step={{ current: 2, total: 3, label: "Connect Gmail" }}
      title="Connect your Gmail account."
      subtitle="Repeatless will sync your mailbox in the background and start summarizing immediately."
    >
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="surface-card flex items-center gap-4 p-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-beige">
          <GoogleMark className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-charcoal">Google Account</div>
          <div className="truncate text-xs text-muted-foreground">Gmail (Read & Send access)</div>
        </div>
        <Button
          onClick={handleAuthorize}
          disabled={loading}
          className="rounded-xl bg-navy text-ivory hover:bg-navy/90"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            "Authorize"
          )}
        </Button>
      </div>

      <div className="mt-7 space-y-3">
        {trust.map((t) => (
          <div
            key={t.title}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
            <div>
              <div className="text-sm font-medium text-charcoal">{t.title}</div>
              <div className="text-xs text-muted-foreground">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-forest" />
        Reviewed by Google for limited use scopes.
      </p>
    </AuthShell>
  );
}

function GoogleMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...props}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.6 39.7 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2C40.1 36 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
