import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { User, ShieldCheck, Brain, RefreshCw, Bell, Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Repeatless AI" }] }),
  component: Settings,
});

const sections = [
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "ai", label: "AI Models", icon: Brain },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
] as const;

function Settings() {
  const [active, setActive] = useState<(typeof sections)[number]["id"]>("account");

  return (
    <AppShell title="Settings">
      <PageHeader eyebrow="Workspace" title="Settings" />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="space-y-1 lg:sticky lg:top-20 lg:self-start">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active === s.id
                  ? "bg-beige text-charcoal"
                  : "text-charcoal-soft hover:bg-beige/60 hover:text-charcoal",
              )}
            >
              <s.icon className="h-4 w-4" strokeWidth={1.75} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="space-y-5">
          {active === "account" && <AccountSection />}
          {active === "security" && <SecuritySection />}
          {active === "ai" && <AISection />}
          {active === "sync" && <SyncSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "appearance" && <AppearanceSection />}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, desc, children }: any) {
  return (
    <div className="surface-card p-6">
      <div className="font-serif text-lg font-semibold text-charcoal">{title}</div>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function AccountSection() {
  return (
    <>
      <Card title="Profile" desc="How you appear in Repeatless and outgoing email.">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-forest text-ivory font-medium text-lg">
            AM
          </div>
          <div>
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
              Upload photo
            </Button>
            <div className="mt-2 text-xs text-muted-foreground">PNG or JPG, up to 4MB.</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field label="First name" defaultValue="Alex" />
          <Field label="Last name" defaultValue="Marin" />
          <Field label="Email" defaultValue="alex@repeatless.ai" />
          <Field label="Role" defaultValue="Founder" />
        </div>
      </Card>
      <Card title="Connected Gmail" desc="Repeatless syncs with this account.">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-parchment/40 p-4">
          <GoogleMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-charcoal">alex@repeatless.ai</div>
            <div className="truncate text-xs text-muted-foreground">
              Read-only · Last sync 2 minutes ago
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-forest/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-forest">
            <Check className="h-3 w-3" /> Connected
          </span>
        </div>
        <Button variant="ghost" className="mt-3 text-rust hover:bg-rust/10 hover:text-rust">
          Disconnect Gmail
        </Button>
      </Card>
    </>
  );
}

function SecuritySection() {
  return (
    <Card title="Security status" desc="All sessions and access tokens.">
      <ul className="divide-y divide-border">
        {[
          { label: "Two-factor authentication", value: "Enabled · Authenticator app" },
          { label: "Password", value: "Last changed 47 days ago" },
          { label: "Active sessions", value: "2 devices · MacBook Pro, iPhone" },
          { label: "Data export", value: "Available on request" },
        ].map((r) => (
          <li key={r.label} className="flex items-center justify-between py-4">
            <div>
              <div className="text-sm font-medium text-charcoal">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.value}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-border bg-card hover:bg-beige"
            >
              Manage
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AISection() {
  const [gemini, setGemini] = useState("gemini-2.5-pro");
  const [nim, setNim] = useState("llama-3.3-70b-nemotron");
  return (
    <>
      <Card title="Gemini" desc="Model used for summaries, categorisation, and chat answers.">
        <RadioRow
          value={gemini}
          onChange={setGemini}
          options={[
            {
              id: "gemini-3-flash-preview",
              label: "Gemini 3 Flash (Preview)",
              hint: "Fast, low latency",
            },
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Recommended — best reasoning" },
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced cost & speed" },
          ]}
        />
      </Card>
      <Card
        title="NVIDIA NIM"
        desc="Used for high-throughput embeddings and structured extraction."
      >
        <RadioRow
          value={nim}
          onChange={setNim}
          options={[
            { id: "llama-3.3-70b-nemotron", label: "Llama 3.3 70B Nemotron", hint: "Recommended" },
            { id: "mixtral-8x22b", label: "Mixtral 8x22B", hint: "Multilingual" },
          ]}
        />
      </Card>
      <Card title="Embeddings" desc="pgvector index over your inbox.">
        <div className="flex items-center justify-between rounded-xl bg-parchment/40 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-charcoal">12,480 emails indexed</div>
            <div className="text-xs text-muted-foreground">gemini-embedding-001 · 1536d</div>
          </div>
          <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-beige">
            Rebuild index
          </Button>
        </div>
      </Card>
    </>
  );
}

function RadioRow({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; hint: string }[];
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
            value === o.id ? "border-navy bg-navy/5" : "border-border bg-card hover:bg-beige",
          )}
        >
          <div
            className={cn(
              "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
              value === o.id ? "border-navy" : "border-border",
            )}
          >
            {value === o.id && <div className="h-2 w-2 rounded-full bg-navy" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-charcoal">{o.label}</div>
            <div className="text-xs text-muted-foreground">{o.hint}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SyncSection() {
  return (
    <Card title="Sync preferences" desc="Control how Repeatless mirrors your Gmail.">
      <ToggleRow
        label="Initial historical sync"
        hint="Backfill all email history (one-time)."
        defaultOn
      />
      <ToggleRow label="Incremental sync" hint="Pull new email every 60 seconds." defaultOn />
      <ToggleRow label="Include Trash & Spam" hint="Index Trash and Spam folders." />
      <ToggleRow
        label="Auto-categorize on arrival"
        hint="Run categorisation as emails sync."
        defaultOn
      />
    </Card>
  );
}

function NotificationsSection() {
  return (
    <Card title="Alerts & digests" desc="Choose what's worth interrupting you for.">
      <ToggleRow
        label="Priority email alerts"
        hint="Notify when an important email arrives."
        defaultOn
      />
      <ToggleRow
        label="Daily morning digest"
        hint="9:00 AM brief of overnight activity."
        defaultOn
      />
      <ToggleRow label="Weekly intelligence report" hint="Mondays at 8:00 AM." />
      <ToggleRow
        label="Newsletter digest"
        hint="Unified news extracted from your subscriptions."
        defaultOn
      />
    </Card>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState("system");
  return (
    <Card title="Theme" desc="Preference applies to this device.">
      <div className="grid grid-cols-3 gap-3">
        {[
          { id: "light", label: "Ivory" },
          { id: "dark", label: "Midnight" },
          { id: "system", label: "System" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              theme === t.id ? "border-navy bg-navy/5" : "border-border bg-card hover:bg-beige",
            )}
          >
            <div
              className={cn(
                "h-16 rounded-lg border border-border",
                t.id === "light" && "bg-ivory",
                t.id === "dark" && "bg-charcoal",
                t.id === "system" && "bg-gradient-to-r from-ivory to-charcoal",
              )}
            />
            <div className="mt-3 text-sm font-medium text-charcoal">{t.label}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input defaultValue={defaultValue} className="h-10 rounded-xl bg-background" />
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  defaultOn,
}: {
  label: string;
  hint: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-center justify-between border-b border-border py-3.5 last:border-0">
      <div className="pr-4">
        <div className="text-sm font-medium text-charcoal">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
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
