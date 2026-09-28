# Moca CRM

A sales CRM for Moca: a system for managing prospects, customers, deals and follow ups. It is used by several people in the team and will be put online on a Hostinger VPS (a virtual private server, meaning a rented server of our own).

The full project brief is in [CLAUDE.md](CLAUDE.md).

## What is built so far

| Phase | What it covers | Status |
| --- | --- | --- |
| 1 | Foundation: database design, sign in, roles, invitations, design settings, background worker, demo data | Done |
| 2 | Prospecting: companies and contacts, search, filters, bulk actions, saved views, lists, tags, CSV import, company details lookup, AI summary and score | Done |
| 3 to 11 | Outreach, email and calendar, deals, tasks, news, transcripts, dashboards, privacy, going live | To do |

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
| `ENCRYPTION_KEY` | 32 random bytes in base64. Encrypts stored email and calendar sign in details. |
| `SUPPRESSION_HMAC_KEY` | 32 random bytes in base64. Lets the opt out list be checked without storing readable addresses. |
| `ANTHROPIC_API_KEY` | Key for the Claude API, used for AI summaries and drafts. |
| `AI_MODEL` | Which Claude model to use. Leave blank for the default, `claude-opus-5`. |
| `COMPANIES_HOUSE_API_KEY` | Free key from the Companies House developer hub, used to look up company records. |
| `SEED_ADMIN_EMAIL` | Demo data only. This address is invited as an Admin when the demo data is loaded. |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` to stop Next.js sending anonymous usage statistics. |

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

Step by step Hostinger VPS instructions will be added in Phase 11.
