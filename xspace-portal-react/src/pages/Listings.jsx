import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import ListingForm, { EMPTY_LISTING, toPayload } from './ListingForm';
import './listings.css';

/* Submitted inventory, from the database.

   Which rows arrive is the server's decision: Founder and Core see every
   listing, a realtor partner sees only what they submitted or were assigned.
   Nothing is filtered here, because the rows that would need hiding never
   leave the server. */

export default function Listings() {
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [canVerify, setCanVerify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LISTING);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [verifying, setVerifying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.listings.list();
      setListings(out.listings || []);
      setCanVerify(Boolean(out.canVerify));
    } catch (err) {
      setError(err.message || 'Could not load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim()) return setFormError('Listing title is required');

    setBusy(true);
    try {
      const out = await api.listings.create(toPayload(form));
      setForm(EMPTY_LISTING);
      setFormOpen(false);
      /* Straight to the listing so photos can be added — they attach to a
         listing id, which only exists once it has been saved. */
      navigate('/listings/' + out.listing.id);
    } catch (err) {
      setFormError(err.message || 'Could not save this listing');
    } finally {
      setBusy(false);
    }
  }

  async function verify(id, title) {
    if (!window.confirm(`Verify "${title}"?\n\nIt leaves this list and is published to Projects.`))
      return;
    setError('');
    setVerifying(id);
    try {
      await api.listings.verify(id);
      navigate('/projects');
    } catch (err) {
      setError(err.message || 'Could not verify that listing');
      setVerifying(null);
    }
  }

  return (
    <div className="page-listings">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>Listings</h1>
            <p className="small">
              Submitted inventory awaiting verification. Once verified, a listing moves to{' '}
              <button className="inline-link" onClick={() => navigate('/projects')}>
                Projects
              </button>
              .
            </p>
          </div>

          <div className="top-bar-actions">
            <button onClick={() => { setFormOpen((o) => !o); setFormError(''); }}>
              {formOpen ? 'Cancel' : '+ Add Listing'}
            </button>
          </div>
        </div>

        {error && <div className="listing-error">{error}</div>}

        {formOpen && (
          <form className="add-listing" onSubmit={submit} autoComplete="off">
            <ListingForm value={form} onChange={setForm} />

            {formError && <div className="listing-error">{formError}</div>}

            <div className="add-actions">
              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save listing'}
              </button>
              <span className="small">
                Only the title is required — the rest can be completed later, and Core fills in
                what they confirm during verification. Photos are added on the next screen,
                once the listing exists.
              </span>
            </div>
          </form>
        )}

        {loading ? (
          <p className="small">Loading listings…</p>
        ) : listings.length === 0 ? (
          <p className="small">
            Nothing waiting to be verified. Use “Add Listing” to submit inventory — verified
            listings are on the Projects page.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Location</th>
                <th>Price</th>
                <th>Submitted By</th>
                <th>Status</th>
                {canVerify && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="title-cell" onClick={() => navigate('/listings/' + l.id)}>
                    <strong>{l.title}</strong>
                    {l.high_demand && <div className="small hot">🔥 High Demand</div>}
                  </td>
                  <td>{l.area || '—'}</td>
                  <td>{l.price || l.base_price || '—'}</td>
                  <td>{l.submitted_by_name || '—'}</td>
                  <td>
                    <span className={'badge ' + (l.verified ? 'verified' : 'unverified')}>
                      {l.verified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  {canVerify && (
                    <td>
                      {!l.verified && (
                        <button
                          className="action-btn"
                          disabled={verifying === l.id}
                          onClick={() => verify(l.id, l.title)}
                        >
                          {verifying === l.id ? 'Verifying…' : 'Verify'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
