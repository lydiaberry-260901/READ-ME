# Moca CRM

A sales CRM for Moca: a system for managing prospects, customers, deals and follow ups. It is used by several people in the team and will be put online on a Hostinger VPS (a virtual private server, meaning a rented server of our own).

The full project brief is in [CLAUDE.md](CLAUDE.md). How to put it online is in [DEPLOY.md](DEPLOY.md). Draft data protection documents, for a solicitor to review, are in [docs/data-protection](docs/data-protection/README.md).

## What is built so far

| Phase | What it covers | Status |
| --- | --- | --- |
| 1 | Foundation: database design, sign in, roles, invitations, design settings, background worker, demo data | Done |
| 2 | Prospecting: companies and contacts, search, filters, bulk actions, saved views, lists, tags, CSV import, company details lookup, AI summary and score | Done |
| Extra | Knowledge library: drag and drop company context, case studies and transcripts to give the AI context on Moca | Done |
| 3 | Outreach: email templates and call scripts by customer group and reason, merge fields and preview, starter library, drafts with AI help, fixed marketing footer, unsubscribe page, contact rules | Done |
| Layout | Control room: dark theme, top bar, Ctrl+K search, live automations indicator, animated figures and charts | Done |
| 5 | Deals: drag and drop board, qualification, stakeholders, health score, battlecards, win and loss reasons, alert emails | Done |
| 9 | Analytics dashboards with animated charts, manager pipeline review, CSV downloads for every list and table | Done (brought forward) |
| Visuals | Command centre home page, Automations page, visual summaries on lists | Done |
| 4 | Email and calendar: connect Gmail or Outlook and Google or Outlook calendar, email sync, sending from the CRM, two way calendar, calendar page, booking meetings | Done |
| 6 | Daily task list: manual tasks, Today page, 07:00 weekday suggestions with reasons, no duplicates, daily limit, morning summary email | Done |
| 7 | News about companies: news service or feeds, daily and weekly checks, AI summary and relevance, News page, company news, news tasks | Done |
| 8 | Call transcripts: paste, upload or a secure web address for recording tools, AI reading with evidence, suggestions approved one by one, follow up tasks, recording notice checks | Done |
| 10 | Privacy centre: requests about data with one month deadlines, one file of everything held, deletion, breaches with a 72 hour clock, keeping periods with admin approval, supplier register, records, assessment, go live checklist, access log, reminders | Done |
| 11 | Ready for Hostinger: two step sign in for admins, security review, security headers, rate limits, settings check, health check, deploy and backup scripts, step by step guide, automatic tests on GitHub | Done |

## What you need on your computer

* Node.js 22.12 or newer (the program that runs the app)
* PostgreSQL 16 (the database)
* Git

## Getting started on your computer

1. Install the packages the app depends on:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values. The table under "Settings" explains each one. `.env` holds real secrets, so git ignores it and it must never be committed.

3. Create the database tables:

   ```
   npm run db:migrate
   ```

4. Load the fictional demo data:

   ```
   npm run db:seed
   ```

   If the database already has data, `npm run db:seed -- --reset` wipes it first. This only works on your own computer, never on the live site.

5. Start the web app, then open http://localhost:3000:

   ```
   npm run dev
   ```

6. In a second terminal, start the background worker:

   ```
   npm run worker
   ```

### Trying it without Google or Microsoft set up

When `DEV_LOGIN_ENABLED="true"` is set in `.env`, the sign in page lists the demo users so you can try each role with one click. This only works while developing and is always switched off on the live site.

| Demo user | Role | What they see |
| --- | --- | --- |
| Jordan Ellis, demo.admin@example.com | Admin | Everything, plus People and teams |
| Sam Whitfield, demo.manager@example.com | Manager, Funds and agents team | Their team's records and shared ones |
| Nadia Kowalski, demo.manager2@example.com | Manager, Occupiers team | Their team's records and shared ones |
| Aisha Rahman, demo.rep1@example.com | Rep | Their own records and shared ones |
| Tom Hughes, demo.rep2@example.com | Rep | Their own records and shared ones |
| Owen Price, demo.rep3@example.com | Rep | Their own records and shared ones |

All demo companies, people and deals are fictional. Company websites use the reserved `.example` ending and people use `@example.com` addresses.

## How sign in and access work

