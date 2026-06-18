import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Repeatless AI" }] }),
  component: SignUp,
});

const benefits = [
  "Read-only Gmail access via OAuth 2.0",
  "AI summaries for every thread you open",
  "Smart categorisation across all incoming mail",
  "Chat with your entire email history in natural language",
];

function SignUp() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data?.session) {
        navigate({ to: "/connect", search: { reconnect: undefined } });
      } else if (data?.user) {
        // If email confirmation is enabled and no session is returned immediately
        setError("Account created! Please check your email for a confirmation link.");
        setLoading(false);
      } else {
        setError("Could not register user.");
        setLoading(false);
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError("An unexpected error occurred during sign up.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      step={{ current: 1, total: 3, label: "Create account" }}
      title="Make Gmail feel intelligent."
      subtitle="Set up your account in under a minute. You'll connect Gmail in the next step."
    >
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-3" onSubmit={handleSignUp}>
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={loading}
            className="h-11 rounded-xl bg-card"
          />
          <Input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={loading}
            className="h-11 rounded-xl bg-card"
          />
        </div>
        <Input
          type="email"
          placeholder="Work email"
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
          className="mt-5 h-11 w-full rounded-xl bg-navy text-ivory hover:bg-navy/90"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </form>
      <ul className="mt-7 space-y-2.5">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-charcoal-soft">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="mt-7 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/signin" className="font-medium text-charcoal hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
