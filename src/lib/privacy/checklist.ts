// Works out the go live checklist: automatic items from the CRM's settings, the rest ticked by hand.
import { prisma } from "@/lib/db";
import { footerGaps } from "@/lib/outreach/footer";
import { GO_LIVE_CHECKLIST, type ChecklistState } from "./setup";

export async function goLiveChecklist(organisationId: string) {
  const [org, suppliers] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } }),
    prisma.supplier.findMany({ where: { organisationId }, select: { dpaInPlace: true } }),
  ]);
  const manual = (org.privacyChecklist ?? {}) as ChecklistState;
  const lia = (org.legitimateInterestsAssessment ?? null) as { purpose?: string; necessity?: string; balance?: string } | null;
  const auto: Record<string, { done: boolean; why: string }> = {
    lead: { done: Boolean(org.dataProtectionLeadId), why: org.dataProtectionLeadId ? "A lead is named." : "Name one under Keeping data." },
    lia: { done: Boolean(lia?.purpose && lia.necessity && lia.balance), why: lia?.purpose && lia.necessity && lia.balance ? "All three tests are written up." : "Fill in all three tests below." },
    privacyNotice: { done: Boolean(org.privacyNoticeUrl), why: org.privacyNoticeUrl ? "The link is set." : "Add the link in Organisation settings." },
    footer: { done: footerGaps(org).length === 0, why: footerGaps(org).length ? `Still needed: ${footerGaps(org).join(", ")}.` : "Complete." },
    suppliers: {
      done: suppliers.length > 0 && suppliers.every((s) => s.dpaInPlace),
      why: suppliers.length === 0 ? "Open the supplier register." : `${suppliers.filter((s) => s.dpaInPlace).length} of ${suppliers.length} suppliers have one.`,
    },
  };
  const items = GO_LIVE_CHECKLIST.map((i) => {
    if (i.auto) return { ...i, done: auto[i.key].done, detail: auto[i.key].why, doneAt: null as string | null };
    const m = manual[i.key];
    return { ...i, done: Boolean(m?.done), detail: i.key === "icoFee" && org.icoFeeRenewalDate ? `Renewal date recorded.` : null, doneAt: m?.doneAt ?? null };
  });
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}
