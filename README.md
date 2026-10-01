# Campus Pulse

Campus Pulse shows advertisers where on campus their flyers actually get seen.

Organizations post physical flyers on a fixed set of poster boards around campus. Every flyer carries its own QR code. When a student scans it, Campus Pulse logs the scan and immediately redirects them to the flyer's destination URL. Advertisers then see, on an interactive campus map, which boards their flyers are on and how many scans each one received.

- **Admins** (staff users) manage poster boards, post flyers for any campaign, and see all data.
- **Advertisers** create campaigns, add boards, post flyers for their own campaigns, download QR codes, and see analytics for their own campaigns only.
- **Students** never log in. They scan and get redirected.

The app ships configured for the **University of Minnesota – Twin Cities** with 41 real poster boards (`boards_umn.csv`).

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

Open http://localhost:5173 and log in as **`demo` / `demo`** (advertiser) or **`admin` / `admin`** (staff). Edits to the React code reload instantly.

To try the production setup locally, run `npm run build` in `frontend/` and open http://localhost:8000: Django serves the built app from `frontend/dist`.

Run the backend tests with `python manage.py test`, and type-check the frontend with `npm run build`.

## Demo data

`python manage.py seed_demo` creates:

- the UMN campus and every board from `boards_umn.csv`
- `admin` / `admin` (staff + superuser) and `demo` / `demo` (advertiser)
- 3 campaigns owned by `demo`, 17 flyers (two already marked removed)
- about 2,000 scans over the past 30 days, with busier boards (Coffman, the Washington Ave bridge, Northrop Mall), lunchtime and class-change peaks, quieter weekends, repeat visitors, and about 5% bot traffic

It is safe to re-run: boards are updated by name and the demo campaigns are rebuilt. Pass `--seed 42` for reproducible data.

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

1. Click a board on the **Map** and choose **Add flyer here**, or use **Post flyer** in the nav. Advertisers can post for their own campaigns; admins for any campaign.
2. Pick the campaign, an optional label (such as "blue design"), and the posted date.
3. The flyer page shows its QR code with **Download PNG**, **Download SVG**, and **Print**. Downloads have a transparent background so they can be pasted onto a flyer design; put them on a light area. For dark designs, use the white-background links (`?background=white`).

The **Print** page renders the code at 2 × 2 inches with the campaign name and short URL underneath, as a fallback for cameras that fail. Print at 100% scale. Codes use error-correction level H, so they survive wear and small tears. The images have no margin around the code, so leave a clear light border of about 4 squares around it on the flyer. For large-format flyers, use the SVG.

QR codes encode `SITE_URL/r/<slug>/`. **Set `SITE_URL` to your real domain before printing anything**, because printed codes can't be changed later.

When a flyer comes down, click **Mark removed**. Scans after that still redirect and are reported as "after removal", since people photograph flyers. **Repost** creates a new flyer, with a new code, on another board for the same campaign.

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
| `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION` | Map tile server. Defaults to OpenStreetMap, which allows light use only ([tile policy](https://operations.osmfoundation.org/policies/tiles/)); use a commercial provider for real traffic |
| `EMAIL_BACKEND` | Defaults to the console backend (password-reset emails print to the terminal) |

With `DEBUG=False`, the app turns on HTTPS redirect, HSTS, secure cookies, and `SECURE_PROXY_SSL_HEADER`.

## Deploying

### AWS Lightsail (recommended)

Step-by-step guide: [`deploy/lightsail/README.md`](deploy/lightsail/README.md). One setup script runs the whole app (nginx, gunicorn, PostgreSQL, and Let's Encrypt HTTPS) on a single Lightsail Ubuntu server. It's set up from the browser, with no AWS CLI or Docker needed.

`GET /healthz` returns `ok` for uptime monitors and load balancers.

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
  models.py admin.py forms.py urls.py
  api/                  DRF endpoints: auth, boards, campaigns, flyers (+ serializers, session auth)
  views/                redirect.py (QR scans), spa.py (serves the React build)
  services/             analytics.py (all counting and scoping), qr.py, tracking.py, boards.py
  management/commands/  import_boards.py, seed_demo.py
  templates/pulse/scan_not_found.html  tests/
frontend/               React app: src/pages, src/components (ui/ is shadcn), src/lib
templates/              404.html, 403.html, password-reset email
boards_umn.csv          41 UMN Twin Cities boards
boards_sample.csv       minimal example of the import format
```

### JSON API (session login; scoped to the user's campaigns)

Writes need the `X-CSRFToken` header (from the `csrftoken` cookie, which `GET /api/session/` sets). Other users' objects return 404.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/session/` | Current user (or `null`) plus campus and map settings |
| `POST /api/auth/login/`, `logout/`, `signup/` | Session login, logout, advertiser signup |
| `POST /api/auth/password/change/`, `reset/`, `reset/confirm/` | Password change and email reset |
| `GET, POST /api/boards/` | Boards for pickers and maps; any user can add one |
| `GET, PATCH /api/boards/<id>/` | Admins: edit, move (`latitude`/`longitude`), retire (`is_active`) |
| `GET /api/boards/leaderboard/` | Lifetime scans per board |
| `GET /api/boards.geojson?campaign=&range=&start=&end=` | Boards with total/unique scans and current flyers |
| `GET, POST /api/campaigns/`, `GET, PATCH /api/campaigns/<id>/` | Campaigns |
| `GET /api/campaigns/<id>/summary`, `timeseries`, `by-board`, `flyers`, `export.csv` | Dashboard data and CSV export |
| `POST /api/flyers/`, `GET /api/flyers/<slug>/` | Post a flyer; flyer detail with counts and devices |
| `POST /api/flyers/<slug>/remove/`, `repost/` | Mark removed; repost on another board |
| `GET /api/flyers/<slug>/hourly`, `timeseries`, `qr.png`, `qr.svg` | Flyer charts and QR images (`?download=1`, `?background=white`) |

`range` accepts `7d`, `30d`, `all`, or `custom` (with `start`/`end` as `YYYY-MM-DD`).
