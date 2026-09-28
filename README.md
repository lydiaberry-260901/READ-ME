# Moca CRM

A sales CRM for Moca: a system for managing prospects, customers, deals and follow ups. It is used by several people in the team and will be put online on a Hostinger VPS (a virtual private server, meaning a rented server of our own).

The full project brief is in [CLAUDE.md](CLAUDE.md).

## What is built so far

| Phase | What it covers | Status |
| --- | --- | --- |
| 1 | Foundation: database design, sign in, roles, invitations, design settings, background worker, demo data | Done |
| 2 to 11 | Prospecting, outreach, email and calendar, deals, tasks, news, transcripts, dashboards, privacy, going live | To do |

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

`npm test` runs every test. Tests that need a database use `TEST_DATABASE_URL` and empty it before each test, so they never touch your development data. So far the tests cover access rights, sign in and invitations, British date, time and money formats, encryption, opt out matching, the fixed lists (loss reasons, health flags, stakeholder roles) and qualification completeness.

## Putting it online

Step by step Hostinger VPS instructions will be added in Phase 11.
