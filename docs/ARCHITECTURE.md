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
- `gallery_images`: upload or Instagram-linked promotional visuals via official Instagram post embeds (with seeded post permalinks for previews).
- `blog_posts` + `comments`: social engagement and content marketing.

## Deployment overview
- App runs at `0.0.0.0:8080`.
- Nginx handles TLS termination and reverse-proxies `80/443 -> app:8080` using mounted cert files from certbot volumes.
- Certbot renews certificates through webroot challenge.

## Pre-production checklist
1. Configure `.env` secrets and admin credentials.
2. Seed real services and upcoming slot blocks in Admin dashboard.
3. Upload portfolio images and first blog post.
4. Verify booking flow and customer auto-fill on iPhone Safari.
5. Enable DNS A/AAAA records for `divinebeautybynina.com`.
6. Issue initial cert with certbot, then enable HTTPS config.


## Theme system
- Theme data is stored in `site_settings` (`theme` JSON blob).
- Admin can apply preloaded presets or prompt-generate a palette using keyword matching.
- CSS variables are injected at render-time so visual updates are immediate with no rebuild.


## Security posture
- Admin credentials are only loaded from environment variables and never rendered to public pages.
- Session cookie is `httpOnly`, `sameSite=lax`, and `secure` in production.
- Sensitive files (e.g., `.env`) are blocked from accidental app-level route exposure.

- Instagram queue workflow: admin pastes Instagram post URLs, reviews queue, and publishes selected entries into the site gallery.


## Booking consistency
- Booking creation and selected service inserts run in a single database transaction.
- If any part fails, the booking is not created, preventing orphan records and slot-capacity drift.


## TLS bootstrap
- `deploy/nginx/default.conf` is HTTP bootstrap mode for first-run cert issuance.
- `deploy/nginx/active.conf` is the file mounted by nginx and switched from bootstrap to TLS during init.
- `deploy/nginx/tls.conf` is applied to `active.conf` after cert generation for HTTPS redirect + TLS termination.

- `deploy/preflight.sh` validates docker availability, DNS basics, and common port conflicts before live rollout.
- `deploy/deploy-live.sh` runs preflight, build/up, and certificate bootstrap in one command.

- `deploy/post-deploy-check.sh` validates redirect + TLS after go-live from a console environment.
