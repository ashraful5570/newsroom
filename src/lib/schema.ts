import { z } from 'zod';
export const id = z.uuid();
export const webUrl = z.url().refine((raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}, 'Use an HTTPS URL without embedded credentials.');
export const languages = ['en', 'bn'] as const;
export const statuses = [
  'Draft',
  'Awaiting Review',
  'Approved',
  'Scheduled',
  'Publishing',
  'Published',
  'Partially Published',
  'Failed',
  'Requires Manual Action',
] as const;
export const verificationStates = [
  'Unverified',
  'Partially Verified',
  'Verified',
  'Conflicting Sources',
  'Needs Editorial Review',
] as const;
export const sourceSchema = z.object({
  id,
  name: z.string().min(2).max(120),
  url: webUrl.or(z.literal('')),
  sourceType: z.enum(['rss', 'atom', 'website', 'sitemap', 'api', 'facebook', 'manual']),
  language: z.enum(['en', 'bn']),
  country: z.string().max(80),
  category: z.string().max(80),
  priority: z.number().int().min(1).max(5),
  enabled: z.boolean(),
  maxStories: z.number().int().min(1).max(100),
  ingestionPolicy: z.enum(['manual', 'feed', 'authorized-api', 'public-extraction']),
  status: z.string(),
  lastCheckedAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  failures: z.array(z.string()).max(20),
  reliability: z.string().max(1000),
});
export const portalSchema = z.object({
  id,
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  language: z.enum(['en', 'bn']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logo: z.string().max(2000),
  style: z.string().max(3000),
  captionStyle: z.string().max(2000),
  hashtags: z.array(z.string()).max(10),
  templateIds: z.array(id),
  postingDefaults: z.string().max(2000),
});
export const claimSchema = z.object({
  id,
  text: z.string().min(1).max(3000),
  type: z.enum(['fact', 'quote', 'number', 'date', 'identity', 'inference']),
  evidence: z.array(
    z.object({
      url: webUrl,
      publisher: z.string().max(120),
      origin: z.string().max(120),
      excerpt: z.string().max(5000),
      retrievedAt: z.string().nullable(),
    })
  ),
  status: z.enum(verificationStates),
  conflict: z.string().max(3000),
});
export const factSchema = z.object({
  version: z.number().int().positive(),
  claims: z.array(claimSchema).max(100),
  locked: z.boolean(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  highRisk: z.boolean(),
  riskApproved: z.boolean(),
  notes: z.string().max(5000),
});
export const storySchema = z.object({
  id,
  title: z.string().min(1).max(1000),
  url: webUrl,
  publisher: z.string(),
  sourceId: id,
  language: z.enum(languages),
  category: z.string(),
  publishedAt: z.string().nullable(),
  discoveredAt: z.string(),
  body: z.string().max(100000),
  summary: z.string(),
  image: z.string().nullable(),
  author: z.string().nullable(),
  fingerprint: z.string(),
  clusterId: id,
  relatedUrls: z.array(webUrl),
  score: z.number(),
  rationale: z.array(z.string()),
  extractionConfidence: z.enum(['feed', 'metadata', 'manual']),
  selected: z.boolean(),
  facts: factSchema,
});
export const contentSchema = z.object({
  headlinesBn: z.array(z.string().min(1)).length(2),
  headlineEn: z.string().min(1),
  alternateEn: z.string(),
  articleEn: z.string().min(1),
  articleBn: z.string().min(1),
  summaryEn: z.string(),
  summaryBn: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).max(5),
  imageKeywordsEn: z.array(z.string()),
  imageKeywordsBn: z.array(z.string()),
  seo: z.object({ title: z.string(), description: z.string(), slug: z.string() }),
  sourceUrls: z.array(webUrl),
});
export const editionSchema = z.object({
  id,
  storyId: id,
  portalId: id,
  factVersion: z.number(),
  content: contentSchema,
  status: z.enum(statuses),
  flags: z.array(z.string()),
  aiChecked: z.boolean(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  designAssetId: id.nullable(),
  imageAssetId: id.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number(),
  generationMode: z.enum(['openai', 'manual']),
  comment: z.string(),
});
export const templateSchema = z.object({
  id,
  name: z.string().min(2).max(100),
  kind: z.enum(['fallback', 'canva-design', 'canva-brand']),
  reference: z.string().max(500),
  width: z.number().int().min(320).max(4096),
  height: z.number().int().min(320).max(4096),
  portalIds: z.array(id),
  fields: z.record(z.string(), z.enum(['headline', 'supportingText', 'image', 'logo', 'source'])),
  maxLines: z.number().int().min(1).max(8),
  minFont: z.number().int().min(16).max(96),
  margin: z.number().int().min(16).max(200),
  status: z.string(),
  eligible: z.boolean(),
});
export const mediaSchema = z.object({
  id,
  editionId: id.nullable(),
  filename: z.string(),
  mime: z.string(),
  width: z.number(),
  height: z.number(),
  rights: z.object({
    source: z.string(),
    license: z.string(),
    attribution: z.string(),
    allowedUses: z.string(),
    expiresAt: z.string().nullable(),
    approved: z.boolean(),
    illustration: z.boolean(),
  }),
  diagnostics: z.array(z.string()),
  approved: z.boolean(),
  templateId: id.nullable(),
  canvaUrl: z.string().nullable(),
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
  createdAt: z.string(),
});
export const jobSchema = z.object({
  id,
  type: z.enum(['discovery', 'generate', 'design', 'publish']),
  status: z.enum([
    'queued',
    'running',
    'succeeded',
    'failed',
    'dead',
    'manual',
    'ambiguous',
    'cancelled',
  ]),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  attempts: z.number(),
  runAt: z.string(),
  leaseUntil: z.string().nullable(),
  leaseToken: z.string().nullable(),
  progress: z.number(),
  message: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const publicationSchema = z.object({
  id,
  editionId: id,
  destinationId: id,
  jobId: id,
  status: z.enum(statuses),
  scheduledAt: z.string().nullable(),
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  response: z.string().nullable(),
  createdAt: z.string(),
  commentStatus: z.string(),
});
export const connectionSchema = z.object({
  id,
  provider: z.enum(['canva', 'meta', 'buffer', 'openai', 'supabase']),
  name: z.string(),
  accountId: z.string(),
  status: z.enum(['Disconnected', 'Connected', 'Error']),
  lastSuccess: z.string().nullable(),
  lastError: z.string().nullable(),
  permissions: z.array(z.string()),
  tokenEncrypted: z.string().nullable(),
});
export const revisionSchema = z.object({
  id,
  editionId: id,
  version: z.number(),
  content: contentSchema,
  actor: z.string(),
  createdAt: z.string(),
});
export const stateSchema = z.object({
  workspace: z.object({
    id,
    name: z.string(),
    onboardingStep: z.number().int().min(0).max(10),
    onboarded: z.boolean(),
    budgetUsd: z.number().nonnegative(),
    generationPreferences: z.string().max(3000),
  }),
  sources: z.array(sourceSchema),
  portals: z.array(portalSchema),
  stories: z.array(storySchema),
  editions: z.array(editionSchema),
  templates: z.array(templateSchema),
  media: z.array(mediaSchema),
  jobs: z.array(jobSchema),
  publications: z.array(publicationSchema),
  connections: z.array(connectionSchema),
  factRevisions: z
    .array(z.object({ id, storyId: id, facts: factSchema, actor: z.string(), at: z.string() }))
    .default([]),
  revisions: z.array(revisionSchema),
  retrievedEvidence: z
    .array(z.object({ id, url: webUrl, excerpt: z.string(), retrievedAt: z.string() }))
    .default([]),
  sourceItems: z
    .array(
      z.object({
        id,
        storyId: id,
        sourceId: id,
        url: webUrl,
        title: z.string(),
        body: z.string(),
        publishedAt: z.string().nullable(),
      })
    )
    .default([]),
  events: z.array(
    z.object({
      id,
      at: z.string(),
      level: z.enum(['info', 'error', 'warning']),
      message: z.string(),
      actor: z.string(),
    })
  ),
  usage: z.array(
    z.object({
      id,
      at: z.string(),
      provider: z.string(),
      model: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      estimatedCostUsd: z.number().nullable(),
    })
  ),
  suggestions: z.array(
    z.object({
      id,
      name: z.string(),
      url: webUrl,
      category: z.string(),
      language: z.enum(languages),
      reason: z.string(),
      method: z.string(),
      decision: z.enum(['pending', 'added', 'rejected']),
    })
  ),
});
export type State = z.infer<typeof stateSchema>;
export type Story = z.infer<typeof storySchema>;
export type Edition = z.infer<typeof editionSchema>;
export type Portal = z.infer<typeof portalSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Facts = z.infer<typeof factSchema>;
export type Content = z.infer<typeof contentSchema>;
export const commandSchema = z.object({
  action: z.string().max(80),
  input: z.record(z.string(), z.unknown()).default({}),
});
