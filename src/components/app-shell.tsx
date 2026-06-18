import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { getUserSettingsAction, getUnreadEmailCountAction } from "@/lib/gmail/actions";
import { isDemoMode, exitDemoMode, getDemoDashboardData } from "@/lib/gmail/demoDb";
import { subscribeToSyncState } from "@/lib/gmail/backgroundSync";
import {
  LayoutDashboard,
  Inbox,
  MessagesSquare,
  Archive,
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
  Loader2,
  Send,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/threads", label: "Threads", icon: MessagesSquare },
  { to: "/sent", label: "Sent Mail", icon: Send },
  { to: "/drafts", label: "Drafts", icon: Pencil },
  { to: "/archived", label: "Archived", icon: Archive },
  { to: "/summaries", label: "Summaries", icon: FileText },
  { to: "/compose", label: "Compose", icon: PenLine },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/agent", label: "AI Agent", icon: Sparkles, accent: true },
  { to: "/newsletters", label: "Newsletters", icon: Newspaper },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand() {
  const isDemo = isDemoMode();
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-1">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy text-ivory shadow-soft">
        <span className="font-serif text-base font-semibold leading-none">R</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="font-serif text-[15px] font-semibold leading-tight tracking-tight">
            Repeatless
          </div>
          {isDemo && (
            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold border border-gold/20">
              Demo
            </span>
          )}
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Email Intelligence
        </div>
      </div>
    </Link>
  );
}

function NavList({ onNavigate, unreadCount }: { onNavigate?: () => void; unreadCount: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        const Icon = item.icon;
        
        // Dynamically override badge count for Inbox; suppress display if no unread count is set
        const badgeValue = item.to === "/inbox" ? String(unreadCount) : undefined;

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
            {badgeValue !== undefined && (
              <span className="rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hairline border">
                {badgeValue}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const isDemo = isDemoMode();
  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
    gmailConnected: boolean;
  } | null>(null);
  const [avatarPhoto, setAvatarPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAvatarPhoto(localStorage.getItem("repeatless_profile_photo"));
    }

    const handlePhotoUpdate = () => {
      setAvatarPhoto(localStorage.getItem("repeatless_profile_photo"));
    };

    window.addEventListener("profile-photo-updated", handlePhotoUpdate);
    window.addEventListener("profile-updated", loadProfileData);

    return () => {
      window.removeEventListener("profile-photo-updated", handlePhotoUpdate);
      window.removeEventListener("profile-updated", loadProfileData);
    };
  }, []);

  const loadProfileData = () => {
    if (isDemo) {
      setProfile({
        displayName: "Jane Doe (Demo)",
        email: "demo@repeatless.ai",
        gmailConnected: true,
      });
      return;
    }

    getUserSettingsAction()
      .then((res) => {
        setProfile({
          displayName: res.user.displayName,
          email: res.user.email,
          gmailConnected: res.gmailAccounts.length > 0,
        });

        // Sync client localStorage sync state with DB connection state
        if (res.gmailAccounts && res.gmailAccounts.length > 0) {
          const acc = res.gmailAccounts[0];
          const storedEmail = localStorage.getItem("gmail_connected_email");
          if (storedEmail !== acc.email_address) {
            console.log("[AppShell] Connected Gmail account changed. Resetting sync state in localStorage.");
            localStorage.setItem("gmail_connected_email", acc.email_address);
            if (acc.last_synced_at) {
              localStorage.setItem("gmail_last_synced_at", acc.last_synced_at);
            } else {
              localStorage.removeItem("gmail_last_synced_at");
            }
            localStorage.removeItem("gmail_sync_in_progress");
            // Dispatch event to check background scheduler immediately
            window.dispatchEvent(new CustomEvent("gmail-sync-start"));
          } else if (acc.last_synced_at) {
            localStorage.setItem("gmail_last_synced_at", acc.last_synced_at);
          }
        } else {
          localStorage.removeItem("gmail_connected_email");
          localStorage.removeItem("gmail_last_synced_at");
          localStorage.removeItem("gmail_sync_in_progress");
        }
      })
      .catch((err) => {
        console.error("Failed to load sidebar profile settings:", err);
      });
  };

  useEffect(() => {
    loadProfileData();
  }, [isDemo]);

  const displayName = profile?.displayName || "";
  const email = profile?.email || "";
  const gmailConnected = profile ? profile.gmailConnected : false;

  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AI";

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        {avatarPhoto ? (
          <img
            src={avatarPhoto}
            alt="Profile photo"
            className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest text-ivory font-medium text-sm">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-charcoal">{displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
        {gmailConnected ? (
          <div className="h-2 w-2 rounded-full bg-forest" title="Gmail connected" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-muted-foreground/30" title="Gmail not connected" />
        )}
      </div>
    </div>
  );
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const isDemo = isDemoMode();
  const routerState = useRouterState();
  const locationKey = routerState.location.href;
  const [open, setOpen] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const handleExitDemo = () => {
    exitDemoMode();
    window.location.href = "/";
  };

  const loadUnreadCount = useCallback(() => {
    if (isDemo) {
      const data = getDemoDashboardData();
      setUnreadCount(data.stats.unread);
      return;
    }

    getUnreadEmailCountAction()
      .then((res) => {
        setUnreadCount(res.count);
      })
      .catch((err) => {
        console.error("Failed to load unread count in AppShell:", err);
      });
  }, [isDemo]);

  useEffect(() => {
    loadUnreadCount();

    const handleSynced = () => loadUnreadCount();
    const handleUnreadChanged = (e: Event) => {
      const delta = (e as CustomEvent<{ delta: number }>).detail?.delta ?? 0;
      if (delta !== 0) {
        // Optimistic update – clamp to 0
        setUnreadCount((prev) => Math.max(0, prev + delta));
        // Also refetch from server to stay accurate
        loadUnreadCount();
      }
    };

    window.addEventListener("gmail-synced", handleSynced);
    window.addEventListener("gmail-unread-changed", handleUnreadChanged);
    return () => {
      window.removeEventListener("gmail-synced", handleSynced);
      window.removeEventListener("gmail-unread-changed", handleUnreadChanged);
    };
  }, [locationKey, loadUnreadCount]);

  useEffect(() => {
    return subscribeToSyncState((state) => {
      setSyncInProgress(state.syncInProgress);
    });
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-border bg-sidebar px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList unreadCount={unreadCount} />
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
              <NavList onNavigate={() => setOpen(false)} unreadCount={unreadCount} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-[260px]">
        {isDemo && (
          <div className="bg-gold/10 border-b border-gold/20 px-4 py-2 text-xs font-medium text-amber-800 flex items-center justify-between gap-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse shrink-0" />
              <span>You are exploring Inbox Harmony in <strong>Demo Mode</strong> with simulated data. No real Gmail accounts or Supabase credentials are accessed.</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExitDemo}
              className="h-6 rounded-md border-gold/30 text-[11px] px-2 py-0 hover:bg-gold/10 hover:text-gold shrink-0 bg-card"
            >
              Exit Demo
            </Button>
          </div>
        )}
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
          {syncInProgress && (
            <div className="flex items-center gap-1.5 text-xs text-navy bg-navy/5 px-2.5 py-1.5 rounded-lg border border-navy/10 animate-pulse mr-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-navy" />
              <span className="font-medium">Syncing...</span>
            </div>
          )}
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
