import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import React, { useState, useEffect } from "react";
import { User, ShieldCheck, Brain, RefreshCw, Bell, Palette, Check, Loader2, AlertCircle, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncGmailAccountAction, getUserSettingsAction, debugSyncAction, getEmailCountAction, checkGmailScopesAction, disconnectGmailAction, updateUserProfileAction, getSyncProgressAction } from "@/lib/gmail/actions";
import { formatDistanceToNow } from "date-fns";
import { subscribeToSyncState, appendSyncLog, triggerBackgroundSync } from "@/lib/gmail/backgroundSync";
import { isDemoMode, exitDemoMode } from "@/lib/gmail/demoDb";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { RouteErrorComponent } from "./__root";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Repeatless AI" }] }),
  component: Settings,
  errorComponent: RouteErrorComponent,
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
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [debugReport, setDebugReport] = useState<any | null>(null);
  const [syncedSoFar, setSyncedSoFar] = useState(0);
  const [isInitialSync, setIsInitialSync] = useState(false);
  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
    gmailAccount?: { 
      id?: string;
      email_address: string; 
      last_synced_at: string | null;
      sync_status?: string;
      sync_progress_imported?: number;
      sync_progress_total?: number;
    };
  } | null>(null);
  const [bgSyncing, setBgSyncing] = useState(false);
  const [timeTick, setTimeTick] = useState(new Date());
  const [scopeStatus, setScopeStatus] = useState<{
    hasRequiredScopes: boolean;
    missingScopes: string[];
    checked: boolean;
  }>({ hasRequiredScopes: true, missingScopes: [], checked: false });
  const isDemo = isDemoMode();

  // Profile fields state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailField, setEmailField] = useState("");
  const [roleField, setRoleField] = useState("");
  const [avatarPhoto, setAvatarPhoto] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAvatarPhoto(localStorage.getItem("repeatless_profile_photo"));
    }
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error("File size must be less than 4MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Str = reader.result as string;
      localStorage.setItem("repeatless_profile_photo", base64Str);
      setAvatarPhoto(base64Str);
      window.dispatchEvent(new CustomEvent("profile-photo-updated"));
      toast.success("Profile photo uploaded!");
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  // Subscribe to background sync state
  useEffect(() => {
    if (isDemo) return;
    return subscribeToSyncState((state) => {
      setBgSyncing(state.syncInProgress);
    });
  }, [isDemo]);

  // Dynamically update last sync relative time display
  useEffect(() => {
    const t = setInterval(() => setTimeTick(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const loadProfile = () => {
    if (isDemo) {
      const dName = "Jane Doe (Demo)";
      setProfile({
        displayName: dName,
        email: "demo@repeatless.ai",
        gmailAccount: {
          email_address: "demo.user@gmail.com",
          last_synced_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        }
      });
      setScopeStatus({
        hasRequiredScopes: true,
        missingScopes: [],
        checked: true
      });
      setFirstName("Jane");
      setLastName("Doe (Demo)");
      setEmailField("demo@repeatless.ai");
      setRoleField("Demo User");
      return;
    }

    getUserSettingsAction()
      .then((res) => {
        const acct = res.gmailAccounts[0];
        setProfile({
          displayName: res.user.displayName,
          email: res.user.email,
          gmailAccount: acct,
        });

        const dName = res.user.displayName || "";
        setFirstName(dName.split(/\s+/)[0] || "");
        setLastName(dName.split(/\s+/).slice(1).join(" ") || "");
        setEmailField(res.user.email || "");
        setRoleField("User");

        // Check scopes once we know an account is connected
        if (acct) {
          checkGmailScopesAction()
            .then((scopeRes) => {
              setScopeStatus({
                hasRequiredScopes: scopeRes.hasRequiredScopes,
                missingScopes: scopeRes.missingScopes,
                checked: true,
              });
            })
            .catch(() => {
              // Non-fatal — don't block UI
              setScopeStatus({ hasRequiredScopes: false, missingScopes: [], checked: true });
            });
        }
      })
      .catch((err) => {
        console.error("Failed to load settings profile:", err);
      });
  };

  useEffect(() => {
    loadProfile();

    if (!isDemo) {
      window.addEventListener("gmail-synced", loadProfile);
      return () => {
        window.removeEventListener("gmail-synced", loadProfile);
      };
    }
  }, [isDemo]);

  // Poll sync status when server-side background sync is active
  useEffect(() => {
    if (isDemo || !profile?.gmailAccount) return;
    
    const account = profile.gmailAccount;
    const isSyncActive = account.sync_status === 'syncing' || 
                         account.sync_status === 'syncing_recent' || 
                         account.sync_status === 'syncing_historical';
                         
    if (isSyncActive) {
      const intervalId = setInterval(() => {
        loadProfile();
      }, 2000);
      return () => clearInterval(intervalId);
    }
  }, [profile?.gmailAccount?.sync_status, isDemo]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const toastId = toast.loading("Saving profile changes...");
    try {
      const fullDName = `${firstName} ${lastName}`.trim();
      
      if (isDemo) {
        toast.success("Profile saved successfully (demo mode)!", { id: toastId });
        setProfile(prev => prev ? { ...prev, displayName: fullDName } : null);
        window.dispatchEvent(new CustomEvent("profile-updated"));
        setSavingProfile(false);
        return;
      }

      await updateUserProfileAction({ data: { displayName: fullDName } });
      
      toast.success("Profile saved successfully!", { id: toastId });
      window.dispatchEvent(new CustomEvent("profile-updated"));
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes: " + (err instanceof Error ? err.message : String(err)), { id: toastId });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSync = async () => {
    if (bgSyncing || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    setDebugReport(null);
    setSyncedSoFar(0);

    if (isDemo) {
      appendSyncLog("info", "Starting manual sync (demo mode)...");
      setIsInitialSync(false);
      let count = 0;
      const intervalId = setInterval(() => {
        count += Math.floor(Math.random() * 3) + 1;
        setSyncedSoFar(count);
      }, 400);

      setTimeout(() => {
        clearInterval(intervalId);
        setSyncing(false);
        const successMsg = "Successfully synced all demo emails. Simulated inbox is up to date.";
        setSyncResult(successMsg);
        appendSyncLog("success", `Manual sync: ${successMsg}`);
        window.dispatchEvent(new CustomEvent("gmail-synced"));
      }, 2000);
      return;
    }

    appendSyncLog("info", "Starting manual sync...");
    try {
      // Trigger background sync via the client scheduler helper
      await triggerBackgroundSync();
      
      // Reload profile to refresh connection details
      await loadProfile();
      setSyncResult("Background sync completed successfully.");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred during sync.";
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleDebugSync = async () => {
    setDebugging(true);
    setSyncResult(null);
    setSyncError(null);
    setDebugReport(null);

    if (isDemo) {
      setTimeout(() => {
        setDebugging(false);
        setDebugReport({
          status: "healthy",
          demoMode: true,
          mockDbSize: 14,
          lastSyncTime: new Date().toISOString(),
          latency: "32ms",
          connection: "simulated"
        });
      }, 1000);
      return;
    }

    try {
      const result = await debugSyncAction();
      setDebugReport(result.report);
    } catch (err) {
      console.error(err);
      setDebugReport({ fatal_error: err instanceof Error ? err.message : String(err) });
    } finally {
      setDebugging(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Preserve user theme setting if present
      const theme = localStorage.getItem("repeatless_theme");
      localStorage.clear();
      sessionStorage.clear();
      if (theme) {
        localStorage.setItem("repeatless_theme", theme);
      }

      // Set logged out cookie so dev fallback is bypassed on the server
      document.cookie = "inbox_harmony_logged_out=true; path=/; max-age=31536000";

      // Clear React Query cache
      queryClient.clear();

      const { getSupabaseBrowser } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowser();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      window.location.replace("/signin?logout=true");
    }
  };

  const handleDisconnectGoogleAccount = async () => {
    if (!confirm("Are you sure you want to disconnect and remove all synced data?")) {
      return;
    }
    const toastId = toast.loading("Disconnecting Google Account...");
    try {
      await disconnectGmailAction();

      // Preserve user theme setting if present
      const theme = localStorage.getItem("repeatless_theme");
      localStorage.clear();
      sessionStorage.clear();
      if (theme) {
        localStorage.setItem("repeatless_theme", theme);
      }

      // Set logged out cookie so dev fallback is bypassed on the server
      document.cookie = "inbox_harmony_logged_out=true; path=/; max-age=31536000";

      // Clear React Query cache
      queryClient.clear();

      const { getSupabaseBrowser } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowser();
      if (supabase) {
        await supabase.auth.signOut();
      }
      toast.dismiss(toastId);
    } catch (err) {
      console.error("Google account disconnect error:", err);
      toast.error("Failed to disconnect Google Account.", { id: toastId });
    } finally {
      window.location.replace("/signin?logout=true");
    }
  };

  const displayName = profile?.displayName || "";
  const email = profile?.email || "";
  const initials =
    `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U";

  const account = profile?.gmailAccount;
  const isSyncActive = !isDemo && account && 
                       (account.sync_status === 'syncing' || 
                        account.sync_status === 'syncing_recent' || 
                        account.sync_status === 'syncing_historical');

  return (
    <>
      <Card title="Profile" desc="How you appear in Repeatless and outgoing email.">
        <div className="flex items-center gap-4">
          {avatarPhoto ? (
            <img
              src={avatarPhoto}
              alt="Profile photo"
              className="h-16 w-16 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-full bg-forest text-ivory font-medium text-lg">
              {initials}
            </div>
          )}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              className="hidden"
            />
            <Button
              variant="outline"
              className="rounded-xl border-border bg-card hover:bg-beige"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload photo
            </Button>
            <div className="mt-2 text-xs text-muted-foreground">PNG or JPG, up to 4MB.</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
          <Field label="Email" value={emailField} readOnly disabled />
          <Field label="Role" value={isDemo ? "Demo User" : roleField} readOnly disabled />
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="rounded-xl bg-navy text-ivory hover:bg-navy/90"
          >
            {savingProfile ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </Card>
      <Card title="Connected Gmail" desc="Repeatless syncs with this account.">
        {profile?.gmailAccount ? (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-parchment/40 p-4">
            <GoogleMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-charcoal">
                {profile.gmailAccount.email_address}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {isDemo 
                  ? "Simulated Access (demo)"
                  : scopeStatus.checked
                    ? scopeStatus.hasRequiredScopes
                      ? "Full access (send & sync)"
                      : "Limited access — reconnect required"
                    : "Read-only"} · Last sync{" "}
                {profile.gmailAccount.last_synced_at
                  ? formatDistanceToNow(new Date(profile.gmailAccount.last_synced_at), { addSuffix: true })
                  : "never"}
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
              isDemo
                ? "bg-forest/10 text-forest"
                : scopeStatus.checked && !scopeStatus.hasRequiredScopes
                  ? "bg-gold/10 text-gold"
                  : "bg-forest/10 text-forest"
            }`}>
              <Check className="h-3 w-3" /> Connected
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-border border-dashed p-4 justify-between bg-card">
            <div className="text-sm text-muted-foreground">No Gmail account connected yet.</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-xl border-border bg-card hover:bg-beige"
                onClick={handleLogout}
              >
                Log Out
              </Button>
              <Button asChild className="rounded-xl bg-navy text-ivory hover:bg-navy/90">
                <Link to="/connect" search={{ reconnect: undefined }}>Connect</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Reconnect banner — shown when send/compose scopes are missing */}
        {!isDemo && scopeStatus.checked && !scopeStatus.hasRequiredScopes && profile?.gmailAccount && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-charcoal">
                Gmail send permissions are missing
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your current connection only has read-only access. To send emails and save drafts,
                you need to reconnect and grant the additional permissions.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-2.5 rounded-lg bg-navy text-ivory hover:bg-navy/90 h-7 text-xs"
              >
                <Link to="/connect" search={{ reconnect: "true" }}>Reconnect Gmail →</Link>
              </Button>
            </div>
          </div>
        )}

        {(syncing || isSyncActive) && (
          <div className="mt-3 rounded-xl border border-navy/20 bg-navy/5 px-4 py-3 text-xs text-navy space-y-1.5 animate-pulse">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-navy" />
              <span>
                {isDemo
                  ? "Synchronizing mailbox (demo)..."
                  : account?.sync_status === 'syncing_recent'
                    ? "Importing recent emails (last 90 days)..."
                    : account?.sync_status === 'syncing_historical'
                      ? "Performing background historical backfill..."
                      : "Synchronizing mailbox..."}
              </span>
            </div>
            {isDemo ? (
              <p className="text-charcoal-soft font-sans font-medium">
                Synced {syncedSoFar} emails so far.
              </p>
            ) : account && (account.sync_progress_total ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <p className="text-charcoal-soft font-sans font-medium">
                  Synced {account.sync_progress_imported ?? 0} of {account.sync_progress_total ?? 0} emails.
                </p>
                <div className="h-1.5 w-full bg-navy/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-navy transition-all duration-300" 
                    style={{ width: `${Math.min(100, Math.round(((account.sync_progress_imported ?? 0) / (account.sync_progress_total ?? 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-charcoal-soft font-sans font-medium">
                Scanning mailbox and importing messages...
              </p>
            )}
          </div>
        )}

        {bgSyncing && !syncing && !isSyncActive && (
          <div className="mt-3 rounded-xl border border-navy/20 bg-navy/5 px-4 py-3 text-xs text-navy">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-navy" />
              <span>Background sync in progress...</span>
            </div>
          </div>
        )}

        {syncResult && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-xs text-forest">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{syncResult}</span>
          </div>
        )}
        {syncError && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{syncError}</span>
          </div>
        )}

        {debugReport && (
          <div className="mt-3 rounded-xl border border-border bg-parchment/20 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Debug Report</div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-charcoal-soft leading-relaxed">
              {JSON.stringify(debugReport, null, 2)}
            </pre>
          </div>
        )}

        {profile?.gmailAccount && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button
              onClick={handleSync}
              disabled={syncing || bgSyncing || debugging}
              className="rounded-xl bg-navy text-ivory hover:bg-navy/90"
            >
              {syncing || bgSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                "Sync Gmail"
              )}
            </Button>
            <Button
              onClick={handleDebugSync}
              disabled={syncing || debugging}
              variant="outline"
              className="rounded-xl border-border bg-card hover:bg-beige"
            >
              {debugging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Diagnosing...
                </>
              ) : (
                "Debug Sync"
              )}
            </Button>
            {isDemo ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="text-rust hover:bg-rust/10 hover:text-rust rounded-xl"
                  onClick={() => {
                    exitDemoMode();
                    window.location.href = "/";
                  }}
                >
                  Exit Demo Mode
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-border bg-card hover:bg-beige"
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="rounded-xl border-border bg-card hover:bg-beige"
                >
                  <Link to="/connect" search={{ reconnect: "true", forceSelect: "true" }}>
                    Switch Account
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="text-rust hover:bg-rust/10 hover:text-rust rounded-xl"
                  onClick={handleDisconnectGoogleAccount}
                >
                  Disconnect Google Account
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-border bg-card hover:bg-beige"
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </div>
            )}
          </div>
        )}
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
              disabled
              className="rounded-lg border-border bg-card hover:bg-beige cursor-not-allowed opacity-55"
            >
              Coming Soon
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AISection() {
  const [gemini, setGemini] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_ai_model") || "gemini-2.5-pro";
    }
    return "gemini-2.5-pro";
  });
  const [nim, setNim] = useState("llama-3.3-70b-nemotron");

  const handleGeminiChange = (val: string) => {
    setGemini(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("repeatless_ai_model", val);
      window.dispatchEvent(new CustomEvent("ai-model-changed", { detail: val }));
      toast.success(`Active AI model switched to ${val}`);
    }
  };

  return (
    <>
      <Card title="Gemini" desc="Model used for summaries, categorisation, and chat answers.">
        <RadioRow
          value={gemini}
          onChange={handleGeminiChange}
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
  const [initialSync, setInitialSync] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_sync_initial") !== "false";
    }
    return true;
  });
  const [incrementalSync, setIncrementalSync] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_sync_incremental") !== "false";
    }
    return true;
  });
  const [includeTrash, setIncludeTrash] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_sync_include_trash_spam") === "true";
    }
    return false;
  });
  const [autoCategorize, setAutoCategorize] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_sync_autocategorize") !== "false";
    }
    return true;
  });

  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("repeatless_sync_logs");
      setLogs(raw ? JSON.parse(raw) : []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadLogs();
    const handleLogs = () => loadLogs();
    window.addEventListener("sync-logs-updated", handleLogs);
    return () => window.removeEventListener("sync-logs-updated", handleLogs);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLastSynced(localStorage.getItem("gmail_last_synced_at"));

    const interval = setInterval(() => {
      const stored = localStorage.getItem("gmail_last_synced_at");
      setLastSynced(stored);

      if (stored && incrementalSync) {
        const lastTime = new Date(stored).getTime();
        const diff = Date.now() - lastTime;
        const remaining = Math.max(0, Math.round((60000 - diff) / 1000));
        setTimeRemaining(remaining);
      } else {
        setTimeRemaining(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [incrementalSync]);

  const handleToggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(key, String(value));
      toast.success("Sync preference updated.");
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Sync preferences" desc="Control how Repeatless mirrors your Gmail.">
        <div className="space-y-1">
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Initial historical sync</div>
              <div className="text-xs text-muted-foreground">Backfill all email history (one-time).</div>
            </div>
            <Switch
              checked={initialSync}
              onCheckedChange={(val) => handleToggle("repeatless_sync_initial", val, setInitialSync)}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Incremental sync</div>
              <div className="text-xs text-muted-foreground">Pull new email every 60 seconds.</div>
            </div>
            <Switch
              checked={incrementalSync}
              onCheckedChange={(val) => handleToggle("repeatless_sync_incremental", val, setIncrementalSync)}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Include Trash & Spam</div>
              <div className="text-xs text-muted-foreground">Index Trash and Spam folders.</div>
            </div>
            <Switch
              checked={includeTrash}
              onCheckedChange={(val) => handleToggle("repeatless_sync_include_trash_spam", val, setIncludeTrash)}
            />
          </div>
          <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Auto-categorize on arrival</div>
              <div className="text-xs text-muted-foreground">Run categorisation as emails sync.</div>
            </div>
            <Switch
              checked={autoCategorize}
              onCheckedChange={(val) => handleToggle("repeatless_sync_autocategorize", val, setAutoCategorize)}
            />
          </div>
        </div>
      </Card>

      <Card title="Sync Status & Activity Console" desc="Real-time monitoring of your background synchronization.">
        <div className="grid grid-cols-2 gap-4 border border-border rounded-xl p-4 bg-parchment/40">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Sync Event</div>
            <div className="mt-1 text-sm font-medium text-charcoal">
              {lastSynced ? formatDistanceToNow(new Date(lastSynced), { addSuffix: true }) : "Never"}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next Scheduled Run</div>
            <div className="mt-1 text-sm font-medium text-charcoal font-sans">
              {!incrementalSync
                ? "Incremental sync off"
                : timeRemaining !== null
                  ? `In ${timeRemaining}s`
                  : "Syncing..."}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Log Console</div>
          <div className="h-48 overflow-y-auto rounded-xl bg-charcoal p-4 font-mono text-xs text-ivory/90 border border-border shadow-inner">
            {logs.length === 0 ? (
              <div className="text-muted-foreground/60 italic">No sync activity logged yet.</div>
            ) : (
              logs.slice().reverse().map((log, index) => {
                let colorClass = "text-ivory/80";
                if (log.type === "success") colorClass = "text-emerald-400";
                if (log.type === "error") colorClass = "text-rose-400 font-semibold";
                return (
                  <div key={index} className="py-1 border-b border-ivory/5 last:border-0 flex items-start gap-2">
                    <span className="text-muted-foreground/50 shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={colorClass}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function NotificationsSection() {
  const [priorityAlerts, setPriorityAlerts] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_notification_priority") !== "false";
    }
    return true;
  });
  const [dailyDigest, setDailyDigest] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_notification_daily") !== "false";
    }
    return true;
  });
  const [weeklyReport, setWeeklyReport] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_notification_weekly") === "true";
    }
    return false;
  });
  const [newsletterDigest, setNewsletterDigest] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("repeatless_notification_newsletters") !== "false";
    }
    return true;
  });

  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Browser notifications are not supported by your device.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        toast.success("Notification permissions granted!");
      } else if (perm === "denied") {
        toast.warning("Notification permissions were denied. Please update browser settings to enable.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to request notification permissions.");
    }
  };

  const handleSendTestNotification = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") {
      toast.error("Please grant notification permissions first.");
      return;
    }
    new Notification("Repeatless AI Test Notification", {
      body: "This is a test alert. Notifications are working correctly!",
    });
    toast.success("Test notification dispatched.");
  };

  const handleToggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(key, String(value));
      toast.success("Notification settings saved.");
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Alerts & digests" desc="Choose what's worth interrupting you for.">
        <div className="space-y-1">
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Priority email alerts</div>
              <div className="text-xs text-muted-foreground">Notify when an important email arrives.</div>
            </div>
            <Switch
              checked={priorityAlerts}
              onCheckedChange={(val) => handleToggle("repeatless_notification_priority", val, setPriorityAlerts)}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Daily morning digest</div>
              <div className="text-xs text-muted-foreground">9:00 AM brief of overnight activity.</div>
            </div>
            <Switch
              checked={dailyDigest}
              onCheckedChange={(val) => handleToggle("repeatless_notification_daily", val, setDailyDigest)}
            />
          </div>
          <div className="flex items-center justify-between border-b border-border py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Weekly intelligence report</div>
              <div className="text-xs text-muted-foreground">Mondays at 8:00 AM.</div>
            </div>
            <Switch
              checked={weeklyReport}
              onCheckedChange={(val) => handleToggle("repeatless_notification_weekly", val, setWeeklyReport)}
            />
          </div>
          <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
              <div className="text-sm font-medium text-charcoal">Newsletter digest</div>
              <div className="text-xs text-muted-foreground">Unified news extracted from your subscriptions.</div>
            </div>
            <Switch
              checked={newsletterDigest}
              onCheckedChange={(val) => handleToggle("repeatless_notification_newsletters", val, setNewsletterDigest)}
            />
          </div>
        </div>
      </Card>

      <Card title="Browser Notifications" desc="System alerts for instant desktop updates.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border p-4 bg-parchment/40">
          <div>
            <div className="text-sm font-medium text-charcoal">
              Permission Status:{" "}
              <span className={cn(
                "capitalize font-semibold",
                permission === "granted" && "text-forest",
                permission === "denied" && "text-rust",
                permission === "default" && "text-gold"
              )}>
                {permission}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {permission === "granted"
                ? "Repeatless can show system notifications on your desktop."
                : "Grant permissions to allow the app to push system notification alerts."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {permission !== "granted" && (
              <Button
                onClick={handleRequestPermission}
                className="rounded-xl bg-navy text-ivory hover:bg-navy/90"
              >
                Enable Notifications
              </Button>
            )}
            <Button
              onClick={handleSendTestNotification}
              variant="outline"
              disabled={permission !== "granted"}
              className="rounded-xl border-border bg-card hover:bg-beige"
            >
              Send Test Notification
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      // Default to 'light' (Ivory) for all users
      return localStorage.getItem("repeatless_theme") || "light";
    }
    return "light";
  });

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    if (typeof window === "undefined") return;
    localStorage.setItem("repeatless_theme", newTheme);
    // Only 'dark' explicitly enables dark mode; 'light' and 'system' use light
    const isDark = newTheme === "dark";
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.dispatchEvent(new CustomEvent("theme-changed"));
  };

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
            onClick={() => handleThemeChange(t.id)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors cursor-pointer",
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

function Field({
  label,
  value,
  onChange,
  readOnly,
  disabled
}: {
  label: string;
  value?: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        className="h-10 rounded-xl bg-background"
      />
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
