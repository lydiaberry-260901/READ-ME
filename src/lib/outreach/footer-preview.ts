// The footer as shown in template previews, with a placeholder for the personal unsubscribe link.
import { prisma } from "@/lib/db";
import { marketingFooter } from "./footer";

export async function footerPreviewFor(organisationId: string) {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } });
  return marketingFooter(org, `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/unsubscribe/(a personal link for each person)`);
}
