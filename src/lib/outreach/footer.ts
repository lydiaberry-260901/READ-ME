// The fixed footer added to every marketing email when it is put together.
// It is never stored in a template, so it cannot be edited out.

export type FooterOrganisation = {
  name: string;
  legalName: string | null;
  postalAddress: string | null;
  websiteUrl: string | null;
  privacyNoticeUrl: string | null;
};

export function marketingFooter(org: FooterOrganisation, unsubscribeLink: string): string {
  const who = [org.legalName || org.name, org.postalAddress].filter(Boolean).join(", ");
  const lines = [
    `This email is from ${who}${org.websiteUrl ? ` (${org.websiteUrl.replace(/^https?:\/\//, "")})` : ""}.`,
    "We hold your work contact details because we think Moca may be relevant to your role, under our legitimate interests." +
      (org.privacyNoticeUrl ? ` Our privacy notice explains where we got them, how we use them and your rights: ${org.privacyNoticeUrl}` : ""),
    `If you would rather not hear from us, unsubscribe here: ${unsubscribeLink}`,
  ];
  return lines.join("\n");
}

/** What still needs filling in before the footer is complete. Shown to admins. */
export function footerGaps(org: FooterOrganisation): string[] {
  const gaps: string[] = [];
  if (!org.legalName) gaps.push("the company's legal name");
  if (!org.postalAddress) gaps.push("a postal address");
  if (!org.privacyNoticeUrl) gaps.push("a link to the full privacy notice");
  return gaps;
}

/** The email exactly as it will be sent: the body a person wrote, then the fixed footer. */
export function assembleEmail(body: string, footer: string | null): string {
  return footer ? `${body.trimEnd()}\n\n${footer}` : body.trimEnd();
}