* People sign in with their Google or Microsoft work account.
* The very first person to sign in to an empty database creates the Moca organisation and becomes its Admin.
* After that, only people with an invitation can join. An Admin creates invitations under People and teams, and sends the link to the person. The link lasts 14 days, and the person must sign in with the exact email address that was invited.
* If `SEED_ADMIN_EMAIL` is set when the demo data is loaded, that address is invited as an Admin automatically.
* Roles:
  * Admin: sees everything and manages people, settings and data protection.
  * Manager: sees their own and their team's records, plus anything shared.
  * Rep: sees their own records, plus anything shared.
* Every page and every action checks the person's role before doing anything. Roles are read fresh on every request, so changes and switched off accounts take effect straight away.
* Important changes, such as invitations and role changes, are recorded in the audit log.

## Look and feel

* **Control room** (chosen by Moca on 28/09/2026): a dark canvas built from the charcoal of Moca's logo, cream text, fine grid lines between panels, and colour only where it means something: green for actions and good results, amber for attention, red for errors and lost deals.
* A slim top bar holds the main sections, a search box (Ctrl+K, or Cmd+K on a Mac) that finds deals, companies and contacts and jumps to any page, and a live indicator showing what the background automations are doing (running, waiting, failed, or worker offline).
* Motion: headline figures count up, and charts grow from the baseline into the shape of the data when a page opens. Changing a dashboard filter morphs the charts into their new shape. Anyone whose computer asks for reduced motion sees everything still.
* Moca's official logo is [public/brand/moca-logo.png](public/brand/moca-logo.png). It is shown in the text colour through a mask, so there is only one logo file to update.
* Every colour, the font, the chart palette and the logo details live in [src/design/tokens.ts](src/design/tokens.ts). Colours are named by their job (canvas, panel, fg for text, line), so the theme can change without renaming anything in the screens.
* One typeface, Outfit, chosen because its rounded geometric shapes match the logo.
* Chart colours: series use a blue, magenta, violet and orange set, checked for colour blindness, lightness and contrast on the dark panels with the dataviz palette validator. Green, amber and red are kept for health and won or lost figures. Every chart can be switched to a table.
* Screens follow the frontend design guide from the Claude Code frontend design plugin: one memorable element per page, plain wording, and no decoration that does not carry information.

## Deals

* **Board:** drag a deal between stages with the mouse, or with the keyboard (space to pick up, arrow keys to move, space to drop). Each column shows the number of deals and their total value. Filter by owner, customer group or health, or switch to the list view. Closed deals leave the board after 90 days but stay in the list and reports.
* **Closing:** dropping on Won asks for the final value and a short note on why it was won. Dropping on Lost asks for a reason from the fixed list (Budget, Timing, No decision, Lost to competitor, No economic buyer, Product fit, Other) and a short note.
* **Deal page:** the eight qualification fields (MEDDPICC) with a completeness percentage, the people involved and their roles (Champion, Economic buyer, Blocker, Influencer, User), a health breakdown, the battlecard for any competitor named, details, and a timeline of notes, calls, emails, meetings, transcripts and stage changes.
* **Health score** (0 to 100): qualification up to 35 points, engaged people up to 25, time in the current stage against the usual time up to 20, and recent activity up to 20. 65 or more is On track, 40 to 64 At risk, under 40 Stalled. A deal quiet for more than twice its stage's limit is always Stalled. Recalculated whenever the deal changes and every day at 05:30. `npm run deals:recalculate` does it straight away.
* **Single threaded:** when a deal has had only one engaged person for more than 14 days (a setting), the deal shows a warning and the owner gets one task to bring in someone else.
* **Battlecards:** one page per competitor with a comparison, objections and responses. Everyone can read them and admins edit them. A deal whose competitor field matches a battlecard shows it automatically.
* **Alerts:** every stage move and every close emails the deal's owner and followers with the deal, company, old and new stage, value, who moved it, when, and a link. Each alert is saved once (never twice for the same move), sent by the worker, retried automatically if sending fails, and shown with its status and attempts in the alert log.
* **Admin pages:** Deal stages (add, rename, reorder, recolour, set the chance of winning and the "no activity" limit), Battlecards and the Alert log are in the account menu at the top right.

## Analytics and downloads

