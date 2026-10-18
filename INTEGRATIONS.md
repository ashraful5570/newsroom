# Integrations and evidence

## Documentation inspection

During implementation, read-only requests to the following official documentation and publisher sites returned `Tunnel connection failed: 403 Forbidden` from the environment proxy:

- https://platform.openai.com/docs/api-reference/responses/create
- https://www.canva.dev/docs/connect/
- https://www.canva.dev/docs/connect/autofill-guide/
- https://developers.facebook.com/docs/pages-api/posts/
- https://buffer.com/developers/api
- The Business Standard, Prothom Alo, The Daily Star, and Kaler Kantho homepages.

This is a network-policy observation, **not evidence that the services or credentials are invalid**. No provider documentation was successfully read and no external provider authentication test passed. Required host additions were saved to the environment configuration draft. Saving a draft does not apply runtime policy or publish the environment. Once allowed, inspect current official documentation, account access, scopes, and pricing before enabling any contract.

## OpenAI

Server variables: `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional current per-million-token input/output prices. The implementation assumes the established `/v1/models` and `/v1/responses` contracts. A live settings test checks that the configured model is listed; it does not guarantee that model supports every structured-output feature. Generation validates model JSON with Zod, performs a second AI consistency pass, applies deterministic number/date/quote/source URL checks, and still requires human review. External news text is data and no model tools are enabled. `store:false` is sent.

API use is paid according to the account and model. There is no unlimited-free claim. Unknown pricing is shown as unknown. The workspace budget is a best-effort usage alert, not a hard provider billing cap. Set provider account limits. Image generation is not included or implicitly free.

## Supabase

Configure a project, email sign-in and Google OAuth, redirect URLs, public URL/anon key, a server-only service role, and a direct/pooler database URL. Run migrations with an administrative migration connection. Application database connections must be server-only and able to access the state and projection tables. All client-owned rows use RLS; server routes independently check membership. The private `newsroom-media` bucket is created by the second migration if the Storage schema exists. Auth and Storage were **not tested live** without a project. Real PostgreSQL transactions and RLS were tested separately in Docker.

## Canva Connect

Start with zero templates. Use Settings → Integrations → Connect after current official documentation and app eligibility are reviewed. Register a Canva design reference or Brand Template in Templates, map exact dataset keys, and assign portals. Arbitrary existing designs are not assumed to expose editable fields.

`CANVA_DOCS_VERIFIED=true` and `CANVA_API_CONFIG` explicitly gate the configurable adapter. The JSON contract accepts:

```json
{
  "apiBase": "https://api.canva.com",
  "authorizeUrl": "https://www.canva.com/REPLACE_FROM_OFFICIAL_DOCUMENTATION",
  "tokenUrl": "https://api.canva.com/REPLACE_FROM_OFFICIAL_DOCUMENTATION",
  "profilePath": "/REPLACE_FROM_OFFICIAL_DOCUMENTATION",
  "scopes": [],
  "brandTemplatesPath": "/REPLACE_FROM_OFFICIAL_DOCUMENTATION",
  "datasetPath": "/REPLACE_FROM_OFFICIAL_DOCUMENTATION/{id}"
}
```

This is a **configuration shape, not a working provider contract**. Do not copy the replacement paths as endpoints. Client ID, client secret, callback URI, scope approval, PKCE/token-auth requirements, and plan eligibility must match current Canva documentation. Optional server access-token binding can be tested; tokens are encrypted before retention. OAuth refresh/expiry management and automatic Canva autofill/export are not complete and must be added and live-tested before enabling full Canva automation. Brand Template list/dataset inspection is functional when a verified contract and authorized token are supplied. The Test Template action generates real synthetic PNG previews for the built-in compositor and clearly reports the Canva prerequisite instead of fabricating a Canva result.

Fallback: create an original built-in layout, render PNG, review and download. Registered Canva design references can be opened manually. A fallback PNG is not a natively editable Canva document; Canva may support a manual image upload in its own UI. Do not imply automatic native text editing or guaranteed import conversion.

## Meta / Buffer

These publishers are typed adapters with explicit unsupported-capability responses. No automatic post or comment request is made. Current permissions/account eligibility and publishing contracts remain unverified. Meta support is limited to authorized Page/professional-account flows; no protected Facebook scraping occurs. Buffer access is optional and depends on its current offering and account.

Working fallback: approve an edition and graphic, choose a destination, prepare or schedule a manual action, copy caption/comment, download media, publish on the platform, and record the actual post URL and ID. Records are labeled **editor-reported, not API-verified**. The worker never fabricates success. Account connection success alone does not enable automatic publishing. Disconnection clears local encrypted tokens; revoke provider grants in the provider account too.

## Publishers and additional sources

Initial publisher websites are profiles, disabled until permitted retrieval is configured. Discover feeds parses actual alternate links and validates entries; it never guesses `/rss` paths. Manual import works immediately for authorized text. Source suggestions are curated starting points for owner review, not live AI-reliability assessments. Adding a suggestion does not enable it.

Sozoo Today, Cablgram, and Bongo Wiki have no supplied official URLs. The UI keeps them awaiting confirmation and supports manual URL/text import. RSS/Atom ingestion works for permitted public HTTPS feeds; website/news-sitemap extraction requires recorded owner permission and robots.txt compliance; generic API profiles still require a future documented adapter. No robots, login, paywall, CAPTCHA, or access-control bypass is attempted.

External ingestion uses DNS-pinned HTTPS for arbitrary hosts. In a managed environment with proxy-resolved DNS, exact admin-reviewed SOURCE_PROXY_TRUSTED_HOSTS can use the trusted HTTPS proxy with URL validation, bounded bodies, and explicit redirect-host review. That mode relies on the trusted proxy and reviewed public host identities rather than local DNS pinning. NODE_USE_ENV_PROXY=1 is enabled by the run scripts. TLS verification remains enabled. Supply an appropriately scoped allowlist. Publisher licensing and terms must be reviewed by the owner.
