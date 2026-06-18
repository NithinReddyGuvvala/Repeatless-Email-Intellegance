import { syncGmailAccountAction, getSyncProgressAction } from "./actions";

// Module-level persistent state
let syncInProgress = false;
let lastSyncedAt: Date | null = null;
let intervalId: any = null;
let initialized = false;

// UI State subscribers
const listeners = new Set<(status: { syncInProgress: boolean; lastSyncedAt: Date | null }) => void>();

export function getBackgroundSyncState() {
  return { syncInProgress, lastSyncedAt };
}

export function subscribeToSyncState(listener: (status: { syncInProgress: boolean; lastSyncedAt: Date | null }) => void) {
  listeners.add(listener);
  // Immediate invocation with the current state
  listener({ syncInProgress, lastSyncedAt });
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const state = getBackgroundSyncState();
  listeners.forEach(listener => listener(state));
}

// Helper to append sync logs to localStorage
export function appendSyncLog(type: "info" | "success" | "error", message: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("repeatless_sync_logs");
    const logs = raw ? JSON.parse(raw) : [];
    logs.push({
      timestamp: new Date().toISOString(),
      type,
      message,
    });
    // Keep last 50 logs to prevent storage bloat
    if (logs.length > 50) {
      logs.shift();
    }
    window.localStorage.setItem("repeatless_sync_logs", JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent("sync-logs-updated"));
  } catch (e) {
    console.error("Failed to append sync log", e);
  }
}

// Function to run synchronization
export async function triggerBackgroundSync() {
  if (syncInProgress) {
    console.log("[Background Sync] Sync already in progress (local flag), skipping.");
    return;
  }

  // Check if incremental sync is enabled
  if (window.localStorage.getItem("repeatless_sync_incremental") === "false") {
    console.log("[Background Sync] Incremental sync is disabled in settings, skipping.");
    return;
  }

  // Double check global lock in localStorage to prevent overlapping executions with manual/other tab syncs
  if (window.localStorage.getItem("gmail_sync_in_progress") === "true") {
    console.log("[Background Sync] Overlap prevented: Lock active in localStorage.");
    return;
  }

  try {
    syncInProgress = true;
    window.localStorage.setItem("gmail_sync_in_progress", "true");
    notifyListeners();
    window.dispatchEvent(new CustomEvent("gmail-sync-start"));
    appendSyncLog("info", "Starting automatic sync in the background...");

    console.log("[Background Sync] Executing background sync server trigger...");
    const res = await syncGmailAccountAction();
    console.log("[Background Sync] Background sync response:", res);

    if (res && res.success) {
      appendSyncLog("info", "Server sync job scheduled. Polling progress...");
      
      // Poll sync status from server
      let isDone = false;
      let pollCount = 0;
      const maxPolls = 150; // ~7.5 minutes max timeout
      
      while (!isDone && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        pollCount++;
        
        try {
          const progressRes = await getSyncProgressAction();
          if (progressRes && progressRes.accounts && progressRes.accounts.length > 0) {
            const acc = progressRes.accounts[0];
            const status = acc.sync_status;
            const imported = acc.sync_progress_imported;
            const total = acc.sync_progress_total;
            
            console.log(`[Background Sync Poll #${pollCount}] Status: ${status}, Progress: ${imported}/${total}`);
            
            // Dispatch progress update event
            window.dispatchEvent(new CustomEvent("gmail-sync-progress", {
              detail: { status, imported, total }
            }));
            
            if (status === "completed" || status === "idle" || status === "error") {
              isDone = true;
              if (status === "completed") {
                appendSyncLog("success", `Sync completed successfully. ${imported} emails synced.`);
              } else if (status === "error") {
                appendSyncLog("error", "Sync finished in an error state.");
              }
            }
          } else {
            isDone = true;
          }
        } catch (pollErr) {
          console.error("[Background Sync Poll] Error fetching progress:", pollErr);
        }
      }

      lastSyncedAt = new Date();
      window.localStorage.setItem("gmail_last_synced_at", lastSyncedAt.toISOString());
    } else {
      appendSyncLog("error", `Sync scheduling failed: ${res?.message || "unknown status"}`);
    }
  } catch (err) {
    console.error("[Background Sync] Error running automatic sync:", err);
    appendSyncLog("error", `Sync failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    syncInProgress = false;
    window.localStorage.removeItem("gmail_sync_in_progress");
    notifyListeners();
    // Dispatch event to refresh route loaders/views across the app
    window.dispatchEvent(new CustomEvent("gmail-synced"));
  }
}

// Set up background polling scheduler (runs once per app session)
export function setupBackgroundSync() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  // Initialize last synced timestamp from storage
  const storedLastSynced = window.localStorage.getItem("gmail_last_synced_at");
  if (storedLastSynced) {
    lastSyncedAt = new Date(storedLastSynced);
  }

  // Clear any pre-existing interval to prevent duplicates
  if (intervalId) {
    clearInterval(intervalId);
  }

  // Sync every 1 minute (60,000 ms)
  const INTERVAL_MS = 1 * 60 * 1000;
  intervalId = setInterval(() => {
    triggerBackgroundSync();
  }, INTERVAL_MS);

  // Sync state listener to mirror manual syncs executed on other pages or tabs
  window.addEventListener("gmail-sync-start", () => {
    syncInProgress = true;
    notifyListeners();
  });

  window.addEventListener("gmail-synced", () => {
    syncInProgress = false;
    lastSyncedAt = new Date();
    window.localStorage.setItem("gmail_last_synced_at", lastSyncedAt.toISOString());
    notifyListeners();
  });

  // Run initial sync after 500ms on startup if never synced, or 5 seconds if synced recently
  const neverSynced = !lastSyncedAt;
  setTimeout(() => {
    const now = new Date();
    if (neverSynced || (lastSyncedAt && now.getTime() - lastSyncedAt.getTime() > INTERVAL_MS)) {
      triggerBackgroundSync();
    }
  }, neverSynced ? 500 : 5000);

  console.log("[Background Sync] Client background sync scheduler successfully initialized.");
}

