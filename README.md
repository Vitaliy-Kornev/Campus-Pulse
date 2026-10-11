# Campus Pulse

Campus Pulse shows student clubs where on campus their flyers actually get seen.

Organizations post physical flyers on a fixed set of poster boards around campus. Every flyer carries its own QR code. When a student scans it, Campus Pulse logs the scan and immediately redirects them to the flyer's destination URL. Club officers then see, on an interactive campus map, which boards their flyers are on and how many scans each one received.

- **Admins** (staff users) manage poster boards, post flyers for any event, and see all data.
- **Club officers** share one club account. A new officer either starts a club or asks to join one, and an existing officer approves them. One person can be an officer of several clubs and switches between them from the club menu in the header; each club's events and numbers stay inside that club and never mix. Officers create events, post flyers, download QR codes, and see analytics for their own club's events only.
- **Students** never log in. They scan and get redirected.

The app ships configured for the **University of Minnesota – Twin Cities** with 41 real poster boards (`boards_umn.csv`).

## Clubs, recommendations, and notifications

- **Club profile.** Each club records its kind (academic, cultural, sports…) and what its members study (1–8 fields, grouped by UMN college). Each event has a kind too (workshop, social, hackathon…).
- **Recommended boards.** Nothing is recommended until the club profile says what members study and the officer picks the kind of event. Then only evidence counts: boards that worked for the club's own past events, or for similar clubs (a shared field of study, the same college, or the same kind of non-academic club, such as two cultural clubs). The same kind of event counts extra. Busy boards from unrelated clubs are never recommended. Rates are scans per day until the event ended, pulled toward the campus average so one lucky poster doesn't dominate. Officers only ever see a tier ("Strong pick" or "Good pick") and a generic reason such as "Strong with Computer science clubs". Other clubs' names, events, and numbers are never shown.
- **One round of posters.** Posters go up once per event, so the **Post flyer** page creates the event and its flyers in one step, with recommendations beside the board picker and a **Near me** button for officers standing at a board.
- **Move it?** If a poster has no scans after 5 days and the event hasn't happened yet, its page suggests moving it to a recommended board.
- **Recap.** After an event ends, its page shows every board ranked by scans per day, what worked, and boards to try next time.
- **Notifications** appear under the bell in the header and are never emailed: first scan of each event, move-it nudges, recaps, and join requests.

## Local setup

Requires Python 3.12+ and Node.js 20.19+ (22 recommended).

The backend is Django with Django REST Framework (`pulse/api/`). The frontend is a React app in `frontend/` (Vite, TypeScript, Tailwind CSS, shadcn/ui), built with the UI UX Pro Max and shadcn skills in `.claude/skills/`.

```bash
git clone <this repo> campus-pulse && cd campus-pulse
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then set SECRET_KEY to any long random string
python manage.py migrate
python manage.py seed_demo
python manage.py runserver      # API and scan redirects on :8000

# in a second terminal
cd frontend && npm install
npm run dev                     # the app on :5173, proxying /api, /r, /admin to Django
```

Open http://localhost:5173 and log in as **`demo` / `demo`** (officer of Gopher Coders and Women in Computing) or **`admin` / `admin`** (staff). Edits to the React code reload instantly.

To try the production setup locally, run `npm run build` in `frontend/` and open http://localhost:8000: Django serves the built app from `frontend/dist`.

Run the backend tests with `python manage.py test`, and type-check the frontend with `npm run build`.

## Demo data

`python manage.py seed_demo` creates:

- the UMN campus and every board from `boards_umn.csv`
- `admin` / `admin` (staff + superuser)
- 5 clubs, each with an officer whose password is the username: `demo` (Gopher Coders, and also Women in Computing to show switching clubs), `wic` (Women in Computing), `finance` (Carlson Finance Club), `hsa` (Hmong Student Association), and `volleyball` (Intramural Volleyball Club)
- `newofficer`, who has asked to join Gopher Coders and is waiting for approval
- 7 events across the clubs, some already over (so they have recaps) and one upcoming with a quiet poster (so it gets a move-it nudge)
- about 2,000 scans over the past 30 days, with busier boards (Coffman, the Washington Ave bridge, Northrop Mall), lunchtime and class-change peaks, quieter weekends, repeat visitors, and about 5% bot traffic