* **Analytics** shows, for a chosen period, person and customer group: open pipeline and expected income, won value, win rate, average qualification, how many calls connect and emails get replies, calls, emails and meetings each week, health of open deals, pipeline by stage, average time in each stage, how deals move through the stages, reasons for losing, win rate and average deal size by customer group, activity by person, which templates work best, and which types of news lead to meetings. Everyone sees analytics for the records they are allowed to see.
* **Pipeline review** (managers and admins, in the account menu) lists every open deal with the weakest health first, and flags weak qualification (under 50%), single threaded deals, no recent activity and passed close dates. Filter by team or person. Built for weekly pipeline meetings.
* **CSV downloads:** every list (companies, contacts, deals, email templates, and later tasks, activities and news) and every dashboard table has a "Download CSV" link. Downloads follow the current filters and the person's access rights, stream in batches so large lists work, add a safe prefix to any cell that a spreadsheet could run as a formula, and are recorded in the audit log. Contact details of people who opted out are left out of downloads.
* `npm run db:demo-activity` adds a fictional history of calls, emails, meetings and closed deals to the demo organisation, so the charts have something to show.

## Prospecting

* **Companies and Contacts** pages list every record you may see, with search, filters (customer group, importance, owner, score, tag, list and data protection status) and sorting.
* **Bulk actions:** tick several rows to tag them, add them to a list, change the owner, group or importance, share them, or (for companies) ask the AI to write summaries or fetch public details in the background.
* **Saved views:** after filtering, click "Save these filters" to keep the view for yourself or share it with the team.
* **Lists** group companies and contacts, for example "Q4 fund managers". Create one by typing a new name in the "Add to a list" bulk action.
* **Data protection on every contact:** lawful reason, source and date collected, whether they have been told how we use their data (due within one month), business type (sole traders and some partnerships need consent), TPS and CTPS check (must be newer than 28 days before a cold call), and a one click opt out that blocks everyone from contacting them and adds them to the opt out list. Viewing a contact is recorded in the audit log.

### CSV import

Go to Import. Choose a CSV file, match its columns, say where the data came from (required), then check the file before importing. A sample file is at [public/samples/moca-import-sample.csv](public/samples/moca-import-sample.csv).

* Duplicate companies are spotted by website, then by name (ignoring endings such as Ltd). Duplicate contacts are spotted by email address, within the file and against the CRM.
* People on the opt out list are never imported, and personal email addresses (such as Gmail) are refused.
* Every imported contact gets the source, lawful reason and date collected. A report is shown at the end and can be downloaded.

### Company details and the AI summary

* **Fetch details** reads the company's public home page (following its robots.txt rules, with time and size limits, one visit per site every 10 seconds) and, when a number is given, its Companies House record. Only the page title, description and a short excerpt are kept, with any email addresses and phone numbers removed. Officers and other people are never fetched. Failures are shown on the page rather than stopping anything.
* **Write summary and score** asks the AI for "Why this company matters to Moca" (2 or 3 sentences), a score from 1 to 5 with a one line reason, a suggested customer group, key facts and what is not yet known. The AI is given only company information, never details about people, and is told never to invent facts.
* Every answer comes back in a fixed format and is checked again before saving (for example, the score must be a whole number from 1 to 5). If an answer breaks the rules, the AI is asked once more, and nothing is saved if it fails again.
* The model, date and prompt version are shown with each summary. People can edit the summary, score and reason, or regenerate them.
* Prompts are separate, versioned files in [prompts/](prompts/). The scoring guide is [prompts/scoring-guide.v1.md](prompts/scoring-guide.v1.md). To change one, add a new version and update the version number in the code, so saved results always show which version produced them.
* All AI requests go through one module, [src/lib/ai](src/lib/ai), so the provider can be changed later. Every request is recorded with its model, tokens used and estimated cost.
* The default model is Claude Opus 5 (`claude-opus-5`), set with `AI_MODEL`. If Claude declines a request, the Claude API tries a fallback model automatically (the `fallbacks: "default"` option). Anthropic does not train its models on data sent through its API by default.

## Outreach

