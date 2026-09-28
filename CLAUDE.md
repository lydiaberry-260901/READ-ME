# Moca CRM: project instructions

This file is read automatically by Claude Code at the start of every session in this folder. Follow it for all work here, alongside whatever is asked in the chat panel.

## What this project is

A sales CRM, a system for managing prospects, customers, deals and follow ups, built for the company Moca. It will be used by several people in the team, kept in a GitHub repository from the start, and put online using Hostinger once it is ready.

## Writing style rules for everything you produce

* Use British English everywhere: in the app screens, emails, templates, documents and code comments. For example: organisation, prioritise, colour, licence, programme, analyse.
* Dates as day/month/year. Times in the 24 hour clock. Money in pounds (£). The time zone is Europe/London.
* Use plain, jargon free wording in every screen, button, message and document. If a technical word cannot be avoided, explain it in a few simple words.
* Do not use em dashes or hyphens as punctuation in any text the app shows or any document you write. Use full stops, commas or the word "to" instead. Write "follow up", "opt out", "sign in" and "drag and drop" without hyphens. This rule does not apply to technical names that need a hyphen or underscore by convention, such as an environment variable or a package name.

## About the company

Moca (moca.energy) sells energy software to UK commercial property. It helps property managers, asset managers, ESG managers and tenants turn energy into income, cashflow and asset value. It uses live energy data to give clear investment priorities, costed action plans, automated tenant billing and measurable results. It is powered by Octopus, manages more than 5.7 million square feet of buildings, and saved Octopus Real Estate about £500,000 compared with using a consultant. Key themes: EPC and MEES rules (energy ratings for buildings), CRREM pathways (targets for cutting carbon), net zero commitments, ESOS and SECR reporting (energy and carbon reporting rules), limits on power supply from the grid, recharging tenants for energy, and protecting building values.

Three groups of customers:

1. Asset and ESG managers (funds and investors): protect value and income, manage EPC and CRREM risk, decide where to invest first.
2. Property managers (managing agents): win tenders, add new services and income, automate tenant billing, reduce admin, protect margins.
3. Occupiers (tenants with several sites): see energy across all sites, build credible carbon and ESOS plans, cut costs, gain influence with landlords.

## What the CRM must do

