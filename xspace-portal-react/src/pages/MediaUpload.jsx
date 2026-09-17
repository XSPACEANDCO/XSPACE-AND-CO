import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import FileField from '../components/FileField';
import { timeAgo } from '../lib/time';
import { MEDIA_STATES } from '../lib/mediaStatus';
import './media.css';

/* Upload raw media, and watch what Studio does with it.

   Creators and realtors only ever see their own uploads here — that scoping
   is the server's (`/media/mine`), not a filter applied after the fact. */

const KINDS = [
  { key: 'reel', label: 'Reel' },
  { key: 'short', label: 'Short' },
  { key: 'video', label: 'Video' },
  { key: 'photo', label: 'Photo' },
  { key: 'doc', label: 'Document' },
];

const EMPTY = { title: '', kind: 'reel', url: '', note: '' };

export default function MediaUpload() {
  const [mine, setMine] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.media.mine();
      setMine(out.media || []);
    } catch (err) {
      setError(err.message || 'Could not load your uploads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Give this a title so Studio knows what it is');
    if (!form.url.trim()) return setError('Upload the file, or paste a link to it');

    setBusy(true);
    try {
      await api.media.upload({
        title: form.title.trim(),
        kind: form.kind,
        url: form.url.trim(),
        note: form.note.trim() || null,
      });
      setForm(EMPTY);
      setSaved('Sent to Studio');
      setTimeout(() => setSaved(''), 3000);
      await load();
    } catch (err) {
      setError(err.message || 'Could not upload that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-media">
      <div className="media-head">
        <div>
          <h1>Media Upload</h1>
          <p className="small muted">
            Raw reels, shorts and video go straight to Studio for editing.
          </p>
        </div>
      </div>

      {error && <div className="media-error">{error}</div>}

      <form className="panel media-form" onSubmit={submit} autoComplete="off">
        <h4>New upload</h4>
        <div className="media-grid">
          <label className="mf-field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What is this footage of?"
              required
            />
          </label>
          <label className="mf-field">
            <span>Kind</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </label>
        </div>

        <FileField
          label="File or link"
          value={form.url}
          onChange={(url) => setForm({ ...form, url })}
          accept="video/*,image/*"
          placeholder="Drive / Instagram / YouTube link, or upload"
          hint="Long video should be a link — only clips under 8 MB upload here."
        />

        <label className="mf-field">
          <span>Note for the editor</span>
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Anything the editor should know — music, crop, which takes to use"
          />
        </label>

        <div className="media-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Send to Studio'}
          </button>
          {saved && <span className="media-saved">{saved}</span>}
        </div>
      </form>

      <section className="panel">
        <h4>Your uploads</h4>
        <div className="muted small">Only yours — other partners cannot see these, and you cannot see theirs</div>

        {loading ? (
          <div className="small muted media-empty">Loading…</div>
        ) : mine.length === 0 ? (
          <div className="small muted media-empty">Nothing uploaded yet.</div>
        ) : (
          <div className="media-rows">
            {mine.map((m) => {
              const state = MEDIA_STATES[m.status] || {};
              return (
                <div className="media-row" key={m.id}>
                  <div className="grow">
                    <strong>{m.title}</strong>
                    <div className="small muted">
                      {m.kind} · sent {timeAgo(m.created_at)}
                      {m.claimed_by_name ? ` · with ${m.claimed_by_name}` : ''}
                    </div>
                    {/* The uploader sees the outcome, not the internal notes
                        between Studio and the reviewer. */}
                    {m.status === 'approved' && m.edited_url && (
                      <a className="media-link" href={m.edited_url} target="_blank" rel="noopener noreferrer">
                        Watch the finished cut ↗
                      </a>
                    )}
                  </div>
                  <span className={`media-badge ${state.tone || ''}`}>{state.label || m.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