It is safe to re-run: boards are updated by name and the demo clubs and events are rebuilt. Pass `--seed 42` for reproducible data.

## Importing real boards

Boards live in the database. To load or update them from a CSV:

```bash
python manage.py import_boards boards_umn.csv
```

The CSV needs the columns `area,name,building,floor,description,latitude,longitude` (see `boards_sample.csv`). Boards are matched **by name**: existing ones are updated and new ones are created. Nothing is deleted. Retire boards from the Manage boards page or the Django admin.

> **Check every board's coordinates after import.** The bundled UMN coordinates are approximate (within about 50 m). Log in as an admin, open **Manage boards**, and drag each pin to its exact spot. The new position saves immediately.

From the Manage boards page you can also click an empty spot on the map to create a board there, or click a pin to edit or retire it.

Residence halls are one board per building. A hall has many physical boards, but all copies share one flyer and one QR code. The approximate count in the description (for example "(about 15)") is shown in the map popup.

## Posting and printing flyers

1. Click a board on the **Map** and choose **Add flyer here**, or use **Post flyer** in the nav. Officers post for their club's events; admins for any event.
2. Pick an existing event or create a new one in the same form, choose one or more boards (recommended ones are listed first), an optional label (such as "blue design"), and the posted date.
3. The flyer page shows its QR code with **Download PNG**, **Download SVG**, and **Print**. Downloads have a transparent background so they can be pasted onto a flyer design; put them on a light area. For dark designs, use the white-background links (`?background=white`).

The **Print** page renders the code at 2 × 2 inches with the event name and short URL underneath, as a fallback for cameras that fail. Print at 100% scale. Codes use error-correction level H, so they survive wear and small tears. The images have no margin around the code, so leave a clear light border of about 4 squares around it on the flyer. For large-format flyers, use the SVG.

QR codes encode `SITE_URL/r/<slug>/`. **Set `SITE_URL` to your real domain before printing anything**, because printed codes can't be changed later.

When a flyer comes down, click **Mark removed**. Scans after that still redirect and are reported as "after removal", since people photograph flyers. **Repost** creates a new flyer, with a new code, on another board for the same event.

## How scans are counted

- **Total scans**: every scan where the user agent is not a bot.
- **Unique scans**: distinct visitors. A visitor is a daily-rotating SHA-256 hash of IP + user agent + UTC date + `SECRET_KEY`, so the same person counts once per day. **Raw IP addresses are never stored.**
- Bot and link-preview scans (Slack, Facebook, WhatsApp, curl, and others) are stored but excluded from every number. Admins can see the bot count on each flyer page.
- Days and hours are grouped in the campus time zone (`TIME_ZONE`, default `America/Chicago`).

## Configuration

All settings come from environment variables (or `.env` locally):

