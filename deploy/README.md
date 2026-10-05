# Gsky Sport Shoes — Deployment Kit

This folder deploys the store to a Linux VPS (Ubuntu 22.04/24.04). The server does
everything: runs the API, serves the website, stores images, and issues HTTPS.

## What you need

1. **A Linux VPS** (~$4–7/month). Recommended for Tanzania:
   - Hetzner CX22 (Frankfurt) — ~EUR 4.60/mo
   - Contabo VPS S — ~EUR 4.50/mo
   - DigitalOcean basic droplet — ~$6/mo (fastest to set up)
   Choose **Ubuntu 24.04**.
2. **A domain** you control (DNS). Examples: `gskyshoes.co.tz`, `gsky.co.tz`,
   `gsky.store`, `gskyshoes.com`. Any registrar works (GoDaddy, Namecheap,
   Tanzania Online / TICTS, etc.).
3. **SSH access** to the VPS (the provider emails you the root password / SSH key).

## Step 1 — Point your domain at the server

At your registrar, create an **A record**:
```
Host:   @        Value: <YOUR_VPS_IP>     TTL: 3600
Host:   www      Value: <YOUR_VPS_IP>     TTL: 3600
```
Wait 10–30 minutes for DNS to spread.

## Step 2 — Create the upload package (on your Windows PC)

```
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
```
This builds the site and creates `gsky-deploy.zip` in the project root.

## Step 3 — Upload to the server

With **WinSCP** (or `scp`): upload `gsky-deploy.zip` to `/root/` on the server.
Then SSH in and run:
```
cd /root && apt-get install -y unzip
unzip gsky-deploy.zip -d gsky
cd gsky/deploy
sudo DOMAIN=gskyshoes.co.tz CERT_EMAIL=you@email.com bash setup-vps.sh
```
> No domain yet? Skip `DOMAIN`/`CERT_EMAIL` — it will run over HTTP on the IP
> so you can test immediately, then add HTTPS later:
> `sudo certbot --nginx -d yourdomain.com -m you@email.com --agree-tos --redirect`

The script takes ~5–10 minutes: installs Node.js, PostgreSQL, Nginx, SSL,
builds the site, seeds the catalog, and starts everything. At the end it prints
your store URL and admin login.

## After install

1. Log in to `/admin` and **change the admin password**.
2. Check `server/.env` on the server for the real secrets (JWT, DB, SMTP).
3. Emails (order confirmations, contact form) are sent via the Gmail account
   configured in `.env` — verify the contact form works from your site.

## Keeping the site up

- Service: `systemctl status gsky` / `sudo systemctl restart gsky`
- Logs: `sudo journalctl -u gsky -f`
- Nginx: `sudo nginx -t && sudo systemctl reload nginx`
- Renew SSL (auto): `certbot renew`

## To deploy an update later

```
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1     # Windows
scp gsky-deploy.zip root@<ip>:/root/
ssh root@<ip> "unzip -o /root/gsky-deploy.zip -d /root/gsky && cd /root/gsky/server && npm ci --omit=dev && cd /root/gsky/client && npm ci && npm run build && sudo systemctl restart gsky"
```
(Database data and uploaded images are kept — updates never touch them.)

## Important notes

- **Payments are SIMULATED** (sandbox). Customers can place orders but no real
  money moves. Connect a real mobile-money gateway (Vodacom M-Pesa, Airtel Money,
  Tigo Pesa) before accepting real payments — the payment code already has the
  provider switch (`PAYMENT_PROVIDER`).
- The store works fine as-is for promoting the brand, collecting orders, and
  building engagement while you register for a real payment gateway.
