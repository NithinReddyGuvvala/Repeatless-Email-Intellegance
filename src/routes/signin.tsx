import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in — Repeatless AI" }] }),
  component: SignIn,
});

function SignIn() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your intelligent inbox.">
      <Button
        variant="outline"
        className="h-11 w-full rounded-xl border-border bg-card text-[15px] font-medium hover:bg-beige"
        asChild
      >
        <Link to="/connect">
          <GoogleMark className="mr-2 h-4 w-4" />
          Continue with Google
        </Link>
      </Button>
      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
      </div>
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <Input type="email" placeholder="you@company.com" className="h-11 rounded-xl bg-card" />
        <Input type="password" placeholder="Password" className="h-11 rounded-xl bg-card" />
        <Button className="h-11 w-full rounded-xl bg-navy text-ivory hover:bg-navy/90">
          Sign in
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
