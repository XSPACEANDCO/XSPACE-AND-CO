import {
  BHK_OPTIONS, PROPERTY_TYPES, configKindFor, configLabelFor, subtypesFor,
} from '../lib/leadStatus';
import AmenityList from '../components/AmenityList';
import FileField from '../components/FileField';

/* The listing sheet as an input form.

   One component, used twice: Listings renders it to create inventory, and
   ListingView renders the same thing to correct or complete it. Keeping it in
   one place is what stops the add form and the detail page drifting apart —
   which is exactly how the old build ended up letting you "add" a listing
   through a one-line prompt() and then showing it on a detail page with
   twenty fields nobody could ever fill in.

   The groups below match the sections of the detail sheet in order, so what
   you fill in here lands where you expect to read it. */

export const EMPTY_LISTING = {
  title: '', area: '', propertyType: '', propertySubtype: '', configuration: '', highDemand: false,
  builder: '', possession: '', unitType: '',
  superBuiltUp: '', carpetArea: '', uds: '', facing: '',
  price: '', basePrice: '', allInclusive: '', negotiation: '', commission: '',
  reraNumber: '', approval: '', titleStatus: '', bankApproved: '', surveyNumber: '',
  amenities: '', videoLink: '', brochureUrl: '', floorPlanUrl: '', priceSheetUrl: '',
  notes: '',
  /* Land — see LandForm.jsx */
  landKind: '', extent: '', priceBasis: '', village: '', mandal: '', district: '',
  zoning: '', conversion: '', roadAccess: '', frontage: '', boundaries: '', utilities: '',
  landmarks: '', pattadar: '', passbook: '', ecStatus: '', litigation: '', layoutPlanUrl: '',
};

export const EMPTY_LAND = { ...EMPTY_LISTING, propertyType: 'land' };

/* Land and everything else are different sheets — see LandForm.jsx. Both
   start with the same property-type picker, so choosing "Land" there swaps
   the rest of the sheet without losing what was already typed. */
export function isLand(listing) {
  return (listing?.propertyType ?? listing?.property_type) === 'land';
}

/* API row (snake_case) -> form state. Nulls become '' so React keeps every
   field controlled. */
export function fromListing(l) {
  const pick = (v) => (v == null ? '' : String(v));
  return {
    title: pick(l.title), area: pick(l.area),
    propertyType: pick(l.property_type), propertySubtype: pick(l.property_subtype),
    configuration: pick(l.configuration),
    highDemand: Boolean(l.high_demand),
    builder: pick(l.builder), possession: pick(l.possession), unitType: pick(l.unit_type),
    superBuiltUp: pick(l.super_built_up), carpetArea: pick(l.carpet_area),
    uds: pick(l.uds), facing: pick(l.facing),
    price: pick(l.price), basePrice: pick(l.base_price), allInclusive: pick(l.all_inclusive),
    negotiation: pick(l.negotiation), commission: pick(l.commission),
    reraNumber: pick(l.rera_number), approval: pick(l.approval),
    titleStatus: pick(l.title_status), bankApproved: pick(l.bank_approved),
    surveyNumber: pick(l.survey_number),
    amenities: pick(l.amenities), videoLink: pick(l.video_link),
    brochureUrl: pick(l.brochure_url), floorPlanUrl: pick(l.floor_plan_url),
    priceSheetUrl: pick(l.price_sheet_url), notes: pick(l.notes),
    landKind: pick(l.land_kind), extent: pick(l.extent), priceBasis: pick(l.price_basis),
    village: pick(l.village), mandal: pick(l.mandal), district: pick(l.district),
    zoning: pick(l.zoning), conversion: pick(l.conversion), roadAccess: pick(l.road_access),
    frontage: pick(l.frontage), boundaries: pick(l.boundaries), utilities: pick(l.utilities),
    landmarks: pick(l.landmarks), pattadar: pick(l.pattadar), passbook: pick(l.passbook),
    ecStatus: pick(l.ec_status), litigation: pick(l.litigation), layoutPlanUrl: pick(l.layout_plan_url),
  };
}

export function toPayload(form) {
  const out = { ...form };
  out.title = form.title.trim();
  return out;
}

export const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
export const APPROVALS = ['HMDA', 'DTCP', 'GHMC', 'Panchayat', 'RERA only', 'Other'];
export const TITLE_STATUS = ['Clear', 'Under verification', 'Disputed', 'Not checked'];
export const NEGOTIATION = ['Open', 'Limited', 'Fixed price'];

export function Field({ label, hint, children }) {
  return (
    <label className="lf-field">
      <span>{label}</span>
      {children}
      {hint && <em className="lf-hint">{hint}</em>}
    </label>
  );
}

/* Property type, and the sub-type for the kinds that have one. Changing the
   type changes what "configuration" even means — bedrooms, acres or square
   feet — and which sub-types exist, so neither answer survives onto a type
   it makes no sense for. */
