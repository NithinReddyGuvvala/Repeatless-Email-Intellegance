import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { Check } from "lucide-react";

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
  return (
    <AuthShell
      step={{ current: 1, total: 3, label: "Create account" }}
      title="Make Gmail feel intelligent."
      subtitle="Set up your account in under a minute. You'll connect Gmail in the next step."
    >
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="First name" className="h-11 rounded-xl bg-card" />
          <Input placeholder="Last name" className="h-11 rounded-xl bg-card" />
        </div>
        <Input type="email" placeholder="Work email" className="h-11 rounded-xl bg-card" />
        <Input type="password" placeholder="Password" className="h-11 rounded-xl bg-card" />
      </form>
      <Button asChild className="mt-5 h-11 w-full rounded-xl bg-navy text-ivory hover:bg-navy/90">
        <Link to="/connect">Continue</Link>
      </Button>
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
