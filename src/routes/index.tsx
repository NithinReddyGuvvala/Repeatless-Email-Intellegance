import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  MessagesSquare,
  Inbox,
  Tags,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { enterDemoMode } from "@/lib/gmail/demoDb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Repeatless AI — The intelligent layer on top of Gmail" },
      {
        name: "description",
        content:
          "Repeatless AI turns Gmail into an intelligent assistant — summaries, categorization, and a chat agent that knows your inbox.",
      },
      { property: "og:title", content: "Repeatless AI — Intelligence for your inbox" },
      {
        property: "og:description",
        content:
          "Connect Gmail securely and let Repeatless summarize, categorize, and answer questions about your email.",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-ivory shadow-soft">
            <span className="font-serif text-base font-semibold">R</span>
          </div>
          <div>
            <div className="font-serif text-base font-semibold tracking-tight">Repeatless</div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              Email Intelligence
            </div>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-charcoal-soft md:flex">
          <a href="#features" className="hover:text-charcoal">
            Features
          </a>
          <a href="#security" className="hover:text-charcoal">
            Security
          </a>
          <Link to="/signin" className="hover:text-charcoal">
            Sign in
          </Link>
        </nav>
        <Link to="/signup">
          <Button className="rounded-xl bg-charcoal text-ivory hover:bg-charcoal/90">
            Get started
          </Button>
        </Link>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-10 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-charcoal-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              Now in private preview
            </div>
            <h1 className="font-serif text-[44px] font-semibold leading-[1.05] tracking-tight text-charcoal sm:text-[56px] lg:text-[64px]">
              The intelligent layer
              <br />
              on top of your inbox.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-charcoal-soft">
              Repeatless AI connects securely to Gmail and turns thousands of emails into clear
              summaries, organised threads, and a chat agent that knows your correspondence in
              detail.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button className="h-11 rounded-xl bg-navy px-6 text-[15px] text-ivory hover:bg-navy/90">
                  Connect your Gmail
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-border bg-card px-6 text-[15px] text-charcoal hover:bg-beige"
                onClick={() => {
                  enterDemoMode();
                  window.location.href = "/dashboard";
                }}
              >
                See live demo
              </Button>
            </div>
            <div
              id="security"
              className="mt-10 flex flex-wrap items-center gap-6 text-xs text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-forest" />
                Read-only Gmail OAuth
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-forest" />
                SOC 2 Type II in progress
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-forest" />
                Your data is never sold
              </div>
            </div>
          </div>

          <div className="surface-lifted relative overflow-hidden p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-forest" />
                <span className="text-sm font-medium">Ask Repeatless</span>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Live agent
              </span>
            </div>
            <div className="rounded-xl bg-beige/60 px-4 py-3 text-sm text-charcoal">
              Summarize everything Acme Corp said about Q4 strategy this month.
            </div>
            <div className="mt-4 rounded-xl border border-border bg-card p-5">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Synthesis · 24 emails · 3 threads
              </div>
              <p className="text-[14.5px] leading-relaxed text-charcoal">
                Eleanor finalised the Q4 review agenda with three open decisions. Sofia flagged that
                the <span className="font-semibold">Madrid lease renews on July 3</span> and depends
                on the Berlin office call. Marcus proposed the production cutover for{" "}
                <span className="font-semibold">June 28</span>, tracking 18% under budget.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Eleanor Whitfield", "Sofia Larsen", "Marcus Chen"].map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-charcoal-soft"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Inbox, title: "Unified inbox", desc: "Every thread, beautifully organised." },
            { icon: FileText, title: "AI summaries", desc: "Thread-level synthesis in seconds." },
            { icon: Tags, title: "Smart categories", desc: "Work, finance, newsletters, jobs." },
            {
              icon: MessagesSquare,
              title: "Chat with your email",
              desc: "Ask anything across all history.",
            },
          ].map((f) => (
            <div key={f.title} className="surface-card p-5">
              <f.icon className="h-5 w-5 text-navy" strokeWidth={1.75} />
              <div className="mt-4 font-serif text-lg font-semibold tracking-tight">{f.title}</div>
              <p className="mt-1 text-sm text-charcoal-soft">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center lg:px-10">
          <span>© 2026 Repeatless Labs. Built for the inbox.</span>
          <div className="flex items-center gap-5">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
