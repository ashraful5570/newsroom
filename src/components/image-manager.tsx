'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, ImageIcon, Check } from 'lucide-react';
import type { Edition, State } from '@/lib/schema';
import type { WorkspaceProps } from './types';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function ImageManager({ state, run, busy, edition }: WorkspaceProps & { edition: Edition }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const photos = state.media.filter((m) => !m.templateId);
  const image = photos.find((m) => m.id === edition.imageAssetId);
  async function upload(form: HTMLFormElement) {
    setUploading(true);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: new FormData(form) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await client.invalidateQueries({ queryKey: ['state'] });
      setEditing(b.id);
      toast.success('Uploaded. Review the license and focal point before use.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ImageIcon size={14} />
        {image ? 'Change approved image' : 'Choose / upload image'}
      </Button>
      {image && (
        <small>
          Selected: {image.rights.attribution || image.rights.source}
          {image.rights.illustration ? ' · AI-generated illustration' : ''}
        </small>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Image library & licensing" wide>
        <div className="notice">
          Visual similarity is not evidence that a photo depicts an event. Upload only authorized
          imagery. The source image is a candidate, not a license grant. Rights are editor
          declarations, never automatic verification.
        </div>
        <div className="image-library">
          {photos.map((m) => (
            <div className="panel image-library-card" key={m.id}>
              <Image
                unoptimized
                src={`/api/media/${m.id}`}
                width={m.width}
                height={m.height}
                alt={m.rights.attribution || 'Uploaded image candidate'}
                className="asset-preview"
              />
              <b>{m.rights.source}</b>
              <small>
                {m.rights.license} ·{' '}
                {m.rights.approved ? 'Rights reviewed' : 'Rights review required'}
              </small>
              <div className="button-row">
                <Button variant="outline" onClick={() => setEditing(m.id)}>
                  License & crop
                </Button>
                <Button
                  disabled={!m.rights.approved || busy}
                  onClick={() =>
                    void run('media.select', { id: edition.id, assetId: m.id })
                      .then(() => setOpen(false))
                      .catch(() => {})
                  }
                >
                  Use image
                </Button>
              </div>
            </div>
          ))}
        </div>
        <details open={!photos.length}>
          <summary>Upload an authorized image</summary>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void upload(e.currentTarget);
            }}
          >
            <label>
              PNG / JPEG / WebP, up to 8 MB
              <input type="file" accept="image/png,image/jpeg,image/webp" name="file" required />
            </label>
            <div className="form-grid">
              <label>
                Image source / creator
                <input name="source" required />
              </label>
              <label>
                License / permission reference
                <input name="license" required />
              </label>
              <label>
                Attribution
                <input name="attribution" />
              </label>
              <label>
                Allowed uses
                <input
                  name="allowedUses"
                  required
                  placeholder="e.g. authorized editorial social posts"
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" name="illustration" />
              AI-generated illustration (will be visibly labeled)
            </label>
            <Button disabled={uploading}>
              <Upload size={15} />
              {uploading ? 'Uploading…' : 'Upload for review'}
            </Button>
          </form>
        </details>
      </Dialog>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Rights review & focal-point crop"
      >
        {editing && photos.find((m) => m.id === editing) && (
          <RightsForm
            {...{ state, run, busy }}
            asset={photos.find((m) => m.id === editing)!}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}
function RightsForm({
  asset,
  run,
  busy,
  onDone,
}: WorkspaceProps & { asset: State['media'][number]; onDone: () => void }) {
  const [focal, setFocal] = useState({ x: asset.focalX, y: asset.focalY });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run('media.rights', {
          id: asset.id,
          rights: {
            source: f.get('source'),
            license: f.get('license'),
            attribution: f.get('attribution'),
            allowedUses: f.get('allowedUses'),
            expiresAt: f.get('expiresAt') ? `${f.get('expiresAt')}T23:59:59+06:00` : null,
            approved: f.get('approved') === 'on',
            illustration: f.get('illustration') === 'on',
          },
          focalX: focal.x,
          focalY: focal.y,
        })
          .then(onDone)
          .catch(() => {});
      }}
    >
      <div
        className="focal-preview"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setFocal({
            x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
            y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
          });
        }}
      >
        <Image
          unoptimized
          src={`/api/media/${asset.id}`}
          width={asset.width}
          height={asset.height}
          alt="Click to set image focal point"
          className="asset-preview"
        />
        <span style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}>+</span>
      </div>
      <small>
        Click the image to set the focal point. Inspect the final crop so faces and important
        subjects remain visible.
      </small>
      <div className="form-grid">
        <label>
          Horizontal focal position
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={focal.x}
            onChange={(e) => setFocal({ ...focal, x: Number(e.target.value) })}
          />
        </label>
        <label>
          Vertical focal position
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={focal.y}
            onChange={(e) => setFocal({ ...focal, y: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Source / creator
        <input name="source" defaultValue={asset.rights.source} required />
      </label>
      <label>
        License / permission
        <input name="license" defaultValue={asset.rights.license} required />
      </label>
      <label>
        Attribution
        <input name="attribution" defaultValue={asset.rights.attribution} />
      </label>
      <label>
        Allowed uses
        <input name="allowedUses" defaultValue={asset.rights.allowedUses} required />
      </label>
      <label>
        Expiry, if applicable (Dhaka date)
        <input type="date" name="expiresAt" defaultValue={asset.rights.expiresAt?.slice(0, 10)} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="illustration" defaultChecked={asset.rights.illustration} />
        AI-generated illustration, visibly labeled
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="approved" defaultChecked={asset.rights.approved} />I reviewed
        the license and have permission for these uses.
      </label>
      <Button disabled={busy}>
        <Check size={15} />
        Save rights & focal point
      </Button>
    </form>
  );
}
