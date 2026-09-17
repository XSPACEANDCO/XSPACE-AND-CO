import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { propertyLabel } from '../lib/leadStatus';
import { splitAmenity } from '../lib/amenityIcons';
import ListingForm, { fromListing, toPayload } from './ListingForm';
import ListingPhotos from './ListingPhotos';
import './listingview.css';

/* The listing detail sheet, on real data.

   Everything here came from whoever submitted the listing — there is no
   sample content left. A field nobody filled in shows a dash rather than a
   plausible-looking number, because a wrong price on an internal sheet is
   worse than a missing one. */

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/* Where Core actually checks a Telangana property before verifying it. These
   open the portal; the number still has to be typed in there by hand, because
   none of them offer an API we are entitled to use. */
const PORTALS = [
  {
    label: 'TG RERA — project registry',
    href: 'https://rera.telangana.gov.in/',
    hint: 'Check the RERA number, promoter and completion date',
  },
  {
    label: 'Dharani — land records',
    href: 'https://dharani.telangana.gov.in/',
    hint: 'Survey number, extent and ownership for land',
  },
  {
    label: 'IGRS Telangana — encumbrance certificate',
    href: 'https://registration.telangana.gov.in/',
    hint: 'EC and registered document search — confirms title is clear',
  },
  {
    label: 'HMDA — layout & building approvals',
    href: 'https://www.hmda.gov.in/',
    hint: 'Approved layout / LP number',
  },
  {
    label: 'GHMC — building permissions',
    href: 'https://www.ghmc.gov.in/',
    hint: 'Building permit inside GHMC limits',
  },
];

function Grid({ rows }) {
  return (
    <div className="grid">
      {rows.map(([label, value]) => (
        <div className="box" key={label}>
          <strong>{label}</strong>
          {value || '—'}
        </div>
      ))}
    </div>
  );
}

