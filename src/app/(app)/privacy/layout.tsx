import { requireCapability } from "@/lib/session";
import { PrivacyTabs } from "./PrivacyTabs";

export default async function PrivacyLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("privacy.access");
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">Privacy centre</p>
        <PrivacyTabs />
      </div>
      {children}
    </div>
  );
}
