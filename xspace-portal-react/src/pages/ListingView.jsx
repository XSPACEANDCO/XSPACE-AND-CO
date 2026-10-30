import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { getRole } from '../lib/storage';
import { propertyFullLabel } from '../lib/leadStatus';
import { splitAmenity } from '../lib/amenityIcons';
import { GOV_PORTALS } from '../lib/links';
import ListingForm, { LEGAL_DOCS, fromListing, isLand, parseUnits, toPayload } from './ListingForm';
import LandForm from './LandForm';
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

const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/* Dates from the form are YYYY-MM-DD; anything else was typed by hand and is
   shown as it is. */
function fmtDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
  return DAY.format(new Date(`${value}T00:00:00`));
}

/* Where Core actually checks a Telangana property before verifying it —
   the same list the Live Verifications desk shows (lib/links.js). */
const PORTALS = GOV_PORTALS.flatMap((g) => g.links);

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
  const internal = ['founder', 'core'].includes(getRole());
  /* Studio reads verified sheets to make the project's videos. */
  const studio = getRole() === 'studio';
  /* Whoever listed it, Founder and Core — decided by the server. */
  const [canEdit, setCanEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.listings.get(id);
      setListing(out.listing);
      setForm(fromListing(out.listing));
      setCanEdit(Boolean(out.canEdit));
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

  /* Send it back to the realtor. Their next save resubmits it for review. */
  async function requestCorrections() {
    const notes = window.prompt(
      `What needs correcting on "${listing.title}"?\n\nThe realtor sees this note in their notifications.`
    );
    if (!notes || !notes.trim()) return;
    setError('');
    setBusy(true);
    try {
      const out = await api.listings.requestCorrections(id, notes.trim());
      setListing((prev) => ({ ...prev, ...out.listing }));
      setSaved('Sent back to the realtor');
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setError(err.message || 'Could not send this listing back');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${listing.title}"?

Its photos and verification go with it. This cannot be undone.`))
      return;
    setError('');
    setBusy(true);
    try {
      await api.listings.remove(id);
      navigate('/listings');
    } catch (err) {
      setError(err.message || 'Could not delete this listing');
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

  const land = isLand(listing);

  const docs = [
    ['Layout Plan / Survey Sketch', listing.layout_plan_url],
    ['Brochure', listing.brochure_url],
    ['Floor Plan', listing.floor_plan_url],
    ['Price Sheet', listing.price_sheet_url],
    ['Video', listing.video_link],
    /* LEGAL_DOCS is keyed by the form's camelCase name; the row is snake_case. */
    ...LEGAL_DOCS.map(([key, label]) => [label, listing[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]]),
  ].filter(([, href]) => href);

  const units = parseUnits(listing);

  return (
    <div className="page-listingview">
      <div className="container">
        {error && <div className="listing-error">{error}</div>}

        {listing.corrections_note && !listing.verified && (
          <div className="section lv-corrections">
            <h3>✏️ Corrections requested</h3>
            <div className="lv-corrections-note">{listing.corrections_note}</div>
            <div className="small">
              {internal
                ? 'Waiting on the realtor. Their next save resubmits it for review.'
                : 'Edit the listing and save it — saving resubmits it to Xspace for review.'}
            </div>
          </div>
        )}

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
            {canEdit && (
              <button onClick={() => { setEditing((v) => !v); setForm(fromListing(listing)); }}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
            )}
            {studio && listing.project_id && (
              <button onClick={() => navigate(`/media-upload?request=1&project=${listing.project_id}`)}>
                🎬 Create a video for this project
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <form className="section" onSubmit={save} autoComplete="off">
            <h3>Edit listing</h3>
            {isLand(form) ? (
              <LandForm value={form} onChange={setForm} />
            ) : (
              <ListingForm value={form} onChange={setForm} />
            )}
            <div className="lv-actions">
              <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            {land ? (
              <>
                <div className="section">
                  <h3>Land Snapshot</h3>
                  <Grid
                    rows={[
                      ['Land Type', listing.land_kind],
                      ['Extent', listing.extent],
                      ['Village', listing.village],
                      ['Mandal', listing.mandal],
                      ['District', listing.district],
                    ]}
                  />
                </div>

                <div className="section">
                  <h3>Site Details</h3>
                  <Grid
                    rows={[
                      ['Road Access', listing.road_access],
                      ['Frontage', listing.frontage],
                      ['Water & Power', listing.utilities],
                      ['Nearby Landmarks', listing.landmarks],
                      ['Boundaries', listing.boundaries],
                    ]}
                  />
                </div>

                <div className="section">
                  <h3>Price &amp; Commercials</h3>
                  <Grid
                    rows={[
                      ['Price', listing.price],
                      ['Price Basis', listing.price_basis],
                      ['Negotiation', listing.negotiation],
                      ['Commission', listing.commission],
                    ]}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="section">
                  <h3>Project Snapshot</h3>
                  <Grid
                    rows={[
                      ['Builder', listing.builder],
                      ['Property Type', propertyFullLabel(listing.property_type, listing.property_subtype)],
                      ['Configuration', listing.configuration],
                      ['Possession', listing.possession],
                    ]}
                  />
                </div>

                <div className="section">
                  <h3>Unit Details</h3>
                  {units.length === 0 ? (
                    <div className="small">No units recorded for this listing.</div>
                  ) : (
                    units.map((u, i) => (
                      <div className="lv-unit" key={i}>
                        {units.length > 1 && <h4>{u.name || `Unit ${i + 1}`}</h4>}
                        <Grid
                          rows={[
                            ...(units.length === 1 && u.name ? [['Unit / Type', u.name]] : []),
                            ['Super Built-up Area', u.superBuiltUp],
                            ['Carpet Area', u.carpetArea],
                            ['UDS', u.uds],
                            ['Facing', u.facing],
                          ]}
                        />
                      </div>
                    ))
                  )}
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
              </>
            )}

            <div className="section">
              <h3>Legal &amp; Verification</h3>
              <Grid
                rows={
                  land
                    ? [
                        ['Survey No.', listing.survey_number],
                        ['Pattadar', listing.pattadar],
                        ['Passbook', listing.passbook],
                        ['Title Status', listing.title_status],
                        ['Encumbrance (EC)', listing.ec_status],
                        ['Litigation', listing.litigation],
                        ['Zoning', listing.zoning],
                        ['Conversion', listing.conversion],
                        ['Approval', listing.approval],
                        ['RERA / LP No.', listing.rera_number],
                      ]
                    : [
                        ['RERA No.', listing.rera_number],
                        ['RERA Approved Date', fmtDate(listing.rera_approved_date)],
                        ['RERA Valid Up To', fmtDate(listing.rera_valid_upto)],
                        ['Sy. No.', listing.survey_number],
                        ['Permit / Layout Approved By', listing.approval],
                        ['Permit File No.', listing.permit_file_no],
                        ['Permit Approved Date', fmtDate(listing.permit_approved_date)],
                        ['Permit Valid Up To', fmtDate(listing.permit_valid_upto)],
                        ['Bank Approved', listing.bank_approved],
                        ['Title Status', listing.title_status],
                      ]
                }
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

              {!listing.verified && internal && (
                <div className="lv-actions">
                  <button disabled={busy} onClick={verify}>
                    {busy ? 'Verifying…' : 'Mark verified & publish to Projects'}
                  </button>
                  {internal && (
                    <button className="ghost" disabled={busy} onClick={requestCorrections}>
                      Send back for corrections
                    </button>
                  )}
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
              <ListingPhotos listingId={listing.id} readOnly={!canEdit} />
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

            {!studio && (
              <div className="section">
                <h3>Micro Market</h3>
                <div className="small lv-prewrap">{listing.micro_market || 'No micro market notes yet.'}</div>
              </div>
            )}

            {!studio && (
              <div className="section">
                <h3>Internal Notes</h3>
                <div className="small">{listing.notes || 'No notes yet.'}</div>
              </div>
            )}
          </>
        )}

        <div className="lv-actions">
          {studio ? (
            <button className="ghost" onClick={() => navigate('/projects')}>Back to Projects</button>
          ) : (
            <button className="ghost" onClick={() => navigate('/listings')}>Back to Listings</button>
          )}
          {canEdit && <button className="danger" disabled={busy} onClick={remove}>Delete Listing</button>}
        </div>
      </div>
    </div>
  );
}
