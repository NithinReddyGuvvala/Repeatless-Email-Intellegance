import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { getAuthenticatedUser, supabaseAdmin } from "@/lib/supabase/server";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type SignInSearchParams = {
  logout?: string;
};

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): SignInSearchParams => ({
    logout: search.logout as string | undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — Repeatless AI" }] }),
  beforeLoad: async () => {
    let isAuthenticated = false;
    let hasAccount = false;

    if (typeof window === "undefined") {
      const user = await getAuthenticatedUser();
      isAuthenticated = !!user;
      if (user && supabaseAdmin) {
        const { data } = await supabaseAdmin
          .from("gmail_accounts")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);
        hasAccount = !!data && data.length > 0;
      }
    } else {
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        isAuthenticated = !!data?.session;
        if (data?.session?.user) {
          const { data: accounts } = await supabase
            .from("gmail_accounts")
            .select("id")
            .limit(1);
          hasAccount = !!accounts && accounts.length > 0;
        }
      }
    }

    if (isAuthenticated) {
      if (hasAccount) {
        throw redirect({
          to: "/dashboard",
        });
      } else {
        throw redirect({
          to: "/connect",
        });
      }
    }
  },
  component: SignIn,
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [toastShown, setToastShown] = useState(false);

  useEffect(() => {
    if (search.logout === "true" && !toastShown) {
      setToastShown(true);
      toast.success("Logged out successfully.");
      // Clean up the URL search param so refreshing doesn't show it again
      navigate({ to: "/signin", search: {}, replace: true });
    }
  }, [search.logout, navigate, toastShown]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Clear logged out cookie so authentication is recognized
    document.cookie = "inbox_harmony_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data?.session) {
        navigate({ to: "/connect", search: { reconnect: undefined } });
      } else {
        setError("Could not establish a session.");
        setLoading(false);
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An unexpected error occurred during sign in.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    // Clear logged out cookie so authentication is recognized
    document.cookie = "inbox_harmony_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    try {
      const redirectTo = `${window.location.origin}/connect`;
      if (process.env.NODE_ENV === "development" || import.meta.env.DEV) {
        console.log("[Supabase Sign In] Current origin:", window.location.origin);
        console.log("[Supabase Sign In] Final redirectTo URL:", redirectTo);
      }

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose",
          queryParams: {
            access_type: "offline",
            prompt: "consent select_account",
          },
          redirectTo,
        },
      });
      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      console.error("Google sign in error:", err);
      setError("An unexpected error occurred during Google sign in.");
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your intelligent inbox.">
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        variant="outline"
        className="h-11 w-full rounded-xl border-border bg-card text-[15px] font-medium hover:bg-beige"
        onClick={handleGoogleSignIn}
        disabled={loading}
      >
        <GoogleMark className="mr-2 h-4 w-4" />
        Continue with Google
      </Button>
      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
      </div>
      <form className="space-y-3" onSubmit={handleSignIn}>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className="h-11 rounded-xl bg-card"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          className="h-11 rounded-xl bg-card"
        />
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl bg-navy text-ivory hover:bg-navy/90"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        New to Repeatless?{" "}
        <Link to="/signup" className="font-medium text-charcoal hover:underline">
          Create an account
        </Link>
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
