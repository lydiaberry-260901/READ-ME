# Supplier checklist and data processing agreements

**Draft for legal review.** The live register is in the CRM (Privacy centre, Suppliers). This document is the checklist to work through for each supplier, and what each agreement must cover.

Most of these suppliers offer standard data processing terms as part of their service. The usual route is to find, read and accept those terms (often in the account settings or on their legal pages), rather than write a new contract. Nothing below states what any supplier's terms say: confirm each point from their current documents.

## Checklist for every supplier

For each one, record in the CRM:

1. **What they do for us, and what data they receive.** Already filled in from what the CRM sends.
2. **Where the data is stored and processed.** Choose UK or EU where offered.
3. **If data leaves the UK:** the safeguard (a UK adequacy decision for the destination, or the UK international data transfer agreement or addendum).
4. **A data processing agreement is in place**, with its date. It must cover, as a minimum (UK GDPR Article 28):
   * processing only on Moca's documented instructions
   * confidentiality of their staff
   * appropriate security
   * using sub processors only with Moca's permission, on the same terms
   * helping Moca answer requests from people about their data
   * helping with security, breaches and impact assessments
   * deleting or returning the data at the end
   * giving Moca the information to show compliance, and allowing audits
5. **For AI services:** the provider does not use our data to train its models.
6. **Breach notice:** they tell us without undue delay.
7. **Review:** check again each year, and when the service changes.

## The suppliers the CRM uses

| Supplier | What the CRM sends | Points to confirm |
| --- | --- | --- |
| Hostinger (VPS hosting) | Everything stored in the CRM | Data centre location (choose UK or EU); data processing terms in the account; how backups they take (if any) are protected |
| Anthropic (Claude API) | Company information, news, draft context, call transcripts with email addresses and phone numbers removed | Commercial terms on training and retention of API data; processing location and transfer safeguard; data processing addendum |
| Email sending service [name, for example Hostinger email] | Team members' names and work emails; deal, company and task details in alerts | Location; data processing terms |
| GNews (only if the news service is switched on) | Company names only | Confirm no personal data is sent; whether an agreement is needed at all |
| Google (sign in, Gmail, Google Calendar) | Team members' sign in; emails and meetings with contacts are read from and sent through each person's own account | Covered by Moca's Google Workspace data processing terms, if Moca uses Workspace |
| Microsoft (sign in, Outlook, calendar) | As for Google | Covered by Moca's Microsoft 365 data protection terms, if Moca uses Microsoft 365 |
| Call recording tool [name, if used] | Sends transcripts to the CRM | It records calls, so it is a processor in its own right: check its terms, location and security |
| Companies House | Company numbers only (public data lookup) | Not a processor of personal data for us; no agreement needed [confirm] |

When everything for a supplier is confirmed, update its entry in the CRM, including "Data processing agreement: in place" and the date. The go live checklist ticks itself once every supplier has one.
