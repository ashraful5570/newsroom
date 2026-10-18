# Deployment, operations, and recovery

## Before deployment

1. Read KNOWN_LIMITATIONS.md and INTEGRATIONS.md. Full Canva/Meta/Buffer automation is not released. The working publishing path is an explicit manual workflow.
2. Provision a Supabase project. Enable email login and Google OAuth, configure the Google provider credentials, and allow `https://YOUR_APP/auth/callback`. Configure email delivery and test sign-in with an actual owner.
3. Set `NEWSROOM_MODE=production`, HTTPS `APP_URL`, public Supabase URL/anon key, private service-role key, and a server-only `DATABASE_URL`. Use `DATABASE_SSL=true` for hosted databases requiring validated TLS. Never disable certificate verification. Follow your database provider's supported certificate configuration when needed.
4. Generate `ENCRYPTION_KEY` with `openssl rand -hex 32` and retain it in a secret manager. Do not print or commit keys. Losing this key makes stored integration tokens unrecoverable.
5. Run `npm ci` and `npm run db:migrate` from the checkout. The migration runner uses a PostgreSQL advisory lock and an applied-migration journal; repeat runs are safe. Supabase migrations can also be applied through its supported SQL migration tooling. The Storage migration creates a private `newsroom-media` bucket when available.
6. Set Supabase public values **at build time**, then `npm run build`. Run `npm start` for a prepared standalone Node deployment or build Docker's `runner` target for its standalone artifact. Run `npm run worker` in a separate persistent process built from the same revision. Browser and serverless request lifetimes are not a durable scheduler.
7. Restrict access through HTTPS, trusted reverse proxy, security headers, and appropriate ingress request/body limits. Back up PostgreSQL and private media. Do not use the development-mode sandbox publicly.
8. Test real login, authorized workspace reads, cross-workspace access denial, media upload/download, worker restart, and end-to-end editorial approval. A successful local sandbox check does not prove these production services are configured.

## External configuration

OpenAI requires server API key, supported model, current pricing, and provider spending limits. Test the connection in Settings, then perform a small actual generation. Model availability does not alone establish Responses/structured-output support.

Canva/Meta/Buffer require current official API documentation inspection, app/account eligibility, permissions, authorized OAuth callback configuration, and live contract tests. Do not set the docs-verification flags merely to bypass a warning. Native Canva autofill/export and automatic social publishers need further implementation, as documented.

Source fetches require permitted public HTTPS destinations and any applicable publisher authorization. Initial publisher websites have no guessed feeds. The source transport pins locally resolved public DNS destinations. For mandatory proxy-resolved DNS, configure exact admin-reviewed SOURCE_PROXY_TRUSTED_HOSTS and trust your egress proxy to enforce public destinations. Arbitrary new hosts are not silently trusted. Never bypass TLS or publisher access restrictions.

## Docker local setup

Copy `.env.example` to `.env`, choose a local-only database password, and run `docker compose up --build`. Compose validates database readiness, runs migrations, and starts web/worker. The default sandbox uses a shared volume; its data is not the production Supabase state. Switch to production only after configuring a real Supabase project. An external managed Postgres deployment may replace the Compose database and migration connection.

Health endpoint: `GET /api/health` proves the web process is responding, **not** database/provider readiness. `/api/state` proves the authenticated repository path works. Settings shows jobs, actual connection-test outcomes, and last errors.

## Backups and recovery

- Schedule provider-supported PostgreSQL backups and periodic encrypted logical exports. Include all tables, not only the relational projections: `newsroom_state` is authoritative.
- Back up the private Storage bucket and retain the encryption key separately under restricted access. Never place tokens or private exports in the repository.
- Sandbox backups require a stopped worker/web or a consistent filesystem snapshot of `.data/state.json` and `.data/media`.
- Restore backups into an isolated test database; apply outstanding migrations, restore media, and test a representative story/edition with a different environment URL. Disable workers during restore to prevent due jobs from running unexpectedly.
- Review all queued/scheduled/ambiguous publication jobs before restarting the worker. Ambiguous publication outcomes require destination review; never mass-retry them. Non-publication jobs have bounded retries and a dead-letter UI.
- If an OAuth key rotates, reconnect affected providers. If a sandbox lock is stale, stop all readers/workers before removing `.data/state.lock`; do not steal a potentially live lock.
- Integrate structured JSON logs with your hosting log system and alerts. The application does not include a managed alerting or backup service.

## PWA and optional Android packaging

The manifest and service worker support installation where the browser supports it. The offline screen deliberately does not cache private newsroom data. For Android, after validating the deployed PWA over HTTPS, create a separate Capacitor wrapper using the current official Capacitor workflow, configure its remote server URL/allow-navigation policy, and build/sign with Android Studio. No APK, app-store approval, offline sync, or native push notification capability is supplied here.
