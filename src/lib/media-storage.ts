import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sandbox, required } from './config';
export function mediaDirectory() {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), '.data'), 'media');
}
function storage() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(process.env.SUPABASE_MEDIA_BUCKET || 'newsroom-media');
}
export async function saveMedia(filename: string, data: Buffer) {
  if (!/^[a-f0-9-]{36}\.png$/.test(filename)) throw new Error('Invalid filename.');
  if (sandbox()) {
    await mkdir(mediaDirectory(), { recursive: true, mode: 0o700 });
    await writeFile(path.join(mediaDirectory(), filename), data, { mode: 0o600 });
  } else {
    const { error } = await storage().upload(filename, data, {
      contentType: 'image/png',
      upsert: false,
    });
    if (error) throw new Error(`Media storage upload failed: ${error.message}`);
  }
}
export async function loadMedia(filename: string) {
  if (!/^[a-f0-9-]{36}\.png$/.test(filename)) throw new Error('Invalid filename.');
  if (sandbox()) return readFile(path.join(mediaDirectory(), filename));
  const { data, error } = await storage().download(filename);
  if (error || !data) throw new Error('Media download failed.');
  return Buffer.from(await data.arrayBuffer());
}
