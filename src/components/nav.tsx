"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, CheckSquare, Ellipsis, Home, Target, FolderKanban, Scale, User, Settings, Wrench } from "lucide-react";

const main = [
  { href: "/", label: "Home", icon: Home },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/ai", label: "AI", icon: Bot },
];

const more = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reality-check", label: "Reality Check", icon: Scale },
  { href: "/profile", label: "Life Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/setup", label: "Setup", icon: Wrench },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function MoreList() {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {more.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className="flex min-h-12 items-center gap-3 px-4 text-sm">
            <Icon size={18} aria-hidden /> {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-surface p-4 md:block">
      <div className="mb-6 px-2 text-lg font-semibold tracking-tight">LIFEOS</div>
      <nav className="space-y-1">
        {[...main, ...more].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(path, href) ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${
              active(path, href) ? "bg-accent/10 font-medium text-accent" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={18} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function TabBar() {
  const path = usePathname();
  const moreActive = more.some((m) => active(path, m.href)) || path === "/more";
  const items = [...main.map((m) => ({ ...m })), { href: "/more", label: "More", icon: Ellipsis }];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const on = href === "/more" ? moreActive : active(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${on ? "text-accent" : "text-muted"}`}
              >
                <Icon size={20} aria-hidden /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
