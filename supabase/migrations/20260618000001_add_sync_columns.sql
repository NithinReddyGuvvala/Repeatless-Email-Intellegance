-- Add sync status and progress columns to gmail_accounts table
ALTER TABLE public.gmail_accounts 
ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'idle',
ADD COLUMN IF NOT EXISTS sync_progress_imported integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS sync_progress_total integer DEFAULT 0;

COMMENT ON COLUMN public.gmail_accounts.sync_status IS 'Tracks the status of Gmail sync (idle, syncing, paused, completed, etc.)';
COMMENT ON COLUMN public.gmail_accounts.sync_progress_imported IS 'Number of emails successfully synced so far in the current session';
COMMENT ON COLUMN public.gmail_accounts.sync_progress_total IS 'Total number of emails expected to be synced';