* **Library:** the Outreach page lists email templates and call scripts by customer group and reason for getting in touch (EPC risk, net zero targets, new ESG hire, tender, acquisition, general introduction). Admins and managers create and edit them. Everyone can use them.
* **Starter library:** every organisation starts with 3 email templates and 2 call scripts for each customer group. The only figures they use are the Moca facts in the brief. `npm run outreach:starter` adds any that are missing.
* **Merge fields** such as `{{contact.firstName}}`, `{{company.name}}`, `{{company.summary}}`, `{{news.headline}}` and `{{sender.name}}` are filled in for each contact. The editor shows a live preview. A detail that is missing shows as `[[news.headline]]` with a warning, so no email goes out with a gap.
* **Getting in touch:** on a contact's page, choose an email template or call script, then "Use template as it is" or "Draft with AI". Either way you get a draft to read and edit, listed under My drafts. Nothing is ever sent automatically. Sending from the CRM comes with email accounts in Phase 4.
* **AI drafts** use the company's details, the latest news, the knowledge library and the contact's job title. The AI never sees the contact's name or contact details: it writes placeholders that the CRM fills in afterwards. Drafts are checked before use. Any figure not found in the information given is rejected, as are made up merge fields and home made unsubscribe text. A call script must have exactly three questions, two to four objections with replies, and a clear ask. Prompts: [prompts/outreach-email.v1.md](prompts/outreach-email.v1.md) and [prompts/call-script.v1.md](prompts/call-script.v1.md).
* **Rules enforced:**
  * People who opted out, or whose use is limited, cannot be emailed or called.
  * Marketing emails to sole traders and some partnerships need their recorded consent.
  * A call script cannot be marked "ready to call" until the number has a TPS and CTPS check newer than the allowed limit (28 days at most).
* **Marketing email footer:** every marketing email ends with who we are, a privacy line with a link to the privacy notice, and a personal unsubscribe link. It is added when the email is put together and is never stored in a template, so it cannot be edited out. Admins set the legal name, address and privacy notice link under Settings, Organisation.
* **Unsubscribe:** each link names one contact and carries a keyed check value, so it cannot be changed to opt out someone else. The public page opts the person out with one button press. Opening the link does not do it on its own, because email security scanners open links automatically. Email programs' own unsubscribe buttons are supported too (`/api/unsubscribe/...`). Opting out blocks everyone in the team from contacting them and adds them to the opt out list.
* The template or script used is saved on every draft, so later dashboards can show which ones work best.

## Daily task list

* **Today** (in the top bar) shows each person's tasks: overdue, today, the next 7 days, later and snoozed, with a ring showing progress for the day. Managers can look at their team's lists and admins at anyone's.
* **Adding a task:** choose a type (call, email, follow up, research, meeting, other), a priority and a due date and time. Tick the circle to complete a task, snooze it until tomorrow, in 3 days or next week (it comes back at 08:00), or remove it.
* **Suggested tasks, every weekday at 07:00 London time.** The worker builds each active person's list from these rules:
  1. An outreach step is waiting: an email draft started more than a day ago and not sent, or a call script marked ready.
  2. A follow up is due: an email sent 5 to 14 days ago with no reply (only the newest to each person, never to someone who opted out). A draft follow up message is included. Follow ups promised in calls are added as soon as a call transcript is read.
  3. A deal has had no activity for longer than its stage allows (set per stage under Deal stages).
  4. A deal has just become at risk or stalled. Single threaded deals get their own task as soon as they are spotted.
  5. A very relevant news item (4 or 5 out of 5) has appeared for a company the person owns, with a suggested opening line.  6. The highest scoring companies (4 or 5 out of 5) the person owns, with no open deal and no contact for 60 days, up to 3 a day.
* Every suggested task says why it was created, where it came from and what to do, with a draft message where useful. Each has a stable key, so running the job again never creates the same task twice. At most 25 suggestions per person per day (a setting under Organisation), most important first: high priority, then stalled or at risk deals, ready calls, news, follow ups, quiet deals, unsent drafts and new prospects. Suggestions about deals that have since closed are removed each morning.
* **Check for new suggestions** on the Today page runs the rules for you straight away. Admins can run the whole job from the Automations page, and `npm run tasks:daily` does the same from the terminal.
* **Morning summary:** anyone can switch on a 07:00 weekday email listing the day's tasks, sent through the alert email system.

## News about companies

