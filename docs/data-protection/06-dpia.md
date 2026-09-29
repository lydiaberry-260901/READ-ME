# Data protection impact assessment: Moca CRM

**Draft for legal review.** A short risk review of the CRM, including call transcripts and AI use.

Prepared by: [name] &nbsp; Date: [dd/mm/yyyy] &nbsp; Review by: [dd/mm/yyyy, and whenever the processing changes] (set the review date in the CRM, Privacy centre, Keeping data, so a reminder is sent)

## 1. Why an assessment

The CRM holds business contact details at scale, records and transcribes calls, uses AI to read and summarise them, and matches people across email and calendar. Call recording and AI use are new ways of handling personal data, so an assessment is good practice, and the brief for the CRM requires one.

## 2. What the processing is

| | |
| --- | --- |
| People | Business contacts at prospect and customer organisations; Moca's own team |
| Data | Name, job title, work email and phone, organisation, public profile link, business notes, source; emails and meetings with them; call recordings' transcripts; opt out status and do not call checks |
| Sources | Contacts themselves; business and public sources; CSV imports; team members' Gmail or Outlook and calendars (only messages and meetings with CRM contacts are kept); call recording tools |
| Purpose | Business to business prospecting and relationship management |
| Lawful basis | Legitimate interests (see the assessment); consent for sole traders and partnerships treated as individuals |
| Storage | The CRM's database on a Hostinger VPS in [location]; encrypted backups on the same server for 14 days, with a copy [where] |
| Who can see it | By role: reps their own and shared records, managers their team's, admins all. Views and downloads are logged |
| Shared with | Suppliers only (see the supplier checklist) |
| Kept | See the retention schedule |

## 3. Necessity and proportionality

* Only business details are collected; the CRM has no fields for anything else, and notes fields warn against personal opinions or sensitive details.
* Email sync keeps only emails with CRM contacts, and only the addresses, subject and a short extract (full text only for emails sent from the CRM, never attachments).
* People are told at first contact, can opt out in one click, and are blocked everywhere at once when they do.
* Deletion after set periods, approved by an admin each month.
* Requests about data are tracked and answered within one month.

## 4. Risks and how they are reduced

| Risk | Likelihood / impact before | What reduces it | Remaining |
| --- | --- | --- | --- |
| Someone contacted after opting out | Possible / medium | Opt out applies to everyone at once; hashed do not contact list survives deletion and is checked before every email; unsubscribe link in every marketing email | Low |
| Cold calls to numbers on the TPS or CTPS | Possible / medium | The CRM blocks call scripts unless a check within 28 days is recorded | Low, if checks are done honestly |
| Marketing emails to sole traders without consent | Possible / medium | Organisation type recorded; emails blocked without consent | Low |
| Unauthorised access to the CRM | Possible / high | Google or Microsoft work accounts, invitation only; two step sign in for admins and the data protection lead; role based access; HTTPS, security headers, rate limits; access log | Low |
| Too much personal data in notes or transcripts | Likely / medium | Warnings on notes fields; staff guidance; transcripts kept 12 months and deletable at any time | Medium: depends on staff care |
| **Call recordings made without people knowing** | Possible / high | Recording notice at the start of every call (script provided); each transcript records whether notice was given; calls without it are flagged until someone records it | Low, if the script is used |
| **Transcripts sent to the AI contain personal data** | Certain / medium | Email addresses and phone numbers removed first; only the minimum needed; provider terms to confirm no training on the data and where it is processed; supplier agreement | Medium until the provider's terms are confirmed |
| **AI gets something wrong about a person or a call** | Possible / medium | Everything the AI writes is a draft; suggested deal changes each need a person to approve; quotes from the call are checked to be real; figures not in the call are refused | Low |
| Decisions about people made automatically | Unlikely / high | AI scores are about companies only; no automated decisions about people | Low |
| Data leaves the UK without safeguards | Possible / medium | Supplier register records locations and safeguards; UK or EU locations preferred | Depends on confirmation of each supplier |
| Data kept too long | Likely without controls / medium | Monthly deletion lists, admin approval | Low |
| Loss of data | Possible / high | Nightly encrypted backups, 14 days kept, off server copy, restore tested | Low |
| Breach not handled in time | Possible / high | Breach register with a 72 hour clock and reminders; procedure | Low |

## 5. Call transcripts in more detail

* **Notice:** people are told at the start of the call that it is recorded and why, and can say no. The call recording notice and script are in document 08.
* **Access:** only the person who added the call (and their manager), people who can see the linked deal or contact, and admins. Every view is logged.
* **AI reading:** produces an outcome, summary, promises, objections and suggested changes. Suggestions change nothing until a person approves each one.
* **Keeping:** 12 months, or deleted sooner at any time; deleted with the contact on a deletion request.
* **Recording tools:** calls sent in automatically need a secret key; only a scrambled copy of the key is kept.

## 6. AI use in more detail

* **Provider:** [Anthropic, Claude API]. [Confirm and record: data sent through the API is not used for training; where it is processed; the data processing terms in place.]
* **What is sent:** company information; news headlines and short descriptions; drafts' context; call transcripts. Email addresses and phone numbers are removed first. Knowledge library documents marked as containing personal details are never sent.
* **Human review:** every AI output is a draft or suggestion; nothing is sent to anyone automatically.

## 7. Outcome

[For the reviewer.] With the measures above, the remaining risks are low to medium, and processing can go ahead. Actions before going live:

1. Confirm the AI provider's terms (training, location) and record them in the supplier register.
2. Put data processing agreements in place with every supplier.
3. Use the call recording script on every recorded call.
4. Share the staff guidance and check notes are being kept to business information.

No prior consultation with the ICO is needed, as no high risk remains [confirm].

Approved by: [name, role] &nbsp; Date: [dd/mm/yyyy]
