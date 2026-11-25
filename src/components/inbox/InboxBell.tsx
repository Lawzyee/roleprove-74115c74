import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { badgeText } from "@/lib/notifications";
import { useUnreadCount } from "./inbox-data";

export function InboxBell() {
  const unread = useUnreadCount().data ?? 0;
  const label = unread > 0 ? `Inbox, ${unread} unread notification${unread === 1 ? "" : "s"}` : "Inbox, no unread notifications";
  return (
    <Link to="/inbox" aria-label={label} className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-[1.15rem] text-destructive-foreground">
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}
