import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  step,
  title,
  subtitle,
  children,
}: {
  step?: { current: number; total: number; label: string };
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto grid min-h-dvh max-w-7xl grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
          <Link to="/" className="inline-flex items-center gap-2.5 self-start">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy text-ivory shadow-soft">
              <span className="font-serif text-base font-semibold">R</span>
            </div>
            <div>
              <div className="font-serif text-base font-semibold tracking-tight">Repeatless</div>
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                Email Intelligence
              </div>
            </div>
          </Link>

          <div className="mt-16 max-w-md sm:mt-24">
            {step && (
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  <span>{step.label}</span>
                  <span>
                    Step {step.current} of {step.total}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: step.total }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i < step.current ? "bg-navy" : "bg-beige"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            <h1 className="font-serif text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-[15px] leading-relaxed text-charcoal-soft">{subtitle}</p>
            )}

            <div className="mt-8">{children}</div>
          </div>

          <div className="mt-auto pt-12 text-xs text-muted-foreground">
            © 2026 Repeatless Labs ·{" "}
            <Link to="/" className="hover:text-charcoal">
              Back to home
            </Link>
          </div>
        </div>

        <div className="relative hidden overflow-hidden border-l border-border bg-parchment lg:flex">
          <div className="relative z-10 flex w-full flex-col justify-between p-14">
            <div className="surface-lifted max-w-md p-6">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Today's brief · 9:14 AM
              </div>
              <p className="text-[15px] leading-relaxed text-charcoal">
                Eleanor circulated the final <span className="font-semibold">Q4 review agenda</span>
                . Three decisions needed: Berlin office timing, Helios renewal terms, engineering
                headcount. Madrid lease (July 3) is the hard deadline.
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5">
                  3 emails
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5">
                  2 people
                </span>
              </div>
            </div>

            <div>
              <blockquote className="font-serif text-2xl leading-snug tracking-tight text-charcoal">
                "Repeatless cut my Monday triage from 90 minutes to 11. It's the only AI tool I've
                kept past month one."
              </blockquote>
              <div className="mt-4 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-forest text-ivory text-sm font-medium">
                  JD
                </div>
                <div>
                  <div className="text-sm font-medium text-charcoal">Jordan Davies</div>
                  <div className="text-xs text-muted-foreground">Founder, Helios</div>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-forest" />
                Read-only Gmail access · OAuth 2.0 · Revoke any time
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
