import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Inbox,
  MessagesSquare,
  FileText,
  PenLine,
  Tags,
  Sparkles,
  Newspaper,
  Search,
  Settings,
  Menu,
  X,
  Command,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: "184" },
  { to: "/threads", label: "Threads", icon: MessagesSquare },
  { to: "/summaries", label: "Summaries", icon: FileText },
  { to: "/compose", label: "Compose", icon: PenLine },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/agent", label: "AI Agent", icon: Sparkles, accent: true },
  { to: "/newsletters", label: "Newsletters", icon: Newspaper },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-1">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy text-ivory shadow-soft">
        <span className="font-serif text-base font-semibold leading-none">R</span>
      </div>
      <div className="min-w-0">
        <div className="font-serif text-[15px] font-semibold leading-tight tracking-tight">
          Repeatless
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Email Intelligence
        </div>
      </div>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-beige text-charcoal"
                : "text-charcoal-soft hover:bg-beige/60 hover:text-charcoal",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-navy" />
            )}
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                "accent" in item && item.accent && !active && "text-forest",
              )}
              strokeWidth={1.75}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {"badge" in item && item.badge && (
              <span className="rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hairline border">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest text-ivory font-medium text-sm">
          AM
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-charcoal">Alex Marin</div>
          <div className="truncate text-xs text-muted-foreground">alex@repeatless.ai</div>
        </div>
        <div className="h-2 w-2 rounded-full bg-forest" title="Gmail connected" />
      </div>
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-border bg-sidebar px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-sidebar px-4 py-5 shadow-lifted">
            <div className="flex items-center justify-between">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-7 flex-1 overflow-y-auto">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            {title && (
              <h1 className="truncate font-serif text-lg font-semibold tracking-tight sm:text-xl">
                {title}
              </h1>
            )}
          </div>
          <Link
            to="/search"
            className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-beige md:flex"
          >
            <Search className="h-4 w-4" />
            <span>Search emails, threads, people…</span>
            <span className="ml-6 flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
              <Command className="h-3 w-3" />K
            </span>
          </Link>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-charcoal sm:text-[28px]">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