| Variable | Purpose |
| --- | --- |
| `DEBUG` | `True` locally, `False` in production |
| `SECRET_KEY` | Required when `DEBUG=False`. Also salts visitor hashes. |
| `DATABASE_URL` | e.g. `sqlite:///db.sqlite3` or `postgres://user:pass@host:5432/db` |
| `ALLOWED_HOSTS` | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | Comma-separated origins, e.g. `https://campuspulse.app` |
| `SITE_URL` | Absolute base URL printed into QR codes |
| `TIME_ZONE` | Campus time zone, default `America/Chicago` |
| `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION`, `MAP_TILE_MAX_ZOOM` | Map tiles. Defaults to Stadia Maps (Alidade Smooth). Works on localhost as is; **before going live, create a free account at [client.stadiamaps.com](https://client.stadiamaps.com) and add your domain**, or tiles won't load there. The free plan has no billing, so it can't run up charges |
| `EMAIL_BACKEND` | Defaults to the console backend (password-reset emails print to the terminal) |
| `SENTRY_DSN` | Optional. Sends server and browser errors to [Sentry](https://sentry.io) (free tier). No IPs, cookies, or personal data are sent |
| `TRUSTED_PROXIES` | Proxies in front of the app that add to `X-Forwarded-For`; default `1` (nginx, Render, Railway). The client IP is the one *our* proxy recorded, so it can't be faked |
| `THROTTLE_USER_RATE`, `THROTTLE_VISITOR_RATE` | Broad request caps; defaults `3000/hour` per account and `600/hour` per IP when logged out |
| `BACKUP_S3_URI` | Lightsail only: also copy each nightly backup to S3 |

With `DEBUG=False`, the app turns on HTTPS redirect, HSTS, secure cookies, and `SECURE_PROXY_SSL_HEADER`.

## Protection and reliability

**Rate limits.** Counters for the strict limits live in a database table (created by `migrate`), so they hold across every server process.

| Action | Limit |
| --- | --- |
| Failed log-ins | 5 per account per 15 minutes (then even the right password waits), 50 per IP |
| Password-reset emails | 3 per address per hour (extra requests quietly send nothing), 20 requests per IP per hour |
| Sign-ups | 20 per IP per hour (campus Wi-Fi shares IPs, so per-IP limits are generous) |
| Join requests, new clubs | 20 and 10 per account per day |
| New boards (officers), events, flyers | 20, 50, and 300 per account per day |
| Anything else | 3000 requests per account per hour; 600 per IP per hour when logged out |

Over a limit, the API answers `429` with a plain message ("Too many failed log-ins. Wait 15 minutes and try again."). The QR redirect is never limited: it always redirects, but the same visitor rescanning the same flyer within 10 minutes counts once, so totals can't be padded by reloading.

**Duplicates.** The same event name and date can't be created twice in one club, so a retried or double-clicked form doesn't duplicate it. Clubs, memberships, and notifications are unique in the database.

**Failed requests.** Requests give up after 20 seconds with a clear message. Loading data retries twice on network or server errors; saving never retries on its own. A page that crashes shows a "Something went wrong" screen with Reload, and after a deploy, an out-of-date page says to reload instead of breaking.

**Error reports.** Set `SENTRY_DSN` to get an email from Sentry when the server or a browser hits an error. Server errors also go to the app log (`journalctl -u campuspulse` on Lightsail).

**Uptime monitoring.** `GET /healthz` returns `ok` only if the database answers. In a free [UptimeRobot](https://uptimerobot.com) or Better Stack account, add two HTTP monitors with alerts to your email or phone:

1. `https://your-domain/healthz`: every 5 minutes, alert if it isn't `200`.
2. One real flyer's QR link, `https://your-domain/r/<slug>/`: alert if it isn't `302`. (Monitors send a bot user agent, so these checks aren't counted as scans.)

**Backups.** `python manage.py backup_db --dir backups` saves a timestamped copy (`pg_dump` for PostgreSQL, SQLite's online backup otherwise) plus a `.counts` file of what it holds, and deletes copies older than 14 days. `python manage.py verify_restore --expect "flyers=120"` checks a restored copy: migrations, counts, and that every flyer's QR code still has a working link. On Lightsail, backups run nightly and `restore-drill.sh` tests one end to end (see the [Lightsail guide](deploy/lightsail/README.md#6-turn-on-backups)). **Run the drill once before launch.** Losing the database would break every QR code already printed.

**Load.** Tested with production settings (gunicorn, 3 workers, PostgreSQL) on a laptop: 100 phones scanning at once handled about 1,400 scans a second (95% under 95 ms) with every scan recorded, and 20 officers on dashboards at once stayed under 60 ms. Every API page runs a fixed number of queries (4 to 13), all under 25 ms.

## Deploying

### AWS Lightsail (recommended)

Step-by-step guide: [`deploy/lightsail/README.md`](deploy/lightsail/README.md). One setup script runs the whole app (nginx, gunicorn, PostgreSQL, and Let's Encrypt HTTPS) on a single Lightsail Ubuntu server. It's set up from the browser, with no AWS CLI or Docker needed.

`GET /healthz` returns `ok` when the app and its database are up; see [Protection and reliability](#protection-and-reliability) for monitoring and backups.

The repo includes a `Procfile` (`web: gunicorn config.wsgi`, `release: python manage.py migrate`) and uses WhiteNoise for static files.

### Render

1. Create a **PostgreSQL** database on Render and copy its internal connection string.
2. Create a **Web Service** from this repo:
   - Build command: `pip install -r requirements.txt && cd frontend && npm ci && npm run build && cd .. && python manage.py collectstatic --noinput`
   - Pre-deploy command: `python manage.py migrate`
   - Start command: `gunicorn config.wsgi`
3. Set the environment variables: `DEBUG=False`, `SECRET_KEY=<random>`, `DATABASE_URL=<postgres url>`, `ALLOWED_HOSTS=<your-app>.onrender.com`, `CSRF_TRUSTED_ORIGINS=https://<your-app>.onrender.com`, and `SITE_URL=https://<your-app>.onrender.com` (or your custom domain). `.python-version` pins Python 3.12.
4. After the first deploy, open the Render shell and run `python manage.py createsuperuser` and `python manage.py import_boards boards_umn.csv`. Run `seed_demo` only for a demo instance, since it creates `admin`/`admin`.

### Railway

1. Create a project from this repo and add a **PostgreSQL** plugin. Railway sets `DATABASE_URL` for you; reference it from the web service.
2. Set the variables `DEBUG=False`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, and `SITE_URL` as above.
3. Set the build command to `pip install -r requirements.txt && cd frontend && npm ci && npm run build && cd .. && python manage.py collectstatic --noinput`. Railway runs the Procfile's `web` process; add `python manage.py migrate` as the pre-deploy command.
4. Run `python manage.py createsuperuser` and `python manage.py import_boards boards_umn.csv` once with `railway run`.

## Project layout

```text
config/                 settings, urls, wsgi
pulse/
  models.py admin.py forms.py urls.py taxonomy.py (club kinds, fields of study, event kinds)
  api/                  DRF endpoints: auth, boards, clubs, events, flyers (+ serializers, session auth)
  views/                redirect.py (QR scans), spa.py (serves the React build)
  services/             analytics.py (all counting and scoping), recommendations.py, notifications.py, qr.py, tracking.py, boards.py
  management/commands/  import_boards.py, seed_demo.py
  templates/pulse/scan_not_found.html  tests/
frontend/               React app: src/pages, src/components (ui/ is shadcn), src/lib
templates/              404.html, 403.html, password-reset email
boards_umn.csv          41 UMN Twin Cities boards
boards_sample.csv       minimal example of the import format
```

### JSON API (session login; scoped to the user's club)

Writes need the `X-CSRFToken` header (from the `csrftoken` cookie, which `GET /api/session/` sets). Other users' objects return 404.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/session/` | Current user with their current club and all their clubs (or `null`), plus campus and map settings |
| `POST /api/auth/login/`, `logout/`, `signup/` | Session login, logout, officer signup |
| `POST /api/auth/password/change/`, `reset/`, `reset/confirm/` | Password change and email reset |
| `GET, POST /api/boards/` | Boards for pickers and maps; any user can add one |
| `GET, PATCH /api/boards/<id>/` | Admins: edit, move (`latitude`/`longitude`), retire (`is_active`) |
| `GET /api/boards/leaderboard/` | Lifetime scans per board |
| `GET /api/boards.geojson?event=&range=&start=&end=` | Boards with total/unique scans and current flyers |
| `GET /api/taxonomy/` | Club kinds, fields of study, event kinds |
| `GET, POST /api/clubs/?q=` | Search clubs to join; start a new club |
| `POST /api/clubs/<id>/join/`, `open/`, `leave/` | Ask to join a club; switch to it; leave it (or cancel a request) |
| `GET, PATCH /api/club/` | The current club's profile and officers |
| `POST /api/club/members/<id>/approve/`, `decline/`, `remove/` | Manage join requests and officers |
| `GET /api/notifications/`, `POST /api/notifications/read/`, `dismiss/` | Bell notifications from all your clubs, labeled by club; mark read or close (just for you) some (`ids`) or all |
| `GET, POST /api/events/`, `GET, PATCH /api/events/<id>/` | Events |
| `GET /api/events/<id>/summary`, `timeseries`, `by-board`, `flyers`, `export.csv` | Dashboard data and CSV export |
| `GET /api/events/<id>/recap` | Recap after the event ends |
| `GET /api/recommendations/boards?event_type=` | Recommended boards as tiers, never numbers |
| `POST /api/flyers/`, `GET /api/flyers/<slug>/` | Post a flyer; flyer detail with counts and devices |
| `POST /api/flyers/<slug>/remove/`, `repost/` | Mark removed; repost on another board |
| `GET /api/flyers/<slug>/hourly`, `timeseries`, `qr.png`, `qr.svg` | Flyer charts and QR images (`?download=1`, `?background=white`) |

`range` accepts `7d`, `30d`, `all`, or `custom` (with `start`/`end` as `YYYY-MM-DD`).
