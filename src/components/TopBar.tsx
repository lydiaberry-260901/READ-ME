"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Logo } from "@/components/Logo";
import { CommandBar } from "@/components/CommandBar";
import { LiveAutomations } from "@/components/LiveAutomations";

export type NavItem = { href: string; label: string };

export function TopBar({
  items,
  adminItems,
  userName,
  userEmail,
  roleLabel,
  signOutSlot,
}: {
  items: NavItem[];
  adminItems: NavItem[];
  userName: string;
  userEmail: string;
  roleLabel: string;
  signOutSlot: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<null | "user" | "mobile">(null);
  const userRef = useRef<HTMLDivElement>(null);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => setMenu(null), [pathname]);
  useEffect(() => {
    if (menu !== "user") return;
    const close = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const initials = userName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas-deep/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0 no-underline" aria-label="Moca CRM home">
          <Logo height={20} />
        </Link>

        <nav aria-label="Main menu" className="hidden h-full items-stretch gap-1 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={clsx(
                "relative flex items-center px-3 text-sm font-medium no-underline transition-colors",
                isActive(item.href) ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {item.label}
              {isActive(item.href) ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-green-text" aria-hidden="true" /> : null}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CommandBar pages={[...items, ...adminItems]} />
          <LiveAutomations />
          <div className="relative" ref={userRef}>
            <button
              type="button"
              onClick={() => setMenu((m) => (m === "user" ? null : "user"))}
              aria-expanded={menu === "user"}
              aria-label={`Your account: ${userName}`}
              className="grid size-8 place-items-center rounded-full border border-line-strong bg-panel text-xs font-semibold text-fg hover:border-fg-muted"
            >
              {initials || "?"}
            </button>
            {menu === "user" ? (
              <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-line-strong bg-panel p-2 text-sm shadow-2xl">
                <div className="px-2 py-2">
                  <p className="truncate font-medium">{userName}</p>
                  <p className="truncate text-xs text-fg-muted">{userEmail}</p>
                  <p className="mt-1 text-xs text-fg-muted">{roleLabel}</p>
                </div>
                {adminItems.length ? (
                  <div className="border-t border-line py-1">
                    {adminItems.map((a) => (
                      <Link key={a.href} href={a.href} className="block rounded px-2 py-1.5 text-fg no-underline hover:bg-panel-raised">{a.label}</Link>
                    ))}
                  </div>
                ) : null}
                <div className="border-t border-line px-2 pt-2">{signOutSlot}</div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMenu((m) => (m === "mobile" ? null : "mobile"))}
            aria-expanded={menu === "mobile"}
            aria-controls="mobile-menu"
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium lg:hidden"
          >
            {menu === "mobile" ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {menu === "mobile" ? (
        <nav id="mobile-menu" aria-label="Main menu" className="border-t border-line px-4 py-3 lg:hidden">
          {[...items, ...adminItems].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={clsx("block rounded px-3 py-2 text-sm no-underline", isActive(item.href) ? "bg-panel text-fg" : "text-fg-muted")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
