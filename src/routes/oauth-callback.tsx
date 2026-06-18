import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { handleGoogleCallbackAction } from "@/lib/gmail/actions";

// Define the query parameter search schema
const callbackSearchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/oauth-callback")({
  validateSearch: (search) => callbackSearchSchema.parse(search),
  component: OAuthCallback,
});

function OAuthCallback() {
  const { code, error: googleError } = Route.useSearch();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  // Prevent duplicate double-invocation due to React 19 / StrictMode double mount
  const hasExchanged = useRef(false);

  useEffect(() => {
    // Clear logged out cookie so authentication is recognized on server
    document.cookie = "inbox_harmony_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    if (googleError) {
      setStatus("error");
      setErrorMessage(googleError);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code was returned from Google.");
      return;
    }

    const exchangeCode = async () => {
      if (hasExchanged.current) return;
      hasExchanged.current = true;

      try {
        const redirectUri = `${window.location.origin}/oauth-callback`;
        if (process.env.NODE_ENV === "development" || import.meta.env.DEV) {
          console.log("[Gmail Callback] Current origin:", window.location.origin);
          console.log("[Gmail Callback] Final redirectUri URL:", redirectUri);
        }
        const result = await handleGoogleCallbackAction({
          data: { code, redirectUri },
        });

        if (result?.success) {
          setStatus("success");
          setConnectedEmail(result.emailAddress);

          // Redirect to dashboard after a short delay so the user sees the success state
          setTimeout(() => {
            navigate({ to: "/dashboard" });
          }, 2000);
        } else {
          throw new Error("Failed to process Google account integration.");
        }
      } catch (err) {
        console.error("Callback processing error:", err);
        setStatus("error");
        const msg =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while processing the authorization.";
        setErrorMessage(msg);
      }
    };

    exchangeCode();
  }, [code, googleError, navigate]);

  return (
    <AuthShell
      step={{ current: 3, total: 3, label: "Syncing Data" }}
      title="Completing Integration"
      subtitle="Finalizing Google authorization and setting up synchronization."
    >
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-navy" />
          <p className="mt-4 text-sm text-charcoal font-medium">
            Exchanging codes and linking your Gmail account...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">This will take just a moment.</p>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-forest/10 p-3">
            <CheckCircle className="h-10 w-10 text-forest" />
          </div>
          <p className="mt-4 text-sm text-charcoal font-medium">
            Gmail account connected successfully!
          </p>
          {connectedEmail && (
            <p className="mt-1 text-xs text-muted-foreground font-mono bg-beige/50 px-3 py-1 rounded-md border border-border">
              {connectedEmail}
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground animate-pulse">
            Redirecting to dashboard...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Connection Failed</div>
              <div className="text-xs opacity-90 mt-0.5">{errorMessage}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => navigate({ to: "/connect", search: { reconnect: undefined } })}
              className="w-full rounded-xl bg-navy text-ivory hover:bg-navy/90"
            >
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/" })}
              className="w-full rounded-xl border-border bg-card text-charcoal hover:bg-beige"
            >
              Go to Home Page
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
