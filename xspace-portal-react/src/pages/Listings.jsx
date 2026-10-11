import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import ListingForm, { EMPTY_LAND, EMPTY_LISTING, isLand, toPayload } from './ListingForm';
import LandForm from './LandForm';
import { propertyLabel } from '../lib/leadStatus';
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

  /* null when closed, otherwise which sheet is open: 'property' or 'land'. */
  const [formKind, setFormKind] = useState(null);
  const formOpen = formKind !== null;
  const [form, setForm] = useState(EMPTY_LISTING);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [verifying, setVerifying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  /* "Add Listing" on a dashboard lands here with ?new=1. */
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const wanted = params.get('new');
    if (wanted) {
      const kind = wanted === 'land' ? 'land' : 'property';
      setForm(kind === 'land' ? EMPTY_LAND : EMPTY_LISTING);
      setFormKind(kind);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

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
      setFormKind(null);
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

  function openForm(kind) {
    setFormError('');
    setForm(kind === 'land' ? EMPTY_LAND : EMPTY_LISTING);
    setFormKind(kind);
  }

  /* Founder and Core can delete any listing; a realtor only ever has their
     own rows here, and the server enforces the same. */
  async function remove(id, title) {
    if (!window.confirm(`Delete "${title}"?

Its photos and verification go with it. This cannot be undone.`))
      return;
    setError('');
    setDeleting(id);
    try {
      await api.listings.remove(id);
      setListings((rows) => rows.filter((l) => l.id !== id));
    } catch (err) {
      setError(err.message || 'Could not delete that listing');
    } finally {
      setDeleting(null);
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
            {formOpen ? (
              <button onClick={() => setFormKind(null)}>Cancel</button>
            ) : (
              <>
                <button onClick={() => openForm('property')}>+ Add Property</button>
                <button onClick={() => openForm('land')}>+ Add Land</button>
              </>
            )}
          </div>
        </div>

        {error && <div className="listing-error">{error}</div>}

        {formOpen && (
          <form className="add-listing" onSubmit={submit} autoComplete="off">
            <h3 className="form-kind">{formKind === 'land' ? 'New land listing' : 'New property listing'}</h3>
            {formKind === 'land' ? (
              <LandForm value={form} onChange={setForm} />
            ) : (
              <ListingForm value={form} onChange={setForm} />
            )}

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
            Nothing waiting to be verified. Use “Add Property” or “Add Land” to submit inventory — verified
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="title-cell" onClick={() => navigate('/listings/' + l.id)}>
                    <strong>{l.title}</strong>
                    <div className="small">
                      {isLand(l)
                        ? `🌾 Land${l.extent ? ` • ${l.extent}` : ''}`
                        : propertyLabel(l.property_type) || ''}
                    </div>
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
                  <td>
                    <div className="row-actions">
                      {canVerify && !l.verified && (
                        <button
                          className="action-btn"
                          disabled={verifying === l.id}
                          onClick={() => verify(l.id, l.title)}
                        >
                          {verifying === l.id ? 'Verifying…' : 'Verify'}
                        </button>
                      )}
                      <button
                        className="action-btn danger"
                        disabled={deleting === l.id}
                        onClick={() => remove(l.id, l.title)}
                      >
                        {deleting === l.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