export default function ListingView() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.listings.get(id);
      setListing(out.listing);
      setForm(fromListing(out.listing));
    } catch (err) {
      setError(err.message || 'Could not load this listing');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const out = await api.listings.update(id, toPayload(form));
      setListing(out.listing);
      setForm(fromListing(out.listing));
      setEditing(false);
      setSaved('Listing saved');
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setError(err.message || 'Could not save this listing');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!window.confirm(`Verify "${listing.title}"? It will be published to Projects.`)) return;
    setError('');
    setBusy(true);
    try {
      await api.listings.verify(id);
      /* Verified inventory lives in Projects now, so that is where this goes. */
      navigate('/projects');
    } catch (err) {
      setError(err.message || 'Could not verify this listing');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page-listingview">
        <div className="container"><div className="section"><div className="small">Loading…</div></div></div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="page-listingview">
        <div className="container">
          <div className="section">
            <h3>Listing not found</h3>
            <div className="small">{error || 'This listing does not exist, or is not one of yours.'}</div>
            <div className="lv-actions">
              <button onClick={() => navigate('/listings')}>Back to Listings</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const amenities = (listing.amenities || '')
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean);

  const docs = [
    ['Brochure', listing.brochure_url],
    ['Floor Plan', listing.floor_plan_url],
    ['Price Sheet', listing.price_sheet_url],
    ['Video', listing.video_link],
  ].filter(([, href]) => href);

  return (
    <div className="page-listingview">
      <div className="container">
        {error && <div className="listing-error">{error}</div>}

        {/* HEADER */}
        <div className="section header">
          <div>
            <h1>{listing.title}</h1>
            <div className="small">📍 {listing.area || 'Location not set'}</div>
            <div className="small">
              Submitted by: {listing.submitted_by_name || '—'}
              {listing.created_at ? ` • ${STAMP.format(new Date(listing.created_at))}` : ''}
            </div>
            {listing.high_demand && <div className="small hot">🔥 High Demand</div>}
          </div>
          <div className="lv-head-actions">
            <span className={'badge ' + (listing.verified ? 'verified' : 'unverified')}>
              {listing.verified ? 'Verified' : 'Unverified'}
            </span>
            {saved && <span className="lv-saved">{saved}</span>}
            <button onClick={() => { setEditing((v) => !v); setForm(fromListing(listing)); }}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>

        {editing ? (
          <form className="section" onSubmit={save} autoComplete="off">
            <h3>Edit listing</h3>
            <ListingForm value={form} onChange={setForm} />
            <div className="lv-actions">
              <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="section">
              <h3>Project Snapshot</h3>
              <Grid
                rows={[
                  ['Builder', listing.builder],
                  ['Property Type', propertyLabel(listing.property_type)],
                  ['Configuration', listing.configuration],
                  ['Possession', listing.possession],
                ]}
              />
            </div>

            <div className="section">
              <h3>Unit Details</h3>
              <Grid
                rows={[
                  ['Super Built-up Area', listing.super_built_up],
                  ['Carpet Area', listing.carpet_area],
                  ['UDS', listing.uds],
                  ['Facing', listing.facing],
                ]}
              />
            </div>

            <div className="section">
              <h3>Amenities</h3>
              {amenities.length === 0 ? (
                <div className="small">No amenities recorded for this listing.</div>
              ) : (
                <div className="amenities">
                  {amenities.map((a) => {
                    /* Listings entered before the icons existed may already
                       start with an emoji — reuse it rather than adding a
                       second one. */
                    const { icon, label } = splitAmenity(a);
                    return (
                      <div className="amenity" key={a}>
                        <span className="amenity-icon" aria-hidden="true">{icon}</span>
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="section">
              <h3>Price &amp; Commercials</h3>
              <Grid
                rows={[
                  ['Base Price', listing.base_price],
                  ['All-Inclusive', listing.all_inclusive],
                  ['Negotiation', listing.negotiation],
                  ['Commission', listing.commission],
                ]}
              />
            </div>

            <div className="section">
              <h3>Legal &amp; Verification</h3>
              <Grid
                rows={[
                  ['RERA No.', listing.rera_number],
                  ['Approval', listing.approval],
                  ['Title Status', listing.title_status],
                  ['Bank Approved', listing.bank_approved],
                  ['Survey No.', listing.survey_number],
                ]}
              />

              {/* Live verification. The portals below are where these claims
                  are actually checked, so they are one click away from the
                  numbers being checked rather than in someone's bookmarks. */}
              <div className="lv-portals">
                <h4>Live verification — government portals</h4>
                <div className="small">
                  Open the portal and check the numbers above against it. Nothing here is
                  automatic — these are the official sources, not a lookup.
                </div>
                <div className="portal-list">
                  {PORTALS.map((p) => (
                    <a
                      className="portal"
                      key={p.href}
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <strong>{p.label} ↗</strong>
                      <span className="small">{p.hint}</span>
                    </a>
                  ))}
                </div>
              </div>

              {!listing.verified && (
                <div className="lv-actions">
                  <button disabled={busy} onClick={verify}>
                    {busy ? 'Verifying…' : 'Mark verified & publish to Projects'}
                  </button>
                  <span className="small">
                    Only Founder and Core can verify. Verifying publishes this listing to the
                    Projects page.
                  </span>
                </div>
              )}
              {listing.verified && listing.verified_at && (
                <div className="small lv-verified-note">
                  ✅ Verified {STAMP.format(new Date(listing.verified_at))}
                  {listing.project_name ? ` • published as project “${listing.project_name}”` : ''}
                </div>
              )}
            </div>

            <div className="section">
              <h3>Photos</h3>
              <div className="small">Elevation, amenities, site images</div>
              <ListingPhotos listingId={listing.id} />
            </div>

            <div className="section">
              <h3>Documents &amp; Video</h3>
              {docs.length === 0 ? (
                <div className="small">
                  No documents linked yet. Use Edit to add brochure, floor plan, price sheet or
                  video links.
                </div>
              ) : (
                <div className="portal-list">
                  {docs.map(([label, href]) => (
                    <a className="portal" key={label} href={href} target="_blank" rel="noopener noreferrer">
                      <strong>📄 {label} ↗</strong>
                      <span className="small">{href}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="section">
              <h3>Internal Notes</h3>
              <div className="small">{listing.notes || 'No notes yet.'}</div>
            </div>
          </>
        )}

        <div className="lv-actions">
          <button className="ghost" onClick={() => navigate('/listings')}>Back to Listings</button>
        </div>
      </div>
    </div>
  );
}
