# Testing and validation

## Automated checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Unit/local integration tests use synthetic fixtures, not real news. They cover RSS/Atom parsing, canonical URL/hash deduplication, event heuristics, verification state, wire-origin independence, fact-lock invalidation, bilingual edition requirements, numeric/quotation/source consistency, typography fit, SVG escaping, Dhaka scheduling, role permissions, origin checks, private/reserved SSRF destinations, AES-GCM encryption/tampering, provider gating, unknown costs, rate limits, backoff, persistent revision history, publication approval/idempotency, due-job behavior, ambiguity recovery, PNG rendering, suggestion approval, and atomic local rollback.

Testing Library checks accessible controls and honest missing-auth configuration. Playwright drives a real browser against a separate sandbox server and worker, including first-run onboarding, desktop/mobile layout, source management, unconfirmed Facebook profiles, empty Canva template state, manual import, bilingual editing, PNG generation, asset and human approval, manual publication recording, connection failure state, and CSRF rejection. Evidence/lock setup in the browser flow is prepared through the actual command API. Browser output screenshots and failure traces are in ignored `test-results`.

Playwright defaults to `/usr/bin/chromium`. Set `CHROMIUM_PATH` when your browser is elsewhere. If no browser is installed, use your platform's documented browser installer or `PLAYWRIGHT_BROWSERS_PATH=/a/writable/cache npx playwright install chromium`, then point `CHROMIUM_PATH` to that binary. Do not disable TLS verification to download browsers.

## Real PostgreSQL integration tests

Use a disposable database, never production. The tests create and remove their own workspace/profile records but expect the migrations already applied.

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE npm run db:migrate
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE npm test
```

Without `TEST_DATABASE_URL`, the seven database tests are explicitly skipped. With it, they exercise real repository transactions, generated foreign keys, concurrent serialization, rollback, tenant RLS using the actual `authenticated` role, and denial of client access to credential-bearing state. These are **not** Supabase Auth/Storage live tests.

## External verification matrix

| Capability                                | Test status                                   |
| ----------------------------------------- | --------------------------------------------- |
| Local source parsing/deduplication/queues | Executed with synthetic data                  |
| Real PostgreSQL/RLS                       | Executed in disposable Docker Postgres        |
| Local PNG renderer                        | Real Sharp PNG generation executed            |
| UI/desktop/mobile/editor flow             | Real Chromium sandbox tests                   |
| OpenAI HTTP error behavior                | Mocked HTTP responses; no live credentials    |
| Supabase email/Google login and Storage   | Not live-verified                             |
| Canva OAuth/templates/dataset             | Capability gates tested; no live account      |
| Meta/Buffer automatic publication         | Disabled; not live-verified                   |
| Initial publisher feeds                   | Unvalidated; publisher sites blocked by proxy |
| External social post URLs in E2E          | Synthetic editor reports, not real posts      |

Passing a sandbox test does not establish production authentication, live API permission, publisher authorization, source truthfulness, image licensing, or real social publication. Current run counts and outcomes should be reported from actual command output, not assumed from this document.
