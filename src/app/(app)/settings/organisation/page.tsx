import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { footerGaps, marketingFooter } from "@/lib/outreach/footer";
import { PageHeader, Notice } from "@/components/ui";
import { OrganisationForm } from "./OrganisationForm";

export const metadata = { title: "Organisation" };

export default async function OrganisationPage() {
  const user = await requireCapability("settings.manage");
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  const gaps = footerGaps(org);
  return (
    <>
      <PageHeader title="Organisation" description="Who we are. These details go in the footer of every marketing email, which the law requires." />
      {gaps.length ? (
        <div className="mb-8 max-w-2xl">
          <Notice tone="amber" title="The email footer is not complete">Please add {gaps.join(", ")}.</Notice>
        </div>
      ) : null}
      <div className="grid gap-12 xl:grid-cols-[1fr_1fr]">
        <OrganisationForm org={{ name: org.name, legalName: org.legalName, postalAddress: org.postalAddress, websiteUrl: org.websiteUrl, privacyNoticeUrl: org.privacyNoticeUrl, phoneCheckMaxAgeDays: org.phoneCheckMaxAgeDays }} />
        <section aria-labelledby="footer-heading">
          <h2 id="footer-heading" className="text-sm font-semibold">The footer as it appears today</h2>
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-dashed border-line bg-panel px-4 py-3 text-sm leading-relaxed text-fg-muted">
            {marketingFooter(org, "(each person's own unsubscribe link)")}
          </div>
        </section>
      </div>
    </>
  );
}
