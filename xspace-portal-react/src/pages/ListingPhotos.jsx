import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';

/* Photo upload for a listing.

   Pick files, see them as thumbnails, then upload — each photo has its own
   Upload button, so on a weak connection at a site visit one failure does not
   cost you the batch, and you can drop a bad shot before it ever leaves the
   phone. "Upload all" is there for when they are all fine.

   Images are downscaled in the browser before they are sent. A modern phone
   camera produces 4-8 MB per shot, which is far more resolution than an
   internal listing sheet needs and more than the server will accept. */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/* Draw the image into a canvas no larger than MAX_EDGE on its long side and
   re-encode it as JPEG. Returns a data URL. */
function downscale(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      try {
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read as an image`));
    };
    img.src = url;
  });
}

const sizeOf = (dataUrl) => Math.floor((dataUrl.length * 3) / 4 / 1024);

export default function ListingPhotos({ listingId }) {
  const [photos, setPhotos] = useState([]);
  const [pending, setPending] = useState([]); /* chosen, not yet uploaded */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.listings.photos(listingId);
      setPhotos(out.photos || []);
    } catch (err) {
      setError(err.message || 'Could not load photos');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function choose(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; /* let the same file be picked again after removing it */
    setError('');

    const prepared = [];
    for (const file of files) {
      try {
        const dataUrl = await downscale(file);
        prepared.push({
          key: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl,
          kb: sizeOf(dataUrl),
          state: 'ready',
        });
      } catch (err) {
        setError(err.message || `${file.name} could not be prepared`);
      }
    }
    setPending((p) => [...p, ...prepared]);
  }

  const mark = (key, patch) =>
    setPending((p) => p.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function upload(item) {
    mark(item.key, { state: 'uploading', error: '' });
    try {
      await api.listings.addPhoto(listingId, item.dataUrl, item.name);
      setPending((p) => p.filter((it) => it.key !== item.key));
      await load();
    } catch (err) {
      mark(item.key, { state: 'ready', error: err.message || 'Upload failed' });
    }
  }

  async function uploadAll() {
    /* One at a time: a phone on mobile data handles a queue far better than
       ten parallel multi-megabyte requests. */
    for (const item of pending.filter((it) => it.state === 'ready')) {
      await upload(item);
    }
  }

  async function remove(photo) {
    if (!window.confirm('Remove this photo?')) return;
    try {
      await api.listings.removePhoto(listingId, photo.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not remove that photo');
    }
  }

  const readyCount = pending.filter((p) => p.state === 'ready').length;

  return (
    <div className="listing-photos">
      {error && <div className="listing-error">{error}</div>}

      <div className="lp-pick">
        <button type="button" onClick={() => fileRef.current?.click()}>
          Choose photos
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={choose}
        />
        {readyCount > 1 && (
          <button type="button" className="lp-all" onClick={uploadAll}>
            Upload all {readyCount}
          </button>
        )}
        <span className="small">
          Resized to {MAX_EDGE}px before upload — shoot at any resolution.
        </span>
      </div>

      {pending.length > 0 && (
        <>
          <div className="lp-heading small">Ready to upload</div>
          <div className="lp-grid">
            {pending.map((item) => (
              <div className="lp-item pending" key={item.key}>
                <img src={item.dataUrl} alt={item.name} />
                <div className="lp-meta small">
                  {item.name} • {item.kb} KB
                </div>
                {item.error && <div className="lp-err small">{item.error}</div>}
                <div className="lp-item-actions">
                  <button
                    type="button"
                    disabled={item.state === 'uploading'}
                    onClick={() => upload(item)}
                  >
                    {item.state === 'uploading' ? 'Uploading…' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={item.state === 'uploading'}
                    onClick={() => setPending((p) => p.filter((it) => it.key !== item.key))}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="lp-heading small">
        {loading ? 'Loading photos…' : `Uploaded (${photos.length})`}
      </div>
      {!loading && photos.length === 0 && pending.length === 0 && (
        <div className="small">No photos yet.</div>
      )}
      <div className="lp-grid">
        {photos.map((p) => (
          <div className="lp-item" key={p.id}>
            <img src={p.data_url} alt={p.caption || 'Listing photo'} />
            <div className="lp-meta small">
              {p.caption || 'Photo'} • {Math.round((p.bytes || 0) / 1024)} KB
            </div>
            <div className="lp-item-actions">
              <button type="button" className="ghost" onClick={() => remove(p)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
