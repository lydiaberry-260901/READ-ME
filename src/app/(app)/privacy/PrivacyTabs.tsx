"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/privacy", label: "Overview" },
  { href: "/privacy/requests", label: "Requests" },
  { href: "/privacy/breaches", label: "Breaches" },
  { href: "/privacy/retention", label: "Keeping data" },
  { href: "/privacy/suppliers", label: "Suppliers" },
  { href: "/privacy/records", label: "Records and checklist" },
  { href: "/privacy/access-log", label: "Access log" },
];

export function PrivacyTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Privacy centre" className="mt-2 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active = t.href === "/privacy" ? path === "/privacy" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm no-underline", active ? "border-green-text text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
