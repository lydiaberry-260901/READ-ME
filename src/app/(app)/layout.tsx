import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { roleLabels } from "@/lib/labels";
import { Sidebar, type NavItem } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/companies", label: "Companies", icon: "building" },
    { href: "/contacts", label: "Contacts", icon: "person" },
    { href: "/outreach", label: "Outreach", icon: "mail" },
    { href: "/import", label: "Import", icon: "upload" },
    { href: "/knowledge", label: "Knowledge", icon: "book" },
  ];
  if (can(user, "users.manage")) {
    items.push({ href: "/settings/users", label: "People and teams", icon: "users" });
  }
  if (can(user, "settings.manage")) {
    items.push({ href: "/settings/organisation", label: "Organisation", icon: "settings" });
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        items={items}
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
            <button type="submit" className="text-sm font-medium text-ink-soft underline-offset-4 hover:text-cream hover:underline">
              Sign out
            </button>
          </form>
        }
      />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">{children}</div>
      </main>
    </div>
  );
}
