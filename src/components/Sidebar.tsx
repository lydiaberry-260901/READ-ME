"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Logo } from "@/components/Logo";

export type NavItem = { href: string; label: string; icon: keyof typeof icons };

const icons = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5",
  building: "M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2H6a2 2 0 0 1-2 0ZM8 7h7M8 11h5",
  users: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.15a3 3 0 0 1 0 5.7",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h5l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
} as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

export function Sidebar({
  items,
  userName,
  userEmail,
  roleLabel,
  signOutSlot,
}: {
  items: NavItem[];
  userName: string;
  userEmail: string;
  roleLabel: string;
  signOutSlot: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Main menu" className="flex flex-1 flex-col gap-1 px-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={clsx(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors",
            isActive(item.href)
              ? "bg-cream/10 text-cream shadow-[inset_3px_0_0_var(--moca-amber)]"
              : "text-mocha-soft hover:bg-cream/5 hover:text-cream",
          )}
        >
          <Icon name={item.icon} />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-cream/10 px-5 py-4">
      <p className="truncate text-sm font-medium text-cream">{userName}</p>
      <p className="truncate text-xs text-mocha-soft">{userEmail}</p>
      <p className="mt-2 inline-block rounded-full bg-cream/10 px-2 py-0.5 text-xs text-cream">{roleLabel}</p>
      <div className="mt-3">{signOutSlot}</div>
    </div>
  );

  return (
    <>
      {/* Phone: top bar with a menu button */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-mocha px-4 py-3 lg:hidden">
        <Logo onDark />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-cream ring-1 ring-cream/30"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open ? (
        <div id="mobile-menu" className="fixed inset-x-0 top-[56px] bottom-0 z-20 flex flex-col bg-mocha pt-3 lg:hidden">
          {nav}
          {footer}
        </div>
      ) : null}

      {/* Laptop: fixed side menu */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-mocha lg:flex">
        <div className="px-6 pb-6 pt-7">
          <Logo onDark />
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
