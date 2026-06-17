import { cn } from "@/lib/utils";
import { categoryColors, type Category, type Email } from "@/lib/mock-data";
import { Paperclip, Star } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "@tanstack/react-router";

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

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wider",
        categoryColors[category],
      )}
    >
      {category}
    </span>
  );
}

export function ImportanceDot({ level }: { level: Email["importance"] }) {
  const map = {
    high: "bg-rust",
    normal: "bg-navy-soft",
    low: "bg-border",
  } as const;
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", map[level])} />;
}

export function EmailRow({ email }: { email: Email }) {
  return (
    <Link
      to="/threads/$threadId"
      params={{ threadId: email.threadId }}
      className={cn(
        "group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3.5 transition-colors hover:bg-beige/60 sm:gap-4 sm:px-6",
        email.unread && "bg-card",
      )}
    >
      <Avatar initials={email.senderInitials} color={email.avatarColor} size={38} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ImportanceDot level={email.importance} />
          <span
            className={cn(
              "truncate text-[14px]",
              email.unread ? "font-semibold text-charcoal" : "font-medium text-charcoal-soft",
            )}
          >
            {email.senderName}
          </span>
          <CategoryBadge category={email.category} />
          {email.starred && <Star className="h-3.5 w-3.5 fill-gold text-gold" />}
          {email.hasAttachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-[14px]",
              email.unread ? "font-medium text-charcoal" : "text-charcoal-soft",
            )}
          >
            {email.subject}
          </span>
          <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">
            — {email.preview}
          </span>
        </div>
      </div>
      <time
        className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
        title={format(new Date(email.date), "PPpp")}
      >
        {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
      </time>
    </Link>
  );
}