1. Prospecting: a database of companies and contacts, lists and groups, tagging by customer group, CSV import that spots duplicates, and optional extra company details from Companies House and the company website.
2. Company information: for each company, an AI written "Why this company matters to Moca" summary (2 to 3 sentences) and a score from 1 to 5 with a one line reason. Use a fixed scoring guide based on the Moca information above. Save the summary, score, reason, the AI model used and the date. People can edit or regenerate it.
3. Outreach: email templates and cold call scripts organised by customer group and by reason for contact (for example: EPC risk, net zero targets, new ESG hire, tender, acquisition, general introduction). Templates can include the contact name, company name, company summary and latest news item. The AI can draft a personalised email or call script, but a person must always review it. Nothing is ever sent automatically.
4. Email: each person connects their own Gmail (Google Workspace) or Outlook (Microsoft 365) through a secure sign in. Sent and received emails are saved against the right contact and deal. People can send email from inside the CRM. Sign in details are stored encrypted.
5. Calendar: each person connects their own calendar. The CRM shows a calendar with meetings, tasks and follow ups, and can create a meeting from a deal or contact.
6. Deal pipeline: a drag and drop board with stages the admin can change. Default stages: Prospect, Contacted, Conversation, Demo, Proposal, Negotiation, Won, Lost. Each deal has a value, owner, expected close date, customer group and next step.
7. Deal qualification: every deal holds a set of qualification fields, known together in sales by the term MEDDPICC: Metric (the measurable outcome the buyer wants), Economic Buyer (who signs off the spend), Decision Criteria, Decision Process, Paper Process (procurement, legal or security steps), Identified Pain, Champion, and Competition. These are filled in gradually as a rep learns them, never all at once. Show a qualification completeness percentage on every deal, worked out from how many of these fields are filled in.
8. Stakeholder mapping: for every deal, list the contacts involved and let a person tag each one with a role: Champion, Economic Buyer, Blocker, Influencer or User. If a deal has had only one engaged contact for more than a set number of days (a setting, default 14), raise a clear warning on the deal and create a task suggesting the rep bring in another contact.
9. Deal health score: work out a score for every deal from its qualification completeness, how many stakeholders are engaged, how long it has sat in its current stage compared with the average time for that stage, and how recent its last activity was. Show this as a simple flag on every deal card and in the deal list: On track, At risk, or Stalled. Recalculate it at least once a day and whenever the deal changes.
10. Competitor tracking and battlecards: a field on every deal for any competitor mentioned by the prospect. A separate battlecard library, one page per competitor, holding a short comparison, common objections and a suggested response to each, editable by admins. When a deal names a competitor, show the matching battlecard on the deal page automatically.
11. Deal alerts and win or loss reasons: every time a deal moves stage, or is closed as won or lost, send an email to the deal owner's work email (and anyone else set to follow that deal). The email says which deal, which company, the old stage, the new stage, the value, who moved it, when, and gives a link. If sending fails, try again automatically, and keep a log. Closing a deal as Lost needs a reason chosen from a fixed list (Budget, Timing, No decision, Lost to competitor, No economic buyer, Product fit, Other) and a short note. Closing a deal as Won asks for the final value and a short note on why it was won.
12. Daily tasks: every weekday at 07:00 (Europe/London) create a task list for each person. Include: outreach steps due, overdue follow ups, new news worth acting on, deals with no activity for a set number of days, deals newly flagged as single threaded, at risk or stalled, and the highest scoring companies not yet contacted. Each task says why it was created, has a priority and due date, and suggests what to do, with a draft message if useful. Never create the same task twice.
13. News: for every company, look for recent news (daily for the most important companies, weekly for the rest) using news services or news feeds. Do not copy full articles or get around paywalls or website rules. Save only the headline, source, link, date and a short AI summary. Label the type of news (fund raise, buying or selling property, new ESG or energy hire, building work, EPC or CRREM news, tender or appointment, new rules). Show news on each company page and create tasks from the most relevant items.
14. Call transcripts: allow a transcript to be pasted, uploaded, or sent in automatically from a call recording tool through a secure web address the tool can send data to. Link it to a contact and deal. The AI reads it and records: the outcome (interested, send information, call back later, meeting booked, not now, wrong person, not interested), anything promised and dates, objections, a short summary, and any of the qualification fields it can pick out, such as a mentioned metric or budget, a named economic buyer, the decision process, a competitor mentioned, or the pain described. It then creates follow up tasks with due dates and draft messages, and suggests both a deal stage change and updates to the qualification fields, all for a person to approve one by one. It never changes a deal by itself.
15. Performance dashboards: charts and tables with filters for dates, people and customer group. Show calls, emails and meetings per person, how many calls connect and emails get replies, how deals move through stages, how long deals stay in each stage, pipeline value and expected income, win rate by customer group, reasons for losing, average qualification completeness, how many deals are on track, at risk or stalled, which templates work best, and which types of news lead to meetings.
16. Manager pipeline review view: a screen for managers and admins listing every open deal, sorted by health score, with weak qualification, a single threaded warning, or no recent activity shown clearly, and filterable by team or person. Built for weekly pipeline review meetings, separate from the drag and drop board.
17. CSV export: every list and every dashboard table can be downloaded as a CSV file, following each person's access rights.
18. Many users: sign in with Google or Microsoft. Roles: Admin, Manager and Rep. Reps see their own records and shared ones, managers see their team, admins see everything. Keep a log of important changes.
19. Knowledge library (added on request): a page where admins and managers drag and drop company context, product notes, case studies and transcripts. The text is extracted and used as background context by every AI feature. Documents marked as holding personal details are never sent to the AI.