* **Where news comes from:** an admin chooses under News settings (account menu): off, a news service (GNews, needs `NEWS_API_KEY`), or a list of RSS or Atom news feeds such as trade press. Only headlines and the short descriptions the service or feed provides are read. Articles themselves are never fetched, so paywalls and site rules are respected, and feeds whose site asks automated visitors to stay away are skipped.
* **When:** every morning at 06:30 London time, before the 07:00 task lists. Companies with importance 1 are checked every day, the rest about once a week. With the news service, each company checked uses one search; a daily limit (default 100) keeps within the service plan, with a one second gap between searches, and companies not reached go first the next day. Anyone who can edit a company can pause its news checks from the company page.
* **What is kept:** only the headline, source, link, date and a short AI summary, relevance score (1 to 5), type of news and a suggested opening line. The service's short description is used only for the AI review and then deleted (after 7 days at most, even if the AI is not set up).
* **Matching:** an item must name the company (or one of its other names) as a whole phrase; one word names must appear with their capital letter, to avoid ordinary words. The AI then checks it is really about this company, and items that are not are removed. The same story is never saved twice, by link (ignoring tracking parts) or by a near identical headline within 14 days.
* **The AI** uses only the headline, source and description, never invents figures (answers with figures not in the news are rejected), and its opening line is a draft for a person to check. Prompt: `prompts/news-review.v1.md`.
* **Where it shows:** the **News** page (top bar) lists news from every company you can see, with filters for type, relevance, status, company and period, charts by type and by week, and a CSV download. Each company page has its own news with a filter by type. Items can be marked as read, acted on, or back to new. News scoring 4 or 5 becomes a task on the owner's daily list.
* **Problems:** the last run's figures and any problems are shown on the News settings page; a failed search is recorded on the company and does not stop the run. Admins can start a check straight away from News settings or the Automations page.
* The demo data includes fictional news items from "Demo news (fictional)" on `news.example` links.

## Call transcripts

* **Adding a call:** on the **Calls** page (top bar), or with Add a call on a contact or deal. Paste the transcript, or drag and drop a text, subtitle (.vtt, .srt), Word or PDF file. Link it to a contact and deal; if only a contact is chosen, their open deal is used.
* **From a call recording tool:** an admin creates a secret key under Call recording tools (account menu). The tool sends JSON to `/api/transcripts/webhook` with the header `Authorization: Bearer <key>`. Only a scrambled copy (a hash) of the key is kept, so it cannot be read back, only replaced or removed. Participants are matched by work email to a contact (and their open deal) and to the team member who made the call. Calls that cannot be matched wait under "Not linked yet". The same call id is never saved twice.
* **What the AI records:** the outcome (interested, send information, call back later, meeting booked, not now, wrong person, not interested), a short summary, promises with dates, objections, the agreed next step, and any qualification details it can quote from the call. Email addresses and phone numbers are removed before the call is sent to the AI. Prompt: `prompts/call-transcript.v1.md`.
* **Checks:** every qualification detail and stage change must come with words quoted from the call, and those words must really be there. Figures not said in the call are refused. Only open stages can be suggested, so the AI never closes a deal. Anything left out by the checks is listed on the call page.
* **A person approves every change:** suggested qualification details (which can be edited first) and stage changes appear on the call page and on the deal page, each with Approve and Reject. Approving goes through the normal deal rules, so the stage history, alert emails and health score all update as usual. Only the deal's owner, their manager or an admin can decide.
* **Follow up tasks:** up to 5 per call, with due dates and draft messages, go on the deal owner's Today list (or the person who added the call). The call also counts as a connected call in the dashboards. Reading a call again never repeats tasks.
* **Recording notice:** each call records whether the person was told it was being recorded, and why. Calls without this are flagged on the Calls page and the call page until someone records it; the AI points out any words in the call that look like a notice.
* **Access and deletion:** a call can be seen by the person who added it (and their manager), anyone who can see its deal or contact, and admins. Every view is recorded in the audit log. A call can be deleted at any time; approved changes stay on the deal and tasks stay on the list. Transcripts are kept for 12 months by default, then listed for deletion in the privacy centre.
* If the AI is not set up, calls are saved and read automatically once it is (an hourly job picks up anything waiting).

## Privacy centre

For the data protection lead and admins, under Privacy centre in the account menu. It covers UK GDPR, the Data Protection Act 2018 and PECR. The lead is named under Keeping data, and can use the privacy centre without being an admin.

* **Requests about data:** record any request to see, correct, delete or limit the use of data, object to its use, or receive a copy. The deadline is worked out automatically: the same date the following month (or the last day of a shorter month), moved to the Monday if it falls at a weekend. Bank holidays are not counted, so check those by hand. A complex request can be extended by up to two months, with the reason recorded.
  * **See their data / a copy:** Download their data gives one JSON file with everything linked to the person: details, source, marketing checks, deals, activities, emails, meetings, tasks, transcripts and drafts, plus other places their name appears in free text. Each download is recorded.
  * **Delete:** closing the request deletes their contact record, emails, transcripts, drafts and tasks about them. Calls and meetings stay counted in the dashboards without anything that identifies them. A scrambled copy of their email and phone can stay on the do not contact list so they are never contacted again.
  * **Limit** marks them as limited, which blocks all outreach. **Object** opts them out for everyone at once.
  * Every request page lists other places the person's name appears (notes, tasks, transcripts, drafts, deal fields), since those are not linked to their record.
