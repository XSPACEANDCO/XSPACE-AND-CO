import { useRef, useState } from 'react';
import api from '../lib/api';

/* A field that accepts either an uploaded file or a pasted link.

   Both end up as the same thing — a URL stored on the record — so the rest of
   the app never has to care which route a document arrived by. That matters
   in practice: a brochure is usually a PDF on somebody's laptop, while a
   walkthrough is usually already on Drive or YouTube and should stay there
   rather than being copied into our database.

   Uploading is deliberately explicit. Choosing a file does not send it; you
   press Upload. On a phone at a site visit, an accidental tap that starts a
   multi-megabyte upload over mobile data is worth avoiding. */

/* The server enforces this too — this copy only exists to fail fast and say
   something useful before spending the upload. */
const MAX_MB = 8;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name} could not be read`));
    reader.readAsDataURL(file);
  });
}

export default function FileField({
  label,
  hint,
  value,
  onChange,
  accept = 'application/pdf,image/*',
  placeholder = 'https://…  or upload a file',
}) {
  const inputRef = useRef(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; /* so the same file can be picked again after a clear */
    setError('');
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(
        `${(file.size / 1024 / 1024).toFixed(1)} MB is over the ${MAX_MB} MB limit — `
          + 'paste a Drive or YouTube link for anything larger.'
      );
      return;
    }
    setPicked(file);
  }

  async function upload() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await readAsDataUrl(picked);
      const out = await api.files.upload(dataUrl, picked.name);
      onChange(out.url);
      setPicked(null);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  /* A stored value is either one of our uploads or somebody's link. Only the
     first has a filename worth showing. */
  const isUploaded = typeof value === 'string' && value.startsWith('/api/files/');

  return (
    <div className="file-field">
      <span className="ff-label">{label}</span>

      <div className="ff-row">
        <input
          className="ff-url"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button type="button" className="ff-btn" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <input ref={inputRef} type="file" accept={accept} hidden onChange={choose} />
      </div>

      {picked && (
        <div className="ff-picked">
          <span className="ff-name">
            {picked.name} · {(picked.size / 1024).toFixed(0)} KB
          </span>
          <button type="button" className="ff-btn" disabled={busy} onClick={upload}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <button
            type="button"
            className="ff-btn ghost"
            disabled={busy}
            onClick={() => setPicked(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {value && !picked && (
        <div className="ff-picked">
          <a className="ff-name link" href={value} target="_blank" rel="noopener noreferrer">
            {isUploaded ? 'Open uploaded file ↗' : 'Open link ↗'}
          </a>
          <button type="button" className="ff-btn ghost" onClick={() => onChange('')}>
            Clear
          </button>
        </div>
      )}

      {error && <div className="ff-error">{error}</div>}
      {hint && !error && <em className="ff-hint">{hint}</em>}
    </div>
  );
}
