import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { roleLabels } from "@/lib/labels";
import { TopBar, type NavItem } from "@/components/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Everyone sees analytics, limited to the records they are allowed to see.
  const items: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/tasks", label: "Today" },
    { href: "/deals", label: "Deals" },
    { href: "/analytics", label: "Analytics" },
    { href: "/companies", label: "Companies" },
    { href: "/contacts", label: "Contacts" },
    { href: "/news", label: "News" },
    { href: "/transcripts", label: "Calls" },
    { href: "/outreach", label: "Outreach" },
    { href: "/calendar", label: "Calendar" },
    { href: "/automations", label: "Automations" },
  ];

  const adminItems: NavItem[] = [
    { href: "/settings/connections", label: "Email and calendar" },
    { href: "/knowledge", label: "Knowledge library" },
    { href: "/battlecards", label: "Battlecards" },
    { href: "/import", label: "Import a CSV file" },
  ];
  if (can(user, "pipelineReview.view")) adminItems.unshift({ href: "/deals/review", label: "Pipeline review" });
  if (can(user, "users.manage")) adminItems.push({ href: "/settings/users", label: "People and teams" });
  if (can(user, "settings.manage")) {
    adminItems.push({ href: "/settings/organisation", label: "Organisation" });
    adminItems.push({ href: "/settings/pipeline", label: "Deal stages" });
    adminItems.push({ href: "/settings/news", label: "News settings" });
    adminItems.push({ href: "/settings/transcripts", label: "Call recording tools" });
  }
  if (can(user, "alerts.view")) adminItems.push({ href: "/settings/alerts", label: "Alert log" });

  return (
    <div className="min-h-screen">
      <TopBar
        items={items}
        adminItems={adminItems}
        userName={user.name ?? user.email}
        userEmail={user.email}
        roleLabel={roleLabels[user.role]}
        signOutSlot={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="w-full rounded px-0 py-1.5 text-left text-sm text-fg-muted hover:text-fg">
              Sign out
            </button>
          </form>
        }
      />
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
