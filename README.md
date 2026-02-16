# Divine Beauty by Nina

A mobile-first promotional and booking website designed to replace platform commission dependency with a branded direct-booking experience.

## Features delivered
- Immersive landing page with service highlights and portfolio gallery.
- Expandable calendar-like booking slot cards.
- Booking capture with service selections, notes, and client contact details.
- Persistent customer profile creation and auto-population for return clients.
- Admin dashboard (password-protected) for:
  - availability slot management,
  - services,
  - image uploads,
  - Instagram image URL ingestion,
  - blog post publishing.
- Blog + comments section.
- Nginx reverse proxy + Let's Encrypt deployment blueprint for custom domain.

## Quick start (local)
```bash
cp .env.example .env
npm install
npm start
```
Visit `http://localhost:8080`.

Admin login URL: `/admin/login`.

## Production deployment
### 1) DNS
Point `divinebeautybynina.com` and `www.divinebeautybynina.com` A records to your server.

### 2) Start stack
```bash
cd deploy
docker compose up -d --build
```

### 3) Issue first certificate
Run once on host:
```bash
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d divinebeautybynina.com -d www.divinebeautybynina.com --email you@example.com --agree-tos --no-eff-email
```

Then reload nginx:
```bash
docker compose restart nginx
```

## iOS-first UX notes
- Touch-first controls with large tappable targets.
- Input sizing avoids iOS Safari zoom issues.
- Layout prioritizes mobile breakpoints and vertical content flow.

## Folder map
See `docs/ARCHITECTURE.md` for full file-structure analysis and rollout checklist.
