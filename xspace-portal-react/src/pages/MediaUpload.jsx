import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import FileField from '../components/FileField';
import { timeAgo } from '../lib/time';
import { MEDIA_STATES } from '../lib/mediaStatus';
import { canAccess } from '../lib/roleConfig';
import { useDashboard } from './dashboard/DashboardStore';
import './media.css';

/* Upload raw media, and watch what Studio does with it.

   Creators and realtors only ever see their own uploads here — that scoping
   is the server's (`/media/mine`), not a filter applied after the fact.

   The file is optional: without one this is a production request ("a reel of
   this project by Friday"), and it sits in Studio's queue as waiting on raw
   media until the footage is attached from the list below. ?request=1 opens
   the form in that mode. */

const KINDS = [
  { key: 'reel', label: 'Reel' },
  { key: 'short', label: 'Short' },
  { key: 'video', label: 'Video' },
  { key: 'photo', label: 'Photo' },
  { key: 'doc', label: 'Document' },
];

const EMPTY = { title: '', kind: 'reel', url: '', note: '', dueAt: '', priority: 'normal', projectId: '', assignTo: '' };

/* Studio, Founder and Core schedule the queue; everyone else just asks. */
const SCHEDULERS = ['studio', 'founder', 'core'];

export default function MediaUpload() {
  const { role } = useDashboard();
  const [params] = useSearchParams();
  const isRequest = params.get('request') === '1';

  const [mine, setMine] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [attaching, setAttaching] = useState(null);
  const [attachUrl, setAttachUrl] = useState('');

  const schedules = SCHEDULERS.includes(role);
  const internal = role === 'founder' || role === 'core';

  /* Founder/Core can hand a brief to a creator or a task to a Studio editor;
     the person is notified in the portal. */
  const [assignees, setAssignees] = useState([]);
  useEffect(() => {
    if (!internal) return;
    Promise.all([
      api.users.creators({ status: 'active', limit: 100 }),
      api.users.studios({ status: 'active', limit: 100 }),
    ])
      .then(([c, st]) => setAssignees([...(c.partners || []), ...(st.partners || [])]))
      .catch(() => setAssignees([]));
  }, [internal]);
  const assignee = assignees.find((a) => a.id === form.assignTo);

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

  /* Linking content to a project is what groups Studio's work by project.
     Realtors do not have the Projects module, so they are not offered it. */
  useEffect(() => {
    if (!role || !canAccess('projects', role)) return;
    api.projects
      .list()
      .then((out) => setProjects(out.projects || []))
      .catch(() => setProjects([]));
  }, [role]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) return setError('Give this a title so Studio knows what it is');
    if (!isRequest && !form.url.trim()) {
      if (!form.assignTo) {
        return setError('Upload the file or paste a link — or make this a production request instead');
      }
    }

    setBusy(true);
    try {
      await api.media.upload({
        title: form.title.trim(),
        kind: form.kind,
        url: form.url.trim() || null,
        note: form.note.trim() || null,
        projectId: form.projectId || null,
        dueAt: form.dueAt || null,
        ...(schedules ? { priority: form.priority } : {}),
        ...(form.assignTo ? { assignTo: form.assignTo } : {}),
      });
      setForm(EMPTY);
      setSaved(
        assignee
          ? `Assigned to ${assignee.name}`
          : form.url.trim()
            ? 'Sent to Studio'
            : 'Request sent — attach the footage when you have it'
      );
      setTimeout(() => setSaved(''), 4000);
      await load();
    } catch (err) {
      setError(err.message || 'Could not upload that');
    } finally {
      setBusy(false);
    }
  }

  async function attach(id) {
    if (!attachUrl.trim()) return setError('Upload the file, or paste a link to it');
    setError('');
    setBusy(true);
    try {
      await api.media.updateMeta(id, { url: attachUrl.trim() });
      setAttaching(null);
      setAttachUrl('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not attach that');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-media">
      <div className="media-head">
        <div>
          <h1>{isRequest ? 'New Production Request' : 'Media Upload'}</h1>
          <p className="small muted">
            {isRequest
              ? 'Ask Studio for a piece of content. Footage is optional now — attach it when it arrives.'
              : 'Raw reels, shorts and video go straight to Studio for editing.'}
          </p>
        </div>
      </div>

      {error && <div className="media-error">{error}</div>}

      <form className="panel media-form" onSubmit={submit} autoComplete="off">
        <h4>{isRequest ? 'Request' : 'New upload'}</h4>
        <div className="media-grid">
          <label className="mf-field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={set('title')}
              placeholder={isRequest ? 'e.g. Kokapet 3 BHK Reel' : 'What is this footage of?'}
              required
            />
          </label>
          <label className="mf-field">
            <span>Kind</span>
            <select value={form.kind} onChange={set('kind')}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </select>
          </label>
          {projects.length > 0 && (
            <label className="mf-field">
              <span>Project (optional)</span>
              <select value={form.projectId} onChange={set('projectId')}>
                <option value="">Not linked to a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="mf-field">
            <span>{schedules ? 'Due' : 'Wanted by (optional)'}</span>
            <input type="datetime-local" value={form.dueAt} onChange={set('dueAt')} />
          </label>
          {internal && assignees.length > 0 && (
            <label className="mf-field">
              <span>Assign to (optional)</span>
              <select value={form.assignTo} onChange={set('assignTo')}>
                <option value="">Nobody — open request</option>
                <optgroup label="Creator partners (content brief)">
                  {assignees.filter((a) => a.role === 'creator').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Xspace Studio (production task)">
                  {assignees.filter((a) => a.role === 'studio').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}
          {schedules && (
            <label className="mf-field">
              <span>Priority</span>
              <select value={form.priority} onChange={set('priority')}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
          )}
        </div>

        <FileField
          label={isRequest ? 'Footage (optional)' : 'File or link'}
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
            onChange={set('note')}
            placeholder="Anything the editor should know — music, crop, which takes to use, price to show"
          />
        </label>

        <div className="media-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : assignee ? `Assign to ${assignee.name}` : isRequest ? 'Send Request' : 'Send to Studio'}
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
                      {m.project_name ? ` · ${m.project_name}` : ''}
                      {m.claimed_by_name ? ` · with ${m.claimed_by_name}` : ''}
                    </div>
                    {/* Sent back to you: why, and where to resubmit. */}
                    {m.blocked_on === 'creator_feedback' && m.review_notes && (
                      <div className="media-callout">
                        <strong>Revision requested:</strong> {m.review_notes}
                      </div>
                    )}
                    {(!m.url || m.blocked_on === 'creator_feedback') && attaching !== m.id && (
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ marginTop: 6 }}
                        onClick={() => { setAttaching(m.id); setAttachUrl(''); }}
                      >
                        {m.url ? 'Attach revised content' : 'Attach footage'}
                      </button>
                    )}
                    {attaching === m.id && (
                      <div style={{ marginTop: 8 }}>
                        <FileField
                          label="Footage"
                          value={attachUrl}
                          onChange={setAttachUrl}
                          accept="video/*,image/*"
                          placeholder="Drive / Instagram / YouTube link, or upload"
                        />
                        <div className="media-actions">
                          <button type="button" className="btn" disabled={busy} onClick={() => attach(m.id)}>
                            Attach
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => setAttaching(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {/* The uploader sees the outcome, not the internal notes
                        between Studio and the reviewer. */}
                    {m.status === 'approved' && m.edited_url && (
                      <a className="media-link" href={m.edited_url} target="_blank" rel="noopener noreferrer">
                        Watch the finished cut ↗
                      </a>
                    )}
                  </div>
                  <span className={`media-badge ${state.tone || ''}`}>
                    {m.blocked_on === 'creator_feedback'
                      ? 'Revision requested'
                      : !m.url && m.status === 'pending' ? 'Waiting for footage' : state.label || m.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
