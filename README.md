# AMR Club BUK E-Voting Platform

A secure, transparent online election platform for the **Antimicrobial Resistance (AMR) Club, Bayero University Kano**, administered by the AMR Independent Electoral Committee (**AMR IEC**).

Re-architected and branded for the multidisciplinary membership of AMR Club BUK by **Ahmad Aroyehun** ([ahmadaroyehun.netlify.app](https://ahmadaroyehun.netlify.app)), Adapted from the base platform designed by **Anas Yakubu** ([anasyakubu.netlify.app](https://anasyakubu.netlify.app)).

The system lets accredited AMR Club members verify their eligibility with their official email address, set up their voter account, and cast a secret ballot once per election, while guaranteeing absolute **ballot privacy**: votes are recorded in separate collections from voter identities, making it architecturally impossible for anyone — including administrators — to trace a ballot back to an individual.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [MongoDB setup (replica set)](#mongodb-setup-replica-set)
- [Amazon S3 setup (optional)](#amazon-s3-setup-optional)
- [Environment variables](#environment-variables)
- [Seeding](#seeding)
- [Importing the student register](#importing-the-student-register)
- [Running in development](#running-in-development)
- [Building for production](#building-for-production)
- [Deployment notes](#deployment-notes)
- [Security architecture](#security-architecture)
- [API reference](#api-reference)
- [User roles](#user-roles)

---

## Features

**For voters**
- Register by verifying an accredited email address from the AMR Club roster.
- Browse elections, official positions, and candidate profiles with manifestos.
- Cast a private ballot with a clear review-and-confirm step.
- Receive a unique cryptographic receipt code (and QR code) proving the vote was counted, without revealing the choices.
- View live or final results when the committee publishes them.

**For the electoral committee**
- Institutional admin portal with role-aware navigation and AMR palette styling.
- Full election lifecycle: draft → scheduled → active → paused → closed → archived.
- Manage positions (with the 12 official AMR executive slate available as a one-click seed) and candidates (with photo upload and approval workflow).
- Import the accredited voter roster from CSV with preview, column mapping, and per-row error reporting.
- Manage voter eligibility and administrators (Super Admin only).
- Admin results preview, one-click publishing, and CSV export.
- Complete audit log of administrative actions with salted IP hashing.

---

## Tech stack

**Frontend** — React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod, Recharts, Lucide icons.

**Backend** — Node.js + Express + TypeScript, MongoDB + Mongoose, JWT auth in http-only cookies, bcrypt, AWS SDK v3 (S3) with local-disk fallback, Zod validation, Helmet, CORS, express-rate-limit, cookie-parser, QR code generation.

No gradients, no emojis: the interface uses a deep-green / white / charcoal palette with subtle gold accents for an institutional, trustworthy feel.

---

## Repository layout

```
nacos-buk-evoting/
├── package.json            # root convenience scripts (run both apps)
├── README.md
├── server/                 # Express + TypeScript API
│   ├── src/
│   │   ├── config/         # env, db connection, constants
│   │   ├── models/         # Mongoose models (see Security architecture)
│   │   ├── services/       # student, election, vote, results, s3, audit
│   │   ├── controllers/    # request handlers
│   │   ├── routes/         # route definitions
│   │   ├── middleware/     # auth, rbac, validation, rate limiting, uploads
│   │   ├── validators/     # Zod schemas
│   │   ├── jobs/           # scheduled election-status sweeper
│   │   ├── scripts/        # seedAdmin, seedDemo
│   │   ├── app.ts          # express app
│   │   └── server.ts       # bootstrap
│   ├── data/               # sample student CSV
│   └── .env.example
└── client/                 # React + Vite frontend
    ├── src/
    │   ├── pages/          # public, auth, vote, admin pages
    │   ├── components/     # UI + feature components
    │   ├── layouts/        # public + admin shells
    │   ├── services/       # typed API client (queries.ts)
    │   ├── store/          # Auth + Toast context
    │   ├── lib/            # api wrapper, utilities
    │   └── types/          # shared TypeScript types
    └── .env.example
```

---

## Prerequisites

- **Node.js 18+** and npm
- **MongoDB 5+** running as a replica set (see below) — local or MongoDB Atlas
- *(Optional)* an **AWS S3** bucket for candidate images (the app falls back to local disk if not configured)

---

## Quick start

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Configure the backend
cp server/.env.example server/.env
#    then edit server/.env — set MONGODB_URI and JWT_SECRET at minimum

# 3. Configure the frontend (defaults are fine for local dev)
cp client/.env.example client/.env

# 4. Create the initial super admin
npm run seed:admin

# 5. (Optional) load a demo election with sample candidates
npm run seed:demo

# 6. Run the apps (two terminals)
npm run dev:server     # http://localhost:5000
npm run dev:client     # http://localhost:5173
```

Then open **http://localhost:5173**. The admin portal is at **/admin/login**.

Default super admin (from `.env`, change in production):

```
username: amradmin
password: amrelection2026
```

---

## MongoDB setup (replica set)

Recording a vote uses a **MongoDB transaction** so that the voter's receipt and the anonymous ballot are written atomically. Transactions require a replica set. You have two easy options.

**Option A — MongoDB Atlas (recommended).** Atlas clusters are replica sets out of the box. Create a free cluster, add your IP to the network access list, create a database user, and copy the connection string into `MONGODB_URI`.

**Option B — Local single-node replica set.**

```bash
# start mongod as a one-node replica set
mongod --replSet rs0 --dbpath /path/to/data

# in another shell, initialise it once
mongosh --eval "rs.initiate()"
```

Then use:

```
MONGODB_URI=mongodb://127.0.0.1:27017/nacos_buk_evoting?replicaSet=rs0
```

> The vote service detects whether transactions are available and, if a standalone server is used, falls back to a receipt-first write with an idempotency guard. Running a replica set is strongly recommended for the strongest one-vote guarantee.

---

## Amazon S3 setup (optional)

Candidate photos can be stored in S3. If you leave the S3 variables blank (or set `S3_ENABLED=false`), images are stored on local disk under `server/uploads` and served from `/uploads`, so the app runs with zero AWS setup.

To enable S3, set `S3_ENABLED=true` and fill in `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET_NAME`.

**Minimal IAM policy** for the uploader user:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

**Bucket CORS** (so images load in the browser):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedOrigins": ["https://your-frontend-domain.com"],
    "ExposeHeaders": []
  }
]
```

---

## Environment variables

### Server (`server/.env`)

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `5000`). |
| `NODE_ENV` | `development` or `production`. |
| `MONGODB_URI` | MongoDB connection string (replica set required for transactions). |
| `JWT_SECRET` | Long random string used to sign auth tokens **and** to salt hashed IPs. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d`. |
| `COOKIE_MAX_AGE_DAYS` | Auth cookie lifetime in days. |
| `CLIENT_URL` | Frontend origin, for CORS (e.g. `http://localhost:5173`). |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | S3 configuration (optional). |
| `S3_ENABLED` | `true` to use S3, otherwise local-disk storage. |
| `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD` | Credentials created by `seed:admin`. |
| `RATE_LIMIT_*` | Rate-limit window and per-window caps for general, auth, and vote routes. |

### Client (`client/.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | API base path. Defaults to `/api`; the Vite dev server proxies `/api` and `/uploads` to `localhost:5000`. For a separately-hosted API, set the full URL. |

---

## Seeding

```bash
npm run seed:admin   # upserts the super admin from SUPER_ADMIN_USERNAME/PASSWORD
npm run seed:demo    # imports the sample CSV and creates a live demo election,
                     # the default positions, and a few approved candidates
```

`seed:admin` is idempotent and safe to re-run. Run it once before first sign-in.

---

## Importing the student register

Only students present in the imported register may create accounts and vote.

1. Sign in as a Super Admin and open **Student import**.
2. Select a CSV file. The importer previews the detected headers, the column mapping, and a few sample rows.
3. Confirm to import. The importer inserts new students, updates existing ones, skips duplicates, and reports every invalid row with a reason.

**Expected columns** (header names are matched flexibly):

```
Full Name, Registration Number, Email Address, Department, Level
```

Registration numbers follow the faculty format, e.g. `CST/22/IFT/00785`, where the third segment is the department code (IFT, COM, CBS, SWE, …). A sample file is provided at `server/data/students-sample.csv`.

---

## Running in development

```bash
npm run dev:server   # nodemon/tsx watch — API at http://localhost:5000
npm run dev:client   # Vite dev server at http://localhost:5173
```

The frontend proxies API and upload requests to the backend, so you only browse `http://localhost:5173`.

---

## Building for production

```bash
npm run build        # builds server (tsc → dist) and client (Vite → dist)

# serve the API
npm run start        # node server/dist/server.js
```

The client build outputs static files to `client/dist`, which you can serve from any static host or CDN. Point `VITE_API_URL` at your deployed API before building the client.

---

## Deployment notes

- Set `NODE_ENV=production`. Auth cookies are issued `Secure` + `SameSite` in production, so the API must be served over HTTPS.
- Set `CLIENT_URL` to your real frontend origin so CORS allows credentialed requests.
- Use a managed replica set (Atlas) or a properly configured self-hosted replica set.
- Provide a strong, unique `JWT_SECRET`. Rotating it invalidates existing sessions and changes IP hashes.
- If the API and frontend are on different domains, ensure cookies are allowed cross-site (HTTPS + appropriate `SameSite`), or host them under the same domain.
- Run `seed:admin` once in the production environment, then change the default password.

---

## Security architecture

Security is the core design goal. The key measures:

**Ballot privacy (vote/voter separation).** When a student votes, the system writes two unlinked records inside one transaction:
- a **VoteReceipt** — keyed by `(electionId, studentId)` with a unique index. It records *that* the student voted (and stores their receipt code), but contains **no candidate selections**.
- one or more **Ballot** documents — each records only `(electionId, positionId, candidateId)`. Ballots contain **no reference to the voter**.

Because the two are never joined, turnout can be verified and results tallied accurately, while it is impossible to reconstruct how any individual voted.

**One vote per student.** Enforced structurally by the unique index on `VoteReceipt (electionId, studentId)`, not merely by application logic. The write runs in a transaction, and an idempotency key on the receipt makes retries safe, so double submission cannot create a second ballot.

**Eligibility.** Registration and voting are limited to students whose registration number exists in the imported faculty register. Registration numbers are validated against the expected format and against imported records; students from other faculties are rejected, and duplicate accounts (by registration number or email) are prevented.

**Authentication & RBAC.** Admins and students authenticate separately; JWTs are stored in **http-only cookies** (not readable by JavaScript). Passwords are hashed with bcrypt. Routes are protected by role-based middleware — Super Admin, Election Admin, and Student scopes are distinct.

**Server-side time & election locking.** Whether voting is open, and whether results are visible, is computed on the server from the election's schedule and status — never trusted from the client. A background job sweeps elections from scheduled → active → closed at the correct times, and closed elections reject further votes.

**Privacy-preserving request logging.** IP addresses associated with sensitive actions are stored **hashed** (SHA-256 salted with the server secret), never in plaintext, so logs support abuse investigation without exposing raw addresses.

**Hardening.** Helmet security headers, configurable CORS restricted to the client origin, input validation with Zod on every write, and rate limiting tuned separately for general, authentication, and vote-casting endpoints.

**Auditability.** Administrative actions (election lifecycle changes, candidate approvals, imports, admin management, and more) are recorded in an append-only audit log with actor, action, resource, and timestamp.

---

## API reference

All routes are prefixed with `/api`. Protected routes require the appropriate cookie session.

**Auth**
```
POST   /auth/admin/login
POST   /auth/admin/logout
GET    /auth/admin/me
POST   /auth/student/verify        # check registration-number eligibility
POST   /auth/student/register
POST   /auth/student/login
POST   /auth/student/logout
GET    /auth/student/me
```

**Public elections & voting**
```
GET    /elections                  # list (supports status, search, pagination)
GET    /elections/:slug            # election + positions + approved candidates
GET    /elections/:slug/results    # public results (if visible)
GET    /elections/:slug/ballot         # student — ballot to fill
POST   /elections/:slug/vote           # student — cast vote (idempotent)
GET    /elections/:slug/vote-status    # student — has-voted check
GET    /elections/:slug/receipt        # student — receipt + QR
```

**Election management (admin)**
```
POST   /elections
PATCH  /elections/:id
DELETE /elections/:id                       # super admin
POST   /elections/:id/publish | pause | resume | close | archive | publish-results
POST   /elections/:id/reset                 # super admin
GET    /elections/:electionId/positions
POST   /elections/:electionId/positions
POST   /elections/:electionId/positions/seed
GET    /elections/:electionId/candidates
POST   /elections/:electionId/candidates
PATCH  /positions/:id
DELETE /positions/:id
PATCH  /candidates/:id
DELETE /candidates/:id
POST   /candidates/:id/approve | reject
POST   /candidates/:id/upload-image
```

**Admin reads, results & administration**
```
GET    /admin/elections                     # admin list
GET    /admin/elections/:id                 # single election detail
GET    /admin/elections/:id/results         # admin results preview
GET    /admin/elections/:id/export-results  # CSV export
GET    /admin/dashboard/stats
GET    /admin/audit-logs
GET    /admin/students                       # register (search, dept, pagination)
GET    /admin/students/stats
PATCH  /admin/students/:id/eligibility
GET    /admin/students/import-history
POST   /admin/students/import/preview        # super admin
POST   /admin/students/import                # super admin
GET    /admin/admins                         # super admin
POST   /admin/admins                         # super admin
PATCH  /admin/admins/:id                     # super admin
DELETE /admin/admins/:id                     # super admin
```

---

## User roles

- **Super Admin** — full control, including managing administrators and importing the voter roster. The initial account is created by `seed:admin`.
- **Election Admin** — manages elections, positions, candidates, and results; cannot manage administrators or import voters.
- **AMR Voter** — registers with an accredited email address and votes once per election.

---

*Administered by AMR IEC — free, fair, and credible elections for the Antimicrobial Resistance (AMR) Club, Bayero University Kano. Adapted from the NACOS BUK platform by Anas Yakubu.*
