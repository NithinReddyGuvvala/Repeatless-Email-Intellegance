import { cn } from "@/lib/utils";
import { Paperclip, Star } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function safeParseDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const date =
      typeof value === "number"
        ? new Date(value)
        : typeof value === "object" && value instanceof Date
          ? value
          : /^\d+$/.test(String(value))
            ? new Date(Number(value))
            : new Date(value);

    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch (e) {
    return null;
  }
}

export function formatEmailDate(value: any, formatStr: string = "MMM d"): string {
  const date = safeParseDate(value);
  if (!date) return "Unknown date";
  try {
    return format(date, formatStr);
  } catch (e) {
    return "Unknown date";
  }
}

export function formatEmailRelative(value: any, options?: { addSuffix?: boolean }): string {
  const date = safeParseDate(value);
  if (!date) return "Unknown date";
  try {
    return formatDistanceToNow(date, options);
  } catch (e) {
    return "Unknown date";
  }
}

export type Category = "Work" | "Newsletter" | "Job" | "Finance" | "Personal" | "Notification";

export type Email = {
  id: string;
  threadId: string;
  senderName: string;
  senderEmail: string;
  senderInitials: string;
  avatarColor: string;
  subject: string;
  preview: string;
  body?: string;
  date: string;
  unread: boolean;
  starred: boolean;
  category: Category;
  importance: "high" | "normal" | "low";
  labels: string[];
  hasAttachments: boolean;
};

export type Thread = {
  id: string;
  gmailThreadId?: string;
  subject: string;
  participants: string[];
  messages: {
    id: string;
    senderName: string;
    senderEmail: string;
    senderInitials: string;
    avatarColor: string;
    subject: string;
    body: string;
    date: string;
    unread: boolean;
    starred: boolean;
    category: Category;
    labels: string[];
    hasAttachments: boolean;
    toAddresses?: string[];
  }[];
  category: Category;
  summary: string;
  insights: string[];
  lastActivity: string;
  userEmails?: string[];
};

export const categoryColors: Record<Category, string> = {
  Work: "border-navy/20 bg-navy/5 text-navy",
  Newsletter: "border-forest/20 bg-forest/5 text-forest",
  Job: "border-gold/20 bg-gold/5 text-[oklch(0.55_0.14_60)]",
  Finance: "border-rust/20 bg-rust/5 text-rust",
  Personal: "border-charcoal/20 bg-charcoal/5 text-charcoal",
  Notification: "border-navy-soft/20 bg-navy-soft/5 text-navy-soft",
};

export function Avatar({
  initials,
  color,
  size = 40,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-medium text-ivory"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.36,
      }}
    >
      {initials}
    </div>
  );
}

export function CategoryBadge({ category }: { category: Category | string }) {
  const colorClass = categoryColors[category as Category] || "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider",
        colorClass,
      )}
    >
      {category}
    </span>
  );
}

export function ImportanceDot({ level }: { level: "high" | "normal" | "low" }) {
  const map = {
    high: "bg-rust",
    normal: "bg-navy-soft",
    low: "bg-border",
  } as const;
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", map[level])} />;
}

/**
 * UnreadDot — the Gmail-style blue unread indicator.
 * Occupies a fixed 8px column. Invisible (opacity-0) when read so layout stays stable.
 */
export function UnreadDot({ visible }: { visible: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full transition-all duration-200",
        visible
          ? "bg-[#1a73e8] opacity-100 scale-100"
          : "bg-transparent opacity-0 scale-75 pointer-events-none",
      )}
      aria-hidden={!visible}
      title={visible ? "Unread" : undefined}
    />
  );
}

export function EmailRow({
  email: emailProp,
  isSelected = false,
  onSelectToggle,
  from,
  onMarkRead,
}: {
  email: Email;
  isSelected?: boolean;
  onSelectToggle?: (id: string) => void;
  from?: string;
  /** Optional: called when row is clicked while unread, so parent can flip the flag in their local list */
  onMarkRead?: (id: string) => void;
}) {
  const navigate = useNavigate();

  // Optimistic local unread state — flips immediately on click for instant visual feedback
  const [localUnread, setLocalUnread] = useState(emailProp.unread);

  const unread = localUnread;

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    // Optimistically mark as read — dot disappears before page transition
    if (localUnread) {
      setLocalUnread(false);
      onMarkRead?.(emailProp.id);
    }

    navigate({
      to: "/threads/$threadId",
      params: { threadId: emailProp.threadId },
      search: { from },
    });
  };

  return (
    <div
      onClick={handleRowClick}
      className={cn(
        "group grid items-center gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-beige/60 cursor-pointer sm:gap-4 sm:px-6",
        // Grid layout: [8px dot] [optional checkbox] [avatar] [content] [timestamp]
        onSelectToggle
          ? "grid-cols-[8px_auto_auto_minmax(0,1fr)_auto]"
          : "grid-cols-[8px_auto_minmax(0,1fr)_auto]",
        // Unread rows get a slightly brighter background
        unread ? "bg-white dark:bg-card" : "bg-transparent",
        isSelected && "bg-beige/30",
      )}
    >
      {/* ── Unread indicator dot ── */}
      <UnreadDot visible={unread} />

      {/* ── Optional selection checkbox ── */}
      {onSelectToggle && (
        <input
          type="checkbox"
          id={`email-checkbox-${emailProp.id}`}
          checked={isSelected}
          onChange={() => onSelectToggle?.(emailProp.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-border border-2 accent-navy cursor-pointer z-10"
          aria-label={`Select email: ${emailProp.subject}`}
        />
      )}

      {/* ── Avatar ── */}
      <Avatar initials={emailProp.senderInitials} color={emailProp.avatarColor} size={38} />

      {/* ── Email content ── */}
      <div className="min-w-0">
        {/* Sender row */}
        <div className="flex items-center gap-2">
          <ImportanceDot level={emailProp.importance} />
          <span
            className={cn(
              "truncate text-[14px]",
              unread
                ? "font-semibold text-charcoal"
                : "font-normal text-charcoal-soft",
            )}
          >
            {emailProp.senderName}
          </span>
          <CategoryBadge category={emailProp.category} />
          {emailProp.starred && <Star className="h-3.5 w-3.5 fill-gold text-gold" />}
          {emailProp.hasAttachments && (
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Subject + preview row */}
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              unread
                ? "font-semibold text-charcoal"
                : "font-normal text-charcoal-soft",
            )}
          >
            {emailProp.subject}
          </span>
          <span
            className={cn(
              "hidden truncate text-[13px] sm:inline",
              unread ? "text-charcoal/60" : "text-muted-foreground",
            )}
          >
            — {emailProp.preview}
          </span>
        </div>
      </div>

      {/* ── Timestamp ── */}
      <time
        className={cn(
          "shrink-0 text-[12px] uppercase tracking-wide",
          unread
            ? "font-semibold text-charcoal"
            : "font-medium text-muted-foreground",
        )}
        title={formatEmailDate(emailProp.date, "PPpp")}
      >
        {formatEmailRelative(emailProp.date, { addSuffix: false })}
      </time>
    </div>
  );
}
