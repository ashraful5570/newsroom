import { randomUUID } from 'node:crypto';
import { seed } from '../src/lib/seed';
import { ingest, manualContent } from '../src/lib/editorial';
import type { Facts, Edition } from '../src/lib/schema';
export function fixture() {
  const state = seed();
  const source = state.sources[0];
  const story = ingest(
    state,
    source,
    {
      title: 'Campus library opens reading room',
      url: 'https://example.com/library',
      body: 'The campus library opened a reading room on 18 October. The library announced the opening.',
      publishedAt: '2026-10-18T06:00:00Z',
    },
    true
  )!;
  story.facts = {
    version: 1,
    claims: [
      {
        id: randomUUID(),
        text: 'The campus library opened a reading room on 18 October.',
        type: 'fact',
        status: 'Unverified',
        conflict: '',
        evidence: [
          {
            url: story.url,
            publisher: source.name,
            origin: source.name,
            excerpt: story.body,
            retrievedAt: null,
          },
        ],
      },
    ],
    locked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: 'test-editor',
    highRisk: false,
    riskApproved: false,
    notes: '',
  };
  const content = manualContent(story, state.portals[0]);
  content.headlinesBn = [
    'ক্যাম্পাস লাইব্রেরিতে পাঠকক্ষ চালু',
    'পাঠকক্ষ খুলেছে ক্যাম্পাস লাইব্রেরি',
  ];
  content.articleBn = 'ক্যাম্পাস লাইব্রেরি একটি পাঠকক্ষ চালু করেছে।';
  content.caption = 'A campus library reading room opened, according to the library.';
  const edition: Edition = {
    id: randomUUID(),
    storyId: story.id,
    portalId: state.portals[0].id,
    factVersion: 1,
    content,
    status: 'Draft',
    flags: [],
    aiChecked: false,
    approvedBy: null,
    approvedAt: null,
    designAssetId: null,
    imageAssetId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
    generationMode: 'manual',
    comment: '',
  };
  state.editions.push(edition);
  return { state, story, edition, facts: story.facts as Facts };
}
