import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import './projecttag.css';

/* Which project a piece of media is for — on every Studio screen, so an
   editor always knows what they are cutting and can open the project's
   listing sheet for its specification.

   When nothing is linked it says so, and anyone who can process media
   (Studio, Founder, Core) can link it there and then: pass `projects`
   (from api.projects.list()) and `onLinked` to offer that. */
export default function ProjectTag({ item, projects, onLinked }) {
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');

  async function link(projectId) {
    if (!projectId) return;
    setError('');
    try {
      await api.media.updateMeta(item.id, { projectId });
      setLinking(false);
      onLinked?.();
    } catch (err) {
      setError(err.message || 'Could not link that project');
    }
  }

  if (item.project_id) {
    return (
      <div className="ptag">
        <span className="ptag-name">
          🏗️ {item.project_name || 'Project'}
          {item.project_area ? ` · ${item.project_area}` : ''}
        </span>
        {item.project_listing_id && (
          <button
            type="button"
            className="ptag-open"
            onClick={() => navigate('/listings/' + item.project_listing_id)}
          >
            Open listing sheet
          </button>
        )}
      </div>
    );
  }

  const canLink = Array.isArray(projects) && projects.length > 0 && onLinked;
  return (
    <div className="ptag ptag-missing">
      <span className="ptag-name">⚠️ No project linked — check the brief or ask the uploader</span>
      {canLink && !linking && (
        <button type="button" className="ptag-open" onClick={() => setLinking(true)}>
          Link a project
        </button>
      )}
      {canLink && linking && (
        <select
          className="ptag-select"
          defaultValue=""
          onChange={(e) => link(e.target.value)}
          aria-label={`Project for ${item.title}`}
        >
          <option value="" disabled>Choose the project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
      {error && <span className="ptag-error">{error}</span>}
    </div>
  );
}