* **Breaches:** report straight away and a live 72 hour clock starts, for deciding whether to tell the ICO. A checklist, the risk to people, the ICO decision (with the reason if not reported), whether people were told, what was done and lessons are recorded. Every breach is kept, even if not reported.
* **Keeping data:** contacts with no activity for 24 months, transcripts after 12 months and news after 12 months (all adjustable). On the 1st of each month a list is made; nothing is deleted until an admin approves it, and anything can be ticked to keep. Contacts on open deals or with a request in progress are never listed, and each record is checked again when the list is approved. Opted out people stay on the do not contact list.
* **Suppliers:** a register of Hostinger, the AI provider, the email sending service, the news service, Google and Microsoft: what each receives, where it is stored, whether data leaves the UK (and the safeguard), whether a data processing agreement is in place, and for AI whether it trains on our data. Entries start with only what the CRM sends each one; the rest must be confirmed.
* **Records and checklist:** a record of what personal data is held, why, the lawful basis, who can see it, how long it is kept and who it is shared with, filled in from the CRM. Also the legitimate interests assessment (three tests, in your own words), the go live checklist (some items tick themselves from the settings), how data is protected, and the cookies statement (essential cookies only).
* **Access log:** who viewed contacts or transcripts, and who downloaded personal data.
* **Reminders:** at 08:00 each day, when something needs attention, the lead and admins are emailed: requests due within 7 days or overdue, breaches waiting for an ICO decision, a deletion list waiting, and the ICO fee renewal (from 30 days before) or impact assessment review falling due.

## Email and calendar

* **Connecting:** each person opens Email and calendar in the account menu and connects their own work email and calendar with Google or Microsoft. They sign in on Google's or Microsoft's own page; the CRM never sees their password. Email and calendar are connected separately, each asking only for the access it needs:
  * Gmail: read messages and send (`gmail.readonly`, `gmail.send`).
  * Google Calendar: events only (`calendar.events`).
  * Outlook: `Mail.Read`, `Mail.Send`.
  * Outlook calendar: `Calendars.ReadWrite`, plus `offline_access` so it keeps working between sign ins.
* The sign in details are stored encrypted. The handshake uses a one time proof key (PKCE) and a check value kept in an encrypted cookie. Disconnecting deletes the saved details and, for Google, asks Google to forget the access.
* **Email sync (every 10 minutes):** new sent and received emails are collected. Only emails with a CRM contact are kept, saved against the contact, their company and their most recent open deal. Only the addresses, subject and a short snippet are saved, never attachments; personal emails with nobody from the CRM are ignored. Replies are spotted, so "Emails replied to" and template reply rates work. The first sync looks back 30 days.
* **Sending:** email drafts have a Send button, which asks for confirmation and sends from the person's own account. The contact rules are checked again at the moment of sending. Marketing emails get the fixed footer and the standard one click unsubscribe headers, so email programs show their own Unsubscribe button. The first marketing email to someone records that they have been told how we use their details (when a privacy notice link is set). The template used is saved for reporting.
* **Calendar sync (every 15 minutes, both ways):** events from 30 days ago to 90 days ahead are brought in and linked to contacts among the attendees. Meetings booked in the CRM are created in the person's calendar. Events deleted in the calendar are marked cancelled.
* **Calendar page:** day, week and month views of meetings, tasks due and follow ups, in London time, with a line showing the time now.
* **Booking a meeting:** from a contact or a deal page, or the calendar. Invitations go only when the person ticks the box, and never to someone who has opted out. Without a connected calendar, meetings are kept in the CRM calendar only.
* **When things go wrong:** if access expires or is removed, the account shows "Needs reconnecting" with a Reconnect button, and syncing stops until then. Limits set by Google or Microsoft, and temporary faults, are retried automatically, waiting longer each time.

### Setting up email and calendar access with Google

Use the same Google Cloud project and OAuth client as sign in.

1. In APIs and Services, Library, enable the **Gmail API** and the **Google Calendar API**.
2. On the OAuth consent screen, set the user type to **Internal** if Moca uses Google Workspace. Otherwise Google requires a formal security review before an app can read Gmail. Add the scopes listed above.
3. In Credentials, add a second redirect address to the OAuth client: `http://localhost:3000/api/connect/callback/google`, and later the live one, for example `https://crm.moca.energy/api/connect/callback/google`.

