import {
  BHK_OPTIONS, PROPERTY_TYPES, configKindFor, configLabelFor,
} from '../lib/leadStatus';

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
  title: '', area: '', propertyType: '', configuration: '', highDemand: false,
  builder: '', possession: '', unitType: '',
  superBuiltUp: '', carpetArea: '', uds: '', facing: '',
  price: '', basePrice: '', allInclusive: '', negotiation: '', commission: '',
  reraNumber: '', approval: '', titleStatus: '', bankApproved: '', surveyNumber: '',
  amenities: '', videoLink: '', brochureUrl: '', floorPlanUrl: '', priceSheetUrl: '',
  notes: '',
};

/* API row (snake_case) -> form state. Nulls become '' so React keeps every
   field controlled. */
export function fromListing(l) {
  const pick = (v) => (v == null ? '' : String(v));
  return {
    title: pick(l.title), area: pick(l.area),
    propertyType: pick(l.property_type), configuration: pick(l.configuration),
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
  };
}

export function toPayload(form) {
  const out = { ...form };
  out.title = form.title.trim();
  return out;
}

const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
const APPROVALS = ['HMDA', 'DTCP', 'GHMC', 'Panchayat', 'RERA only', 'Other'];
const TITLE_STATUS = ['Clear', 'Under verification', 'Disputed', 'Not checked'];
const NEGOTIATION = ['Open', 'Limited', 'Fixed price'];

function Field({ label, hint, children }) {
  return (
    <label className="lf-field">
      <span>{label}</span>
      {children}
      {hint && <em className="lf-hint">{hint}</em>}
    </label>
  );
}

export default function ListingForm({ value, onChange }) {
  const set = (key) => (e) => {
    const next = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange((f) => {
      /* Changing the property type changes what "configuration" even means —
         bedrooms, acres or square feet — so the previous answer must not
         survive onto a type it makes no sense for. */
      if (key === 'propertyType') return { ...f, propertyType: next, configuration: '' };
      return { ...f, [key]: next };
    });
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
          <Field label="Property type">
            <select value={value.propertyType} onChange={set('propertyType')}>
              <option value="">Select…</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </Field>

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
        <Field label="One per line" hint="Typed, not picked from a fixed list — add whatever this property actually has">
          <textarea
            rows={5}
            value={value.amenities}
            onChange={set('amenities')}
            placeholder={'Swimming Pool\nGymnasium\nClubhouse\n24×7 Security'}
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Media &amp; Documents</legend>
        <div className="lf-grid">
          <Field label="Video link" hint="Walkthrough / drone / reel">
            <input value={value.videoLink} onChange={set('videoLink')} placeholder="Instagram / YouTube link" />
          </Field>
          <Field label="Brochure link">
            <input value={value.brochureUrl} onChange={set('brochureUrl')} placeholder="https://… (PDF)" />
          </Field>
          <Field label="Floor plan link">
            <input value={value.floorPlanUrl} onChange={set('floorPlanUrl')} placeholder="https://… (PDF)" />
          </Field>
          <Field label="Price sheet link">
            <input value={value.priceSheetUrl} onChange={set('priceSheetUrl')} placeholder="https://… (PDF)" />
          </Field>
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
