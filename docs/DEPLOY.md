# Going live on a VPS (Ubuntu 24.04, no Docker)

This puts Jhumka on a small Linux server: **Node 22** runs the shop, **PostgreSQL 18** stores
everything, and **Caddy** handles HTTPS automatically. Budget: a 2 GB RAM VPS (≈ ₹400–800/month
at Hetzner, DigitalOcean or Contabo) is plenty.

Commands below run on the server over SSH unless noted. Replace `jhumka.in` with your domain.

---

## 1. Server and domain

1. Create an **Ubuntu 24.04** VPS and note its IP address.
2. At your domain registrar, add DNS records: `A  @  → <server IP>` and `A  www  → <server IP>`.
3. SSH in as root, then:

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" jhumka
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
timedatectl set-timezone Asia/Kolkata
```

## 2. Install Node, PostgreSQL and Caddy

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs git rsync

# PostgreSQL 18 (official PGDG repository)
apt install -y postgresql-common && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt install -y postgresql-18

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 3. Database

Choose a **long random password** (e.g. `openssl rand -base64 24`) — different from any password you use elsewhere.

```bash
sudo -u postgres psql
```
```sql
CREATE ROLE jhumka LOGIN PASSWORD 'PASTE-THE-LONG-PASSWORD';
CREATE DATABASE jhumka OWNER jhumka;
\c jhumka
CREATE EXTENSION IF NOT EXISTS citext;
\q
```

PostgreSQL only listens on localhost by default — keep it that way.

## 4. The app

```bash
mkdir -p /opt/jhumka /var/lib/jhumka/media /var/backups/jhumka
chown -R jhumka:jhumka /opt/jhumka /var/lib/jhumka /var/backups/jhumka
sudo -u jhumka git clone <your-repo-url> /opt/jhumka
```

Create **/etc/jhumka.env** (`nano /etc/jhumka.env`), then `chmod 600 /etc/jhumka.env && chown jhumka /etc/jhumka.env`:

```ini
PUBLIC_SITE_URL=https://jhumka.in
DATABASE_URL=postgres://jhumka:PASTE-THE-LONG-PASSWORD@localhost:5432/jhumka
MEDIA_DIR=/var/lib/jhumka/media
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=choose-a-long-random-string
PUBLIC_INSTAGRAM_HANDLE=jhumka.in_
```

Build, create the tables and your owner login:

```bash
sudo -iu jhumka
cd /opt/jhumka
set -a; source /etc/jhumka.env; set +a
npm ci && npm run build && npm run db:migrate && npm run db:seed
npm run admin:create      # type your email + a strong password
exit
```

## 5. Run it

```bash
cp /opt/jhumka/deploy/jhumka.service /etc/systemd/system/
cp /opt/jhumka/deploy/jhumka-backup.service /opt/jhumka/deploy/jhumka-backup.timer /etc/systemd/system/
cp /opt/jhumka/deploy/Caddyfile /etc/caddy/Caddyfile     # edit the domain first!
systemctl daemon-reload
systemctl enable --now jhumka jhumka-backup.timer
systemctl reload caddy
# Let the jhumka user restart the service during deploys:
echo 'jhumka ALL=(root) NOPASSWD: /usr/bin/systemctl restart jhumka' > /etc/sudoers.d/jhumka
```

Open `https://jhumka.in` — it should load with a valid certificate within a minute.

## 6. Razorpay (live)

1. Complete KYC in the Razorpay dashboard, then switch to **Live mode** and generate **API keys** → put them in `/etc/jhumka.env`.
2. **Webhooks → Add new webhook**: URL `https://jhumka.in/api/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. **Payment capture**: keep *Automatic* (the default).
4. `sudo systemctl restart jhumka`, then place a real ₹1–₹10 test order and refund it from the admin.

## 7. Telegram order alerts (free)

1. In Telegram, open **@BotFather** → `/newbot` → pick a name and a username ending in `bot` → copy the token.
2. Create a group with the founders, add the bot, and send `/start@<your_bot_username>` in the group.
3. **Admin → Settings → Order alerts on Telegram**: paste the token → **Save** → **Find chats** → pick the
   group → turn alerts on → **Save** → **Send test alert**.

## 7b. Receipt emails (free, Brevo SMTP)

1. Sign up at brevo.com (free plan, 300 emails/day). **Senders, Domains & Dedicated IPs → Domains** → add
   `shopjhumka.in` and add the DNS records it shows at your domain registrar → **Verify**.
2. **Senders** → add `orders@shopjhumka.in` (name: Jhumka).
3. **SMTP & API → SMTP** → generate an SMTP key. Add to `/etc/jhumka.env`: `SMTP_HOST=smtp-relay.brevo.com`,
   `SMTP_PORT=587`, `SMTP_USER=<login shown>`, `SMTP_PASS=<SMTP key>`, `MAIL_FROM="Jhumka <orders@shopjhumka.in>"`,
   `MAIL_REPLY_TO=<an inbox you read>` → `sudo systemctl restart jhumka`.
4. Every paid order now emails the customer a receipt with the invoice PDF attached.

## 8. Instagram feed on the home page (free, official API)

1. In the Instagram app: Settings → Account type and tools → **Switch to professional account** (Creator or Business).
2. At [developers.facebook.com/apps](https://developers.facebook.com/apps): **Create app** → type **Business** → add the **Instagram** product.
3. Instagram → **API setup with Instagram login** → add the account → **Generate token**, sign in, copy it.
4. Paste it into **Admin → Settings → Instagram feed** → **Connect**.

Reading your own account needs no App Review. The server renews the token every week and syncs
new posts every 30 minutes; if the token ever stops working, the admin card says so and the
posts already on the site stay up until you connect again.

## 9. Everyday operations

| Task | Command |
| --- | --- |
| Deploy an update | `sudo -iu jhumka /opt/jhumka/deploy/deploy.sh` |
| Live logs | `journalctl -u jhumka -f` |
| Restart | `sudo systemctl restart jhumka` |
| Run a backup now | `sudo systemctl start jhumka-backup` |
| List backups | `ls -lh /var/backups/jhumka/db` |
| Restore a backup | `pg_restore --clean --no-owner -d "$DATABASE_URL" /var/backups/jhumka/db/<file>.dump` |

Backups run nightly at 03:30 IST and keep 14 days. For extra safety, copy `/var/backups/jhumka`
to another place (e.g. `rclone` to Google Drive) once a week.

## Changing the domain later

Update `PUBLIC_SITE_URL` in `/etc/jhumka.env`, the domain in `/etc/caddy/Caddyfile` and the
Razorpay webhook URL, then `systemctl reload caddy && systemctl restart jhumka`.