## Data protection rules (UK GDPR, Data Protection Act 2018 and PECR)

This CRM holds personal data about business contacts, so data protection must be built in from the start, not added at the end. PECR means the rules on marketing emails and calls. Build these features:

1. Lawful reason: use "legitimate interests" as the reason for business to business prospecting. Provide a written assessment template in the app (why we need the data, why it is necessary, and how we have balanced this against people's rights). Record the lawful reason on every contact.
2. Only what is needed: collect only business details (name, job title, work email, work phone, company, public professional profile link). Do not collect sensitive information such as health, politics, religion, or anything about family. Show a clear warning on notes fields not to record personal opinions or sensitive details.
3. Where the data came from: record the source and date for every contact. If we get someone's details from a source other than them, they must be told who we are, why we hold their details, where we got them, and how to object, at the first contact and no later than one month. Include a short privacy notice line and a link to the full privacy notice in every first email.
4. Opt out: every marketing email has a working unsubscribe link. When someone opts out or asks us to stop, block all contact straight away, for every user. Keep a minimal suppression list (just enough to make sure we never contact them again) that survives deletion of the rest of their record.
5. Marketing rules: record whether a contact works for a limited company or public body (business email is generally allowed with clear identification and an opt out) or is a sole trader or some types of partnership (treated as individuals, so consent is needed). Block outreach where the rules are not met. Before any cold call, the number must have been checked against the TPS and CTPS lists (the official do not call registers), with the check date saved. Ask for a fresh check if it is older than 28 days.
6. People's rights: provide simple tools to handle a request from a person to see their data, correct it, delete it, limit its use, object to it, or receive a copy in a usable format. Give each request a due date of one month, show it on a tracker, and send reminders. The "see my data" tool produces one file with everything held about that person.
7. Keeping data for a limited time: settings for how long to keep data, with sensible starting points: contacts with no activity for 24 months, transcripts for 12 months, news items for 12 months. A monthly job lists what is due for deletion or anonymising, and an admin approves it before it happens.
8. Security: encrypt sensitive data, require two step sign in for admins, give people only the access they need, record who viewed or exported personal data, and keep backups protected.
9. Data breaches: an admin page to record any incident, with a checklist and a clock showing the 72 hours to decide whether the Information Commissioner's Office (ICO) must be told.
10. Suppliers and data leaving the UK: keep a register of every supplier that handles data (Hostinger, the AI provider, the email sending service, the news service, Google, Microsoft), what data each receives, where it is stored, and whether a data processing agreement is in place. Prefer UK or EU locations where offered. Send suppliers only what they need. For AI services, remove personal details where possible, and only use services and settings that do not let the provider train its models on our data.
11. No decisions made only by a machine: AI scores relate to companies, not people. Nothing that significantly affects a person is decided automatically. A person reviews AI drafts, and a person approves every suggested change.
12. Call recording and transcripts: transcripts contain personal data, so the same rules on access, deletion and keeping time apply. Record whether the person was told the call was being recorded and why. Warn if this is missing. Allow a transcript to be deleted at any time.
13. Records and accountability: an automatically filled page listing what personal data we hold, why, who can see it, how long we keep it, and who we share it with. Include a checklist to complete before going live, and reminders to pay the ICO data protection fee and complete a data protection impact assessment (a short risk review).
14. Cookies: the CRM uses only essential cookies. If analytics tools are added later, they must ask for permission first.
15. Draft the plain English data protection documents listed near the end of this brief, for a solicitor to review later.

## Look and feel

* Style: clean, calm and professional, with lots of white space. It should feel like an energy and property business: modern, trustworthy and warm, not a cold grey business tool.
* Suggested colours, all kept in one settings file so they are easy to change:
  * Deep mocha brown #3B2A20 for headings, the side menu and main text.
  * Warm cream #F7F1EA for page backgrounds.
  * Energy green #2E7D5B for main buttons, links and positive results (won deals, on track).
  * Sunrise amber #E8A33D for highlights, warnings and things needing attention.
  * Soft stone #D9CFC4 for borders and dividers.
  * Clear red #B3392F only for errors and lost deals.
* Text and buttons must have strong enough contrast to be easy to read (meeting WCAG AA). Do not rely on colour alone to show meaning.
* Use one clean, readable font. Charts use the same palette. Works well on a laptop, and is usable on a phone.
* If Moca's official colour codes are given later, use those in place of the suggestions.
* Update chosen by Moca on 28/09/2026: the app uses a dark "control room" layout (a top bar, Ctrl+K search, a live automations indicator) built from the charcoal of Moca's official logo (public/brand/moca-logo.png), with cream text and green, amber and red kept for their meanings. Charts and headline figures animate into shape when a page opens and morph when filters change, respecting reduced motion. Screens follow the frontend design guide from the Claude Code frontend design plugin.

## Technical choices

* A web app written in TypeScript using Next.js, with a Postgres database (managed with Prisma).
* Sign in using Auth.js with Google and Microsoft.
* A separate worker program that runs in the background for scheduled jobs (news at 06:30, daily tasks at 07:00, email and calendar updates every 10 to 15 minutes) and for retrying failed jobs. Use a job list that runs on the same Postgres database, so no extra database is needed.
* Tailwind CSS for styling, dnd kit for drag and drop, Recharts for charts.
* AI is accessed through one single module, so the AI provider can be changed later. Default to the Claude API. Ask the AI for answers in a fixed format and check them before use. Store prompts in separate, versioned files. Keep a record of usage and cost.
* Both the web app and the worker are deployed on Hostinger from the same GitHub repository, with a Hostinger Postgres database.
* Keep the project in this folder's git repository. Commit and push to origin after each phase, once it is working, as set out in the working rules below.
* Use the frontend design skill (from the frontend design plugin, already installed in this project) whenever designing or building any screen in the CRM. It leads to deliberate, project specific choices about colour, type and layout instead of a generic template, and it should still follow the look and feel set out above rather than replace it.
* Add a simple gitignore suited to a Node and Next.js project, so files such as node_modules and local environment values are never committed.
* Never commit real secrets or API keys. Use a local environment file for real values during development, kept out of git by the gitignore, and use placeholder examples in anything committed.

## Quality

* Write automatic tests for: deal move emails, avoiding duplicate tasks, access rights, CSV export, opt out blocking, data deletion, the health score calculation, single threaded detection, and the fixed win and loss reason lists.
* Include sample demo data (clearly fictional), and a README explaining how to run the project, how it is organised, and how to put it online.

## Data protection documents to draft later

Once the CRM itself is working, draft each of these in plain English, for a solicitor or data protection adviser to review before use:

* A privacy notice for business contacts.
* A legitimate interests assessment for sales prospecting.
* A retention schedule.
* A procedure for handling requests from people about their data.
* A data breach procedure.
* A data protection impact assessment, including for call transcripts and AI use.
* A supplier checklist and data processing agreements for Hostinger, the AI provider, the email service, the news service, Google and Microsoft.
* A call recording notice and script for the start of recorded calls.
* Staff guidance on what to record in notes, and how to respect opt outs and the do not call registers.

## Working rules

* Work in phases, in the order given in this chat message, one at a time.
* After finishing and testing each phase, explain what was built and how to try it, commit the changes with a clear message, and push them to origin, then move on to the next phase automatically.
* Stop and ask first only when a decision would be hard to undo, or the brief is genuinely unclear.
* Never invent facts about a company or person. If information is missing, leave it blank and say so.
* AI written outreach is always a draft for a person to review.
* Run commands directly in the integrated terminal where possible, such as installing packages, running database migrations and starting the development server, rather than only describing them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