### Setting up email and calendar access with Microsoft

Use the same app registration as sign in.

1. In API permissions, add delegated Microsoft Graph permissions: `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite` and `offline_access`. An administrator can grant consent for the whole organisation.
2. In Authentication, add the redirect address `http://localhost:3000/api/connect/callback/microsoft`, and later the live one.

## Knowledge library

The Knowledge page holds documents that explain Moca's business, so the CRM and its AI have the right context: company overviews, product notes, case studies and example transcripts.

* **Adding documents:** admins and managers drag and drop files onto the page, or paste text. Word (.docx), PDF, text, Markdown, CSV and subtitle files (.vtt, .srt) are accepted, up to 10 MB at a time. The text is read from each file and saved. The original file is not kept. Scanned PDFs without real text cannot be read.
* **Who can see it:** everyone can read the library. Admins and managers can add, edit and delete documents.
* **How the AI uses it:** documents switched on for the AI are given to it as background when it writes company summaries (prompt version 2), and in later phases outreach drafts and call scripts. Company context and product notes come first, then case studies, then transcripts, up to about 40,000 characters. The AI is told to treat them as background, not instructions.
* **Personal details:** remove personal details you do not need before uploading, especially from transcripts. Any document marked as holding personal details is kept for reference but never sent to the AI. Email addresses and phone numbers are removed from all documents before they are sent.
* Uploads, changes and deletions are recorded in the audit log.

## Settings

All settings live in `.env` on your computer, and in the server's settings on Hostinger. Placeholders are in `.env.example`.

| Setting | What it is for |
| --- | --- |
| `DATABASE_URL` | Address of the Postgres database, including its user name and password. |
| `TEST_DATABASE_URL` | A separate database used only by the automatic tests. Its name must end in `_test`. |
| `APP_URL` | The public web address of the CRM, used in links inside emails. |
| `AUTH_URL` | The same web address, used by the sign in system. |
| `AUTH_SECRET` | A long random value that protects sign in sessions. Create one with `npx auth secret`. |
| `AUTH_TRUST_HOST` | Set to `true` so sign in works behind Hostinger's web server. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign in details, from Google Cloud Console. |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Microsoft sign in details, from Microsoft Entra. |
| `DEV_LOGIN_ENABLED` | `true` shows the demo sign in buttons while developing. Ignored on the live site. |
| `DEV_TWO_STEP` | Development only. `true` makes the demo sign in ask admins for two step sign in too. |
| `FIRST_ADMIN_EMAIL` | Live site: the only address allowed to create the organisation by signing in first. |
| `ENCRYPTION_KEY` | 32 random bytes in base64. Encrypts stored email and calendar sign in details. |
| `SUPPRESSION_HMAC_KEY` | 32 random bytes in base64. Lets the opt out list be checked without storing readable addresses. |
| `ANTHROPIC_API_KEY` | Key for the Claude API, used for AI summaries and drafts. |
| `AI_MODEL` | Which Claude model to use. Leave blank for the default, `claude-opus-5`. |
| `COMPANIES_HOUSE_API_KEY` | Free key from the Companies House developer hub, used to look up company records. |
| `NEWS_API_KEY` | Key for the GNews news service (gnews.io), used when "News service" is chosen in News settings. Not needed for news feeds. |
| `SEED_ADMIN_EMAIL` | Demo data only. This address is invited as an Admin when the demo data is loaded. |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` to stop Next.js sending anonymous usage statistics. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | The mail server that sends alert emails, for example Hostinger's email service. |
| `ALERT_FROM` | The address alert emails come from, for example `Moca CRM <crm@moca.energy>`. |
| `EMAIL_TRANSPORT` | Development only. `log` writes alert emails to the worker's log instead of sending them. |

To create a random 32 byte key, run:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Setting up Google sign in

1. In Google Cloud Console, create a project, then go to APIs and Services, then Credentials.
2. Create an OAuth client ID of type "Web application".
3. Add the redirect address `http://localhost:3000/api/auth/callback/google` (and later the live one, for example `https://crm.moca.energy/api/auth/callback/google`).
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### Setting up Microsoft sign in

1. In the Microsoft Entra admin centre, go to App registrations and create a new registration.
2. Add a Web redirect address `http://localhost:3000/api/auth/callback/microsoft-entra-id` (and later the live one).
3. Under Certificates and secrets, create a client secret.
4. Copy the Application (client) ID into `AUTH_MICROSOFT_ENTRA_ID_ID` and the secret value into `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
5. To allow only Moca's own Microsoft accounts, set `AUTH_MICROSOFT_ENTRA_ID_ISSUER` to `https://login.microsoftonline.com/<your tenant ID>/v2.0`.