export function PropertyTypeFields({ value, onChange }) {
  const subtypes = subtypesFor(value.propertyType);
  return (
    <>
      <Field label="Property type">
        <select
          value={value.propertyType}
          onChange={(e) => {
            const next = e.target.value;
            onChange((f) => ({ ...f, propertyType: next, propertySubtype: '', configuration: '' }));
          }}
        >
          <option value="">Select…</option>
          {PROPERTY_TYPES.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </Field>
      {subtypes.length > 0 && (
        <Field label="Sub-type">
          <select
            value={value.propertySubtype}
            onChange={(e) => {
              const next = e.target.value;
              onChange((f) => ({ ...f, propertySubtype: next }));
            }}
          >
            <option value="">Select…</option>
            {subtypes.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

export default function ListingForm({ value, onChange }) {
  const set = (key) => (e) => {
    const next = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange((f) => ({ ...f, [key]: next }));
  };

  const configKind = configKindFor(value.propertyType);

  return (
    <div className="listing-form">
      <fieldset>
        <legend>Project Snapshot</legend>
        <div className="lf-grid">
          <Field label="Listing title">
            <input value={value.title} onChange={set('title')} placeholder="Project name – unit type" required />
          </Field>
          <Field label="Location">
            <input value={value.area} onChange={set('area')} placeholder="Area, city" />
          </Field>
          <Field label="Builder">
            <input value={value.builder} onChange={set('builder')} placeholder="Builder name" />
          </Field>
          <PropertyTypeFields value={value} onChange={onChange} />

          {/* Bedrooms for a home, acres for land, square feet for a shop. */}
          <Field label={configLabelFor(value.propertyType)}>
            {configKind === 'bhk' ? (
              <select value={value.configuration} onChange={set('configuration')}>
                <option value="">Select…</option>
                {BHK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <input
                value={value.configuration}
                onChange={set('configuration')}
                placeholder={
                  configKind === 'acres' ? 'e.g. 2.5 acres'
                    : configKind === 'sft' ? 'e.g. 1200 sft'
                      : 'Pick a property type first'
                }
                disabled={!configKind}
              />
            )}
          </Field>

          <Field label="Possession">
            <input value={value.possession} onChange={set('possession')} placeholder="Dec 2027 / Ready to move" />
          </Field>
        </div>

        <label className="lf-check">
          <input type="checkbox" checked={value.highDemand} onChange={set('highDemand')} />
          <span>🔥 Mark as high demand</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Unit Details</legend>
        <div className="lf-grid">
          <Field label="Super built-up area">
            <input value={value.superBuiltUp} onChange={set('superBuiltUp')} placeholder="e.g. 2050 sft" />
          </Field>
          <Field label="Carpet area">
            <input value={value.carpetArea} onChange={set('carpetArea')} placeholder="e.g. 1450 sft" />
          </Field>
          <Field label="UDS">
            <input value={value.uds} onChange={set('uds')} placeholder="e.g. 65 sq yds" />
          </Field>
          <Field label="Facing">
            <select value={value.facing} onChange={set('facing')}>
              <option value="">Select…</option>
              {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Price &amp; Commercials</legend>
        <div className="lf-grid">
          <Field label="Headline price" hint="What shows in the listings table">
            <input value={value.price} onChange={set('price')} placeholder="e.g. ₹1.15 Cr" />
          </Field>
          <Field label="Base price">
            <input value={value.basePrice} onChange={set('basePrice')} placeholder="e.g. ₹1.05 Cr" />
          </Field>
          <Field label="All-inclusive">
            <input value={value.allInclusive} onChange={set('allInclusive')} placeholder="e.g. ₹1.15 Cr" />
          </Field>
          <Field label="Negotiation">
            <select value={value.negotiation} onChange={set('negotiation')}>
              <option value="">Select…</option>
              {NEGOTIATION.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Commission">
            <input value={value.commission} onChange={set('commission')} placeholder="e.g. 2% (Builder)" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Legal &amp; Verification</legend>
        <div className="lf-grid">
          <Field label="RERA number">
            <input value={value.reraNumber} onChange={set('reraNumber')} placeholder="RERA registration number" />
          </Field>
          <Field label="Approval">
            <select value={value.approval} onChange={set('approval')}>
              <option value="">Select…</option>
              {APPROVALS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Title status">
            <select value={value.titleStatus} onChange={set('titleStatus')}>
              <option value="">Select…</option>
              {TITLE_STATUS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Bank approved">
            <input value={value.bankApproved} onChange={set('bankApproved')} placeholder="Banks offering loans" />
          </Field>
          <Field label="Survey number" hint="Land / plot records">
            <input value={value.surveyNumber} onChange={set('surveyNumber')} placeholder="e.g. Sy. No. 123/A" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Amenities</legend>
        <div className="lf-amenity-note">
          One per box — add whatever this property actually has.
        </div>
        <AmenityList value={value.amenities} onChange={(next) => onChange((f) => ({ ...f, amenities: next }))} />
      </fieldset>

      <fieldset>
        <legend>Media &amp; Documents</legend>
        {/* Each of these takes a file from the device or a pasted link. */}
        <div className="lf-grid">
          <FileField
            label="Brochure"
            value={value.brochureUrl}
            onChange={(url) => onChange((f) => ({ ...f, brochureUrl: url }))}
            accept="application/pdf,image/*"
            hint="PDF, up to 8 MB"
          />
          <FileField
            label="Floor plan"
            value={value.floorPlanUrl}
            onChange={(url) => onChange((f) => ({ ...f, floorPlanUrl: url }))}
            accept="application/pdf,image/*"
            hint="PDF or image, up to 8 MB"
          />
          <FileField
            label="Price sheet"
            value={value.priceSheetUrl}
            onChange={(url) => onChange((f) => ({ ...f, priceSheetUrl: url }))}
            accept="application/pdf,image/*"
            hint="PDF, up to 8 MB"
          />
          <FileField
            label="Video"
            value={value.videoLink}
            onChange={(url) => onChange((f) => ({ ...f, videoLink: url }))}
            accept="video/*"
            placeholder="Instagram / YouTube link, or upload a clip"
            hint="Walkthrough / drone / reel. Long video belongs on a link — only clips under 8 MB can be uploaded."
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Internal Notes</legend>
        <Field label="Notes" hint="Visible to the internal team only">
          <textarea
            rows={3}
            value={value.notes}
            onChange={set('notes')}
            placeholder="Anything the team should know about this property"
          />
        </Field>
      </fieldset>
    </div>
  );
}
