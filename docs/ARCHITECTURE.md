# Architecture & File Structure Analysis

## Why this structure
The project is intentionally split into **small, obvious folders** so Nina can make edits with minimal technical friction and without touching infrastructure internals.

- `src/`: backend app and data logic only.
- `views/`: page templates split by public/admin views.
- `public/`: CSS, JavaScript, and uploaded media.
- `data/`: SQLite database storage.
- `deploy/`: reverse proxy and SSL deployment files.
- `docs/`: readable operational docs.
- `test/`: API and behavior checks for safer releases.

## Core modules
- `src/server.js`
  - Routing for public pages, booking submission, customer auto-fill lookup, blog comments.
  - Admin-auth protected content management for slots, services, images, and posts.
- `src/db.js`
  - Schema creation and baseline seed data.
  - Enables customer profile persistence for returning bookings.

## Mobile-first strategy
- iOS-friendly viewport config and typography.
- Inputs use >=16px to avoid iOS Safari auto-zoom.
- Touch-first interactive slot cards with large tap targets.
- Admin forms optimized for one-handed editing on phone.

## Data model summary
- `availability_slots`: editable time blocks.
- `bookings`: selected slot + service choices + notes.
- `customers`: persistent client profile, auto-populated for returning users.
- `services`: menu items shown publicly and in booking form.
- `gallery_images`: upload or Instagram-linked promotional visuals.
- `blog_posts` + `comments`: social engagement and content marketing.

## Deployment overview
- App runs at `0.0.0.0:8080`.
- Nginx handles TLS termination and reverse-proxies `80/443 -> app:8080`.
- Certbot renews certificates through webroot challenge.

## Pre-production checklist
1. Configure `.env` secrets and admin credentials.
2. Seed real services and upcoming slot blocks in Admin dashboard.
3. Upload portfolio images and first blog post.
4. Verify booking flow and customer auto-fill on iPhone Safari.
5. Enable DNS A/AAAA records for `divinebeautybynina.com`.
6. Issue initial cert with certbot, then enable HTTPS config.