## How the project is organised

```
prompts/               AI prompts and the scoring guide, as separate versioned files
public/samples/        Sample CSV file for importing
prisma/
  schema.prisma        Database design, shared by the web app and the worker
  migrations/          Step by step changes to the database, applied in order
  seed.ts              Fictional demo data
src/
  app/                 Screens (Next.js pages) and server actions
  components/          Shared screen parts, such as the side menu
  design/tokens.ts     Every colour and font in one place. Edit this to change the look
  jobs/                Background job names, timings and what each job does
  lib/                 Shared code: database, access rules, formatting, encryption, audit log
  auth.ts              Sign in with Google and Microsoft
  generated/           Database code created by Prisma (not committed)
worker/
  index.ts             The background worker program
tests/                 Automatic tests
```

The web app and the worker are two programs built from the same code. They share the same database design and the same library code in `src/lib`.

The background job list uses pg-boss, which keeps its jobs in a separate `pgboss` area of the same Postgres database, so no extra database is needed. Scheduled jobs run on Europe/London time, so they follow British Summer Time.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the web app for development at http://localhost:3000 |
| `npm run worker` | Starts the background worker |
| `npm test` | Runs the automatic tests |
| `npm run typecheck` | Checks the code for type mistakes |
| `npm run db:migrate` | Applies database changes while developing |
| `npm run db:deploy` | Applies database changes on the live server |
| `npm run db:seed` | Loads the fictional demo data |
| `npm run db:studio` | Opens a simple database browser |
| `npm run build` then `npm start` | Builds and runs the web app as it runs on the live site |

## Tests

`npm test` runs every test. Tests that need a database use `TEST_DATABASE_URL` and empty it before each test, so they never touch your development data. So far the tests cover access rights, sign in and invitations, British date, time and money formats, encryption, opt out matching, the fixed lists (loss reasons, health flags, stakeholder roles), qualification completeness, CSV duplicate checks, checking AI answers against the fixed format, AI usage records, robots.txt rules, blocking internal network addresses, and removing personal details before anything is sent out.

## Putting it online

Step by step instructions for a Hostinger VPS are in [DEPLOY.md](DEPLOY.md): securing the server, the database, settings, encrypted nightly backups, HTTPS, and updating. The files it uses are in `deploy/`:

| File | What it does |
| --- | --- |
| `deploy/deploy.sh` | Gets the newest version, checks the settings, backs up, updates the database, builds and restarts. |
| `deploy/ecosystem.config.cjs` | Keeps the web app and the worker running (PM2). |
| `deploy/nginx.conf`, `deploy/moca-proxy.conf` | The web server in front of the app, with rate limits. |
| `deploy/backup.sh`, `deploy/restore.sh` | Encrypted database backups, and restoring one. |

Useful server commands: `npm run check:env` checks the settings; `npm run twostep:reset -- email` resets someone's two step sign in; `/api/health` shows whether the database and worker are running.

Every push to GitHub runs the tests and a production build automatically (`.github/workflows/ci.yml`), using GitHub's free allowance.

## Security

* **Two step sign in** with an authenticator app is required for admins and the data protection lead, because they can see everyone's personal data. It is set up at their first sign in, with 10 one time recovery codes. Codes cannot be reused, and five wrong codes lock it for 15 minutes. Which sign ins have passed is recorded on the server, so it cannot be faked in the browser. Admins can reset it for someone under People and teams.
* **First admin:** on the live site, only the address in `FIRST_ADMIN_EMAIL` can create the organisation; everyone else needs an invitation.
* **Headers:** a Content Security Policy with a fresh nonce on every page, so only the CRM's own scripts run; the CRM cannot be shown inside another site; HTTPS is enforced on the live site.
* **Rate limits** on sign in, two step sign in, the call recording address and unsubscribe links, in Nginx and in the app.
* **Checked in this review:** every server action and API address checks who is signed in (or is deliberately public, with its own protection); tests never contact outside services; secrets are never committed.
* **Package audit:** Nodemailer was upgraded to fix its advisories. The remaining reported issues are in the Prisma command line tool's optional MySQL and settings parts, which only run when deploying and are not used with Postgres. The only suggested fix is an older Prisma version, which was not taken. Check again with `npm audit` when Prisma releases an update.
