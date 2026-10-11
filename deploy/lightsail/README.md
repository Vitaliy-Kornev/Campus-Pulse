# Deploying Campus Pulse to AWS Lightsail

This runs the whole app on one Lightsail Ubuntu server: nginx in front, gunicorn running Django, PostgreSQL on the same machine, and a free HTTPS certificate from Let's Encrypt. Everything is done from your browser; you don't need the AWS CLI or Docker.

**Cost:** one Lightsail instance (the 2 GB plan is recommended; check current prices on the Lightsail pricing page) plus your domain. Snapshots for backups cost a little extra.

## Before you start

- **A domain name** (for example `campuspulse.app`). Every QR code contains this address, so use a domain you control. Then you can change hosts later without reprinting flyers.
- **The code on GitHub `main`**, including this `deploy/` folder. The server downloads the code from `https://github.com/Vitaliy-Kornev/Campus-Pulse`.

## 1. Create the server

1. Open the [Lightsail console](https://lightsail.aws.amazon.com/) and click **Create instance**.
2. Pick a region close to campus, such as **Ohio (us-east-2)**.
3. Choose **Linux/Unix**, then **OS Only**, then **Ubuntu 24.04 LTS**.
4. Choose the **2 GB RAM** plan. 1 GB works but leaves little room for Postgres.
5. Name it `campus-pulse` and click **Create instance**.

## 2. Give it a fixed address and open HTTPS

On the instance page, open the **Networking** tab:

1. **Attach a static IP.** Click **Attach static IP**, create one, and attach it to `campus-pulse`. Without one, the address changes when the server restarts.
2. **Open the HTTPS port.** Under **IPv4 Firewall**, click **Add rule** and add **HTTPS (443)**. SSH (22) and HTTP (80) are already open. If IPv6 networking is on, add the same rule under **IPv6 Firewall**.

## 3. Point your domain at the server

At your domain registrar (or Route 53), create an **A record**:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (the bare domain) | the static IP from step 2 |

Wait until it takes effect, usually a few minutes. On your Mac, `dig +short campuspulse.app` should print the static IP.

## 4. Run the setup script

On the instance page, click **Connect using SSH**. A terminal opens in your browser. Paste these commands, replacing the domain and email with yours:

```bash
curl -fsSL https://raw.githubusercontent.com/Vitaliy-Kornev/Campus-Pulse/main/deploy/lightsail/setup.sh -o setup.sh
sudo DOMAIN=campuspulse.app LE_EMAIL=you@example.com bash setup.sh
```

The script takes about 5 minutes. It:

- checks that the domain points at this server, and stops with instructions if it doesn't
- installs Python, PostgreSQL, nginx, and certbot
- downloads the app to `/srv/campus-pulse`, creates the database, and writes `/srv/campus-pulse/.env` with a random `SECRET_KEY` and database password
- imports the 41 UMN boards
- starts the app (it restarts automatically after a crash or reboot) and gets the HTTPS certificate, which renews automatically

It does **not** run `seed_demo`, so production has no demo accounts or fake scans.

## 5. Create your admin account

```bash
sudo /srv/campus-pulse/deploy/lightsail/manage.sh createsuperuser
```

Open `https://your-domain`, log in, and test the whole flow. Create your club and an event, post a flyer, download its QR code, and scan it with your phone **over cellular data**. Check that it redirects and that the scan shows up on the map.

## 6. Turn on backups

Losing the database would break every QR code already printed, so set up two kinds of backup and test one before launch.

1. **Nightly database backups** are already scheduled by `setup.sh` (4:00 UTC, kept 14 days in `/srv/campus-pulse-backups`). Check with `systemctl list-timers campuspulse-backup`, or take one now:

   ```bash
   sudo /srv/campus-pulse/deploy/lightsail/backup.sh
   ```

2. **Server snapshots**: on the instance's **Snapshots** tab, enable **Automatic snapshots**. They cover the whole server, including the backups folder.

3. **Off-server copies (recommended)**: snapshots and backups both disappear if the instance is deleted. Create an S3 bucket, install the AWS CLI (`sudo snap install aws-cli --classic`), give the server an access key that can only write to that bucket (`sudo aws configure`), and add `BACKUP_S3_URI=s3://your-bucket/campus-pulse` to `.env`. Each nightly backup is then copied there too.

4. **Test a restore once before launch** (and after changing anything about backups):

   ```bash
   sudo /srv/campus-pulse/deploy/lightsail/restore-drill.sh
   ```

   It restores the newest backup into a throwaway database, checks that every flyer's QR code still has a working link and that nothing is missing, then deletes the throwaway copy. The live site isn't touched.

**To actually restore** after data loss, stop the app (`sudo systemctl stop campuspulse`), then run `sudo -u postgres pg_restore --clean --if-exists --no-owner --role=campuspulse --dbname campuspulse /srv/campus-pulse-backups/<file>.dump`, and start the app again.

## 7. Set up monitoring

Create a free [UptimeRobot](https://uptimerobot.com) account and add two HTTP monitors with alerts to your phone or email: `https://your-domain/healthz` (should return 200) and one real flyer's QR link, `https://your-domain/r/<slug>/` (should return 302). For error reports, create a free [Sentry](https://sentry.io) project (platform: Django), add `SENTRY_DSN=<its DSN>` to `.env`, and restart the app.

## 8. Allow the map on your domain

The map uses Stadia Maps' free plan. Create a free account at [client.stadiamaps.com](https://client.stadiamaps.com), add a property, and add your domain under **Authentication**. No key goes in the app, and the free plan can't charge you.

## Deploying updates

After you push new code to GitHub `main`, open the browser SSH terminal and run:

```bash
sudo /srv/campus-pulse/deploy/lightsail/deploy.sh
```

This pulls the code, installs dependencies, runs migrations, collects static files, and restarts the app.

## Day-to-day commands

| Task | Command |
| --- | --- |
| View app logs | `sudo journalctl -u campuspulse -f` |
| Restart the app | `sudo systemctl restart campuspulse` |
| Run any manage.py command | `sudo /srv/campus-pulse/deploy/lightsail/manage.sh <command>` |
| Edit settings | `sudo nano /srv/campus-pulse/.env`, then restart the app |
| Health check | `curl https://your-domain/healthz` (returns `ok`) |

## Optional: password-reset emails with Amazon SES

Until this is set up, the "Forgot your password?" emails only appear in the app logs.

1. In the **Amazon SES** console (same region), verify your domain under **Identities** and add the DNS records it gives you.
2. New SES accounts start in a "sandbox" that can only email verified addresses. Request **production access** in SES.
3. Under **SMTP settings**, click **Create SMTP credentials**.
4. Add these to `/srv/campus-pulse/.env`, then run `sudo systemctl restart campuspulse`:

```
EMAIL_HOST=email-smtp.us-east-2.amazonaws.com
EMAIL_HOST_USER=<SMTP username>
EMAIL_HOST_PASSWORD=<SMTP password>
DEFAULT_FROM_EMAIL=Campus Pulse <noreply@campuspulse.app>
```

## Optional: map tiles for real traffic

OpenStreetMap's free tile servers only allow light use. For real traffic, sign up with a tile provider (MapTiler and Stadia have free tiers) and set `MAP_TILE_URL` and `MAP_TILE_ATTRIBUTION` in `.env`.
