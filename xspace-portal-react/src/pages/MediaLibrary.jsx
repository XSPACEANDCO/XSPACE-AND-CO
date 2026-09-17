import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { timeAgo } from '../lib/time';
import { MEDIA_STATES } from '../lib/mediaStatus';
import './media.css';

/* Media Library — edited cuts, and what was decided about them.

   Two groups, deliberately in this order: what still needs a decision, then
   what has been approved. Founder and Core get the review controls; Studio
   sees the same list read-only, so an editor can tell what happened to their
   work without having to ask.

   Approving is what makes a cut final. Sending it back requires a reason,
   because "rejected" with no note gives the editor nothing to act on. */

export default function MediaLibrary() {
  const [media, setMedia] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  /* The item being sent back, and the reason going with it. */
  const [changesFor, setChangesFor] = useState(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.media.library();
      setMedia(out.media || []);
      setCanReview(Boolean(out.canReview));
    } catch (err) {
      setError(err.message || 'Could not load the library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const waiting = useMemo(() => media.filter((m) => m.status === 'delivered'), [media]);
  const approved = useMemo(() => media.filter((m) => m.status === 'approved'), [media]);

  async function approve(item) {
    setError('');
    setBusy(item.id);
    try {
      await api.media.approve(item.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not approve that');
    } finally {
      setBusy(null);
    }
  }

  async function sendBack() {
    if (!notes.trim()) return setError('Say what needs changing — the editor only gets these notes');
    setBusy(changesFor.id);
    try {
      await api.media.requestChanges(changesFor.id, notes.trim());
      setChangesFor(null);
      setNotes('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not send that back');
    } finally {
      setBusy(null);
    }
  }

  function Row({ m }) {
    const state = MEDIA_STATES[m.status] || {};
    return (
      <div className={`media-row${m.status === 'delivered' ? ' flagged' : ''}`}>
        <div className="grow">
          <strong>{m.title}</strong>
          <div className="small muted">
            {m.kind} · shot by {m.uploaded_by_name || 'unknown'}
            {m.edited_by_name ? ` · edited by ${m.edited_by_name}` : ''}
            {m.revision > 0 ? ` · v${m.revision}` : ''}
            {m.edited_at ? ` · ${timeAgo(m.edited_at)}` : ''}
          </div>

          {m.note && <div className="small media-note">Editor: {m.note}</div>}

          {m.status === 'approved' && m.review_notes && (
            <div className="small media-note">
              Approved{m.reviewed_by_name ? ` by ${m.reviewed_by_name}` : ''}: {m.review_notes}
            </div>
          )}

          <div className="media-links">
            {m.edited_url && (
              <a className="media-link" href={m.edited_url} target="_blank" rel="noopener noreferrer">
                Open the edited cut ↗
              </a>
            )}
            {/* The original stays reachable, so a reviewer can compare. */}
            {m.url && (
              <a className="media-link muted-link" href={m.url} target="_blank" rel="noopener noreferrer">
                Original ↗
              </a>
            )}
          </div>
        </div>

        <div className="media-row-actions">
          <span className={`media-badge ${state.tone || ''}`}>{state.label || m.status}</span>
          {canReview && m.status === 'delivered' && (
            <>
              <button className="btn" disabled={busy === m.id} onClick={() => approve(m)}>
                {busy === m.id ? 'Approving…' : 'Approve'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setChangesFor(m); setNotes(''); setError(''); }}
              >
                Request changes
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-media">
      <div className="media-head">
        <div>
          <h1>Media Library</h1>
          <p className="small muted">
            {canReview
              ? 'Edited cuts waiting on your decision, and everything already approved.'
              : 'Edited cuts and what was decided about them.'}
          </p>
        </div>
      </div>

      {error && <div className="media-error">{error}</div>}

      <section className="panel">
        <h4>Waiting on review ({waiting.length})</h4>
        {loading ? (
          <div className="small muted media-empty">Loading…</div>
        ) : waiting.length === 0 ? (
          <div className="small muted media-empty">
            Nothing waiting. Cuts appear here once Studio re-uploads them.
          </div>
        ) : (
          <div className="media-rows">
            {waiting.map((m) => <Row m={m} key={m.id} />)}
          </div>
        )}
      </section>

      <section className="panel">
        <h4>Approved ({approved.length})</h4>
        {approved.length === 0 ? (
          <div className="small muted media-empty">Nothing approved yet.</div>
        ) : (
          <div className="media-rows">
            {approved.map((m) => <Row m={m} key={m.id} />)}
          </div>
        )}
      </section>

      {changesFor && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setChangesFor(null)}
        >
          <div className="modal">
            <h3>Send back for changes</h3>
            <div className="small muted">{changesFor.title}</div>

            <label className="mf-field">
              <span>What needs changing</span>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Be specific — this is all the editor gets"
              />
            </label>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setChangesFor(null)}>Cancel</button>
              <button className="btn" disabled={busy === changesFor.id} onClick={sendBack}>
                {busy === changesFor.id ? 'Sending…' : 'Send back to editor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
