# Campus Pulse

Campus Pulse measures which poster boards actually get student clubs noticed. Every flyer carries its own QR code; when a student scans it, the scan is logged and the student is sent straight to the event's page. Club officers see the results on a map of campus and decide where to post next time.

Live at [campus-pulse.com](https://campus-pulse.com), set up for the University of Minnesota – Twin Cities with 41 real poster boards.

## Why

Student clubs promote nearly every event with paper flyers, but they have no idea which of the dozens of boards on campus are worth the trip. Clubs usually put up one round of posters per event, so there's one chance to get it right. Campus Pulse turns each flyer into a measurable placement: scans per board, per day, and per hour. It also recommends boards that have worked for similar clubs.

## How it works

1. **An officer posts an event.** They give the event's link (a sign-up form, Instagram post, etc.) and pick the boards they're posting on. Each board gets its own QR code, printed as a 2-inch label to stick on the flyer.
2. **A student scans a flyer.** `/r/<code>/` records the scan and redirects in one fast request: no login, no page in between. Repeat scans by the same person within 10 minutes count once, and bots and link previews are excluded.
3. **The club sees what worked.** A campus map shows every board's scans. Event dashboards break them down by board, day, hour, and device. After the event ends, a recap ranks each board by scans per day and suggests where to post next time.

## Features

- **Per-board QR codes:** PNG and SVG downloads, and a print sheet of 2-inch labels for every board at once.
- **Campus map:** board markers labeled with scan counts, a heatmap, filters by event, date range, and area, and a "Near me" board picker for officers standing at a board.
- **Event dashboards:** scans over time, by board, by hour of day, and by device, plus CSV export.
- **Shared club accounts:** officers join a club by request and are approved by an existing officer. One person can be an officer of several clubs and switch between them.
- **Board recommendations:** boards are ranked by how well they did for clubs with similar members (shared majors or college) and similar events, weighted toward the club's own history. Officers only ever see a tier ("Strong pick") and a short reason, never another club's data.
- **Notifications:** first scan of each event, a nudge when a poster has had no scans for 5 days, a recap when an event ends, and join requests. All on-site; nothing is emailed.
- **Privacy:** raw IP addresses are never stored. Unique visitors are counted with a hash of IP, browser, and date that changes every day, so a student can't be followed across days.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.12, Django 5.2, Django REST Framework, PostgreSQL |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, TanStack Query and Table, React Hook Form with Zod |
| Maps and charts | Leaflet with MapLibre GL (vector maps from Amazon Location Service), Recharts |
| Infrastructure | AWS: Lightsail (nginx, gunicorn), Route 53, SES, S3, CloudWatch, Amazon Location Service |

## Design notes

- **The scan path is kept minimal.** The redirect view runs a few indexed queries and nothing else. It's the only page students ever see, and printed QR codes can't be changed, so it has to be fast and always up.
- **Analytics are aggregate queries.** Each dashboard request runs a fixed number of queries (4 to 13) no matter how many scans there are, and tests check the query counts. Load-tested on a laptop with production settings, the redirect handled about 1,400 scans a second with 100 concurrent clients, with every scan recorded.
- **Clubs only see their own data.** Every query is scoped to the officer's current club, and other clubs' events return 404 rather than 403, so their existence isn't revealed. Recommendations are computed across clubs but only return tiers and generic reasons.
- **Recommendations** weight each past flyer's scans per day (counted only until its event ended) by how similar its club and event are. The scores are then pulled toward the campus average, so a single lucky poster can't top the list. Nothing is recommended until the club's profile and the event type are known.
- **Abuse limits:** rate limits on log-in (per account), sign-up, password reset, and join requests. The client IP is read from the address the proxy recorded, so it can't be spoofed with headers to dodge limits or inflate unique-visitor counts.

## Running locally

Requires Python 3.12+ and Node.js 20.19+.

```bash
git clone https://github.com/Vitaliy-Kornev/Campus-Pulse.git && cd Campus-Pulse
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # set SECRET_KEY to any long random string
python manage.py migrate
python manage.py seed_demo        # demo clubs, events, and ~1,300 synthetic scans
python manage.py runserver        # API and scan redirects on :8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173, proxies /api and /r to Django
```

Demo accounts (the password is the same as the username):

| Username | Role |
| --- | --- |
| `demo` | Officer of Gopher Coders and Women in Computing |
| `wic`, `finance`, `hsa`, `volleyball` | Officers of the other demo clubs |
| `newofficer` | Waiting for approval to join Gopher Coders |
| `admin` | Staff: manages boards and sees all clubs |

`seed_demo` is for local development only, since it creates accounts with known passwords.

## Tests

```bash
python manage.py test            # backend tests
cd frontend && npm run build     # type-checks and builds the frontend
npx oxlint src                   # lints the frontend
```

The backend tests cover scan counting and bot filtering, data scoping between clubs, recommendations (including that no other club's data leaks), rate limits, backup restore checks, and query counts.

## Configuration

Settings come from environment variables (see `.env.example`). The main ones:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL` | Standard Django settings |
| `SITE_URL` | Base URL printed into every QR code. Codes can't change once printed, so set this to the real domain before printing |
| `AWS_LOCATION_API_KEY`, `AWS_REGION` | Map tiles from Amazon Location Service. Without a key, the map uses raster tiles |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP for password resets (Amazon SES in production). Without them, emails print to the console |
| `TRUSTED_PROXIES` | Number of proxies in front of the app, used to find the real client IP |
| `LOG_FILE` | Also write logs to this file; in production it's shipped to CloudWatch |

## Deployment

Production runs on a single AWS Lightsail server: nginx with Let's Encrypt HTTPS, gunicorn, and PostgreSQL, with nightly database backups copied to S3. CloudWatch alarms email on application errors and on downtime (a Route 53 health check on `/healthz`).

The scripts in `deploy/` set this up:

| Script | What it does |
| --- | --- |
| `deploy/aws/create-server.sh` | Creates the Lightsail server, static IP, firewall rule, and DNS record |
| `deploy/aws/provision.sh` | Creates alerting, a budget, the backup bucket, the error alarm, the health check, SES email, the map key, and a least-privilege IAM user |
| `deploy/lightsail/setup.sh` | Installs the app on the server: Python, Node, PostgreSQL, nginx, HTTPS, and systemd services |
| `deploy/aws/connect-server.sh` | Connects the server to the AWS services above |
| `deploy/lightsail/deploy.sh` | Deploys the latest `main` |
| `deploy/lightsail/backup.sh`, `restore-drill.sh` | Backs up the database, and proves a backup restores correctly |

## Project structure

```text
config/                 Django settings and URLs
pulse/
  models.py             Club, Membership, Event, Board, Flyer, Scan, Notification
  api/                  REST endpoints: auth, clubs, events, flyers, boards
  services/             analytics, recommendations, notifications, scan tracking, rate limits
  views/redirect.py     the QR scan redirect
  management/commands/  import_boards, seed_demo, backup_db, verify_restore
  tests/
frontend/src/
  pages/                map, events, flyers, boards, club, auth
  components/           shared UI (components/ui is shadcn/ui)
  lib/                  API client, map helpers, formatting, types
deploy/                 AWS and server scripts
boards_umn.csv          the 41 UMN Twin Cities poster boards
```

Boards are imported or updated from a CSV with `python manage.py import_boards boards_umn.csv` (columns `area,name,building,floor,description,latitude,longitude`, matched by name).
