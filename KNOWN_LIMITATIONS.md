# Known limitations and release scope

This is a working private-editorial application, with production-oriented boundaries. It is **not a complete production release of every capability in the master specification**.

Implemented locally: persistent source/portal/template configuration, ten-step editable onboarding, RSS/Atom parsing and permitted-feed discovery, manual imports, canonical dedupe, heuristic event clusters with retained source items, interest rationale, fact ledger/version locks, editorial approval invalidation, manual English/Bangla editions, OpenAI structured-output adapter, revision history, real PNG rendering, image uploads/rights/focal crop, manual publishing with actual URL recording, durable scheduling, progress, retries/dead letters, dashboard/usage, PWA shell, tenant/auth checks, RLS, and deployment files.

Outstanding or gated:

- No external provider has been authenticated live. Supabase Google/email login and Storage require a real project and validation.
- Canva OAuth transport, design registration, and configurable template/dataset reads exist. Current API docs/eligibility are unverified. Automatic Canva autofill, export polling, refresh-token management, and supported native editable-design generation are not implemented. Built-in graphics work without them.
- Meta and Buffer automatic publish/comment/insights are not implemented. The approved manual publishing fallback is functional. A scheduled manual action requires an editor to complete it; it is not automatic social posting.
- Publisher feeds could not be inspected under the current network policy. No initial feeds are falsely marked validated. Nested sitemap indexes, generic news-API adapters, protected Facebook retrieval, and licensed image search integrations are not implemented. Public article/sitemap extraction requires an explicit owner permission reference and readable robots.txt.
- Clustering uses normalized headlines, hashes, and token overlap, not embeddings. There is no model-based semantic dedupe, semantic image relevance/similarity, face detector, or automatic claim extraction. Candidate groups may be wrong; compare sources manually.
- Full-edition generation and targeted headline/article/caption replacement are implemented. Targeted regeneration currently generates a complete candidate then applies only the selected fields, so API cost is similar to full generation. Portal comparisons and revision-field comparisons are available; graphical word-by-word diffs and automated accurate headline shortening remain future work.
- Deterministic consistency checks cover numeric/date tokens, quotations, and evidence URLs. They cannot prove cross-language named-entity identity or causal equivalence. The AI consistency pass can also be wrong. Human approval remains mandatory.
- Verification origin independence, source reliability, imagery licenses, expiry, and publication URLs depend on editor assertions. No external fact-checking or social-URL verification is claimed.
- The original built-in layout has conservative width heuristics, not exact browser/Pango measurement. Inspect exported Bangla at target size; fit estimates cannot prove the absence of visual overflow. No carousel renderer is supplied.
- Per-portal logo/style metadata is editable, but the built-in layout uses text branding and its own design rather than reproducing a supplied Canva layout. No templates were supplied.
- State is a bounded workspace aggregate with transactional relational projections. Large SaaS traffic, unbounded history, streaming exports, distributed ingress throttling, tenant switching/invitations, subscription enforcement, and billing require additional work. Owner/editor/viewer are enforced server-side; team management UI is not included.
- API cost estimates are configurable and may lag pricing. Usage alerts cannot guarantee a spending ceiling or account for all failed/in-flight calls. Server logs and audit history are bounded; connect an external observability/alert service for production.
- Uploads are limited and normalized by Sharp. Orphaned assets after a rolled-back write need a retention cleanup job. Current request size checks supplement server body limits; configure ingress limits too.
- Sandbox locks deliberately fail on stale lock detection rather than risk stealing a lock. Stop processes before removing a stale lock. Sandbox mode bypasses auth and must never be public.
- The PWA has an offline notice, not offline editorial editing or sync. Android packaging is documentation only. WCAG-conscious layout and keyboard focus are implemented; no formal accessibility certification is claimed.

No billing, fabricated news, fabricated verification, fabricated social success, or unlimited-free claims are included. These limitations are explicit so deployers can decide what remains before production use.
