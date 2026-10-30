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
  superBuiltUp: '', carpetArea: '', uds: '', facing: '', units: [],
  price: '', basePrice: '', allInclusive: '', negotiation: '', commission: '',
  reraNumber: '', approval: '', titleStatus: '', bankApproved: '', surveyNumber: '',
  reraApprovedDate: '', reraValidUpto: '',
  permitFileNo: '', permitApprovedDate: '', permitValidUpto: '',
  amenities: '', videoLink: '', brochureUrl: '', floorPlanUrl: '', priceSheetUrl: '',
  reraCertificateUrl: '', buildingPermitUrl: '', fireNocUrl: '', environmentalCertUrl: '',
  encumbranceCertUrl: '', mortgageDeedsUrl: '', supplementaryDeedsUrl: '', reraAgreementUrl: '',
  legalOpinionUrl: '',
  microMarket: '', notes: '',
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

/* Several configurations ("2 BHK, 3 BHK") live in the one configuration
   column, comma-separated, so lead matching and every list that prints it
   keep working unchanged. */
export function splitConfigs(text) {
  return String(text || '').split(',').map((c) => c.trim()).filter(Boolean);
}

const EMPTY_UNIT = { name: '', superBuiltUp: '', carpetArea: '', uds: '', facing: '' };
const unitFilled = (u) => Object.values(u).some((v) => String(v || '').trim());

/* One row per unit, stored as JSON in unit_details. A listing entered before
   that column existed has its single unit in the old columns — read it from
   there so it opens as the first row. */
export function parseUnits(l) {
  try {
    const rows = JSON.parse(l.unit_details || '[]');
    if (Array.isArray(rows) && rows.length) return rows.map((u) => ({ ...EMPTY_UNIT, ...u }));
  } catch { /* fall through to the old columns */ }
  const legacy = {
    ...EMPTY_UNIT,
    superBuiltUp: l.super_built_up || '', carpetArea: l.carpet_area || '',
    uds: l.uds || '', facing: l.facing || '',
  };
  return unitFilled(legacy) ? [legacy] : [];
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
    uds: pick(l.uds), facing: pick(l.facing), units: parseUnits(l),
    price: pick(l.price), basePrice: pick(l.base_price), allInclusive: pick(l.all_inclusive),
    negotiation: pick(l.negotiation), commission: pick(l.commission),
    reraNumber: pick(l.rera_number), approval: pick(l.approval),
    titleStatus: pick(l.title_status), bankApproved: pick(l.bank_approved),
    surveyNumber: pick(l.survey_number),
    reraApprovedDate: pick(l.rera_approved_date), reraValidUpto: pick(l.rera_valid_upto),
    permitFileNo: pick(l.permit_file_no), permitApprovedDate: pick(l.permit_approved_date),
    permitValidUpto: pick(l.permit_valid_upto),
    amenities: pick(l.amenities), videoLink: pick(l.video_link),
    brochureUrl: pick(l.brochure_url), floorPlanUrl: pick(l.floor_plan_url),
    priceSheetUrl: pick(l.price_sheet_url),
    reraCertificateUrl: pick(l.rera_certificate_url), buildingPermitUrl: pick(l.building_permit_url),
    fireNocUrl: pick(l.fire_noc_url), environmentalCertUrl: pick(l.environmental_cert_url),
    encumbranceCertUrl: pick(l.encumbrance_cert_url), mortgageDeedsUrl: pick(l.mortgage_deeds_url),
    supplementaryDeedsUrl: pick(l.supplementary_deeds_url), reraAgreementUrl: pick(l.rera_agreement_url),
    legalOpinionUrl: pick(l.legal_opinion_url),
    microMarket: pick(l.micro_market), notes: pick(l.notes),
    landKind: pick(l.land_kind), extent: pick(l.extent), priceBasis: pick(l.price_basis),
    village: pick(l.village), mandal: pick(l.mandal), district: pick(l.district),
    zoning: pick(l.zoning), conversion: pick(l.conversion), roadAccess: pick(l.road_access),
    frontage: pick(l.frontage), boundaries: pick(l.boundaries), utilities: pick(l.utilities),
    landmarks: pick(l.landmarks), pattadar: pick(l.pattadar), passbook: pick(l.passbook),
    ecStatus: pick(l.ec_status), litigation: pick(l.litigation), layoutPlanUrl: pick(l.layout_plan_url),
  };
}

export function toPayload(form) {
  const { units = [], ...out } = form;
  out.title = form.title.trim();
  out.configuration = splitConfigs(form.configuration).join(', ');
  /* Land has no unit rows — leave its columns alone. */
  if (isLand(form)) return out;
  /* The first unit also goes into the old single-unit columns, which the
     public page and client journey still read. */
  const filled = units.filter(unitFilled);
  const first = filled[0] || EMPTY_UNIT;
  out.unitDetails = filled.length ? JSON.stringify(filled) : '';
  out.superBuiltUp = first.superBuiltUp;
  out.carpetArea = first.carpetArea;
  out.uds = first.uds;
  out.facing = first.facing;
  return out;
}

export const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
export const APPROVALS = ['HMDA', 'DTCP', 'GHMC', 'Panchayat', 'RERA only', 'Other'];
export const TITLE_STATUS = ['Clear', 'Under verification', 'Disputed', 'Not checked'];
export const NEGOTIATION = ['Open', 'Limited', 'Fixed price'];

/* The legal documents a buyer's lawyer asks for, in the order they ask. */
export const LEGAL_DOCS = [
  ['reraCertificateUrl', 'RERA certificate'],
  ['buildingPermitUrl', 'Building permit / layout permit order'],
  ['fireNocUrl', 'Fire NOC'],
  ['environmentalCertUrl', 'Environmental certificate'],
  ['encumbranceCertUrl', 'Encumbrance certificate'],
  ['mortgageDeedsUrl', 'Mortgage deeds'],
  ['supplementaryDeedsUrl', 'Supplementary deeds'],
  ['reraAgreementUrl', 'Agreement as per RERA'],
  ['legalOpinionUrl', 'Legal advisory from lawyer'],
];

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

/* Every configuration on offer — a project selling 2 and 3 BHK lists both. */
function ConfigList({ value, onChange }) {
  const configKind = configKindFor(value.propertyType);
  /* Split on the exact separator and untrimmed while editing, so an empty
     row or a half-typed "2.5 " survives; toPayload tidies it on save. */
  const rows = String(value.configuration || '').split(/\s*,\s?/);
  const commit = (next) => onChange((f) => ({ ...f, configuration: next.join(', ') }));
  const setAt = (i, text) => commit(rows.map((r, n) => (n === i ? text.replace(/,/g, '') : r)));

  return (
    <Field label={configLabelFor(value.propertyType)}>
      <div className="lf-multi">
        {rows.map((row, i) => (
          /* Keyed by position: rows are edited in place and may repeat. */
          <div className="lf-multi-row" key={i}>
            {configKind === 'bhk' ? (
              <select value={row} onChange={(e) => setAt(i, e.target.value)}>
                <option value="">Select…</option>
                {BHK_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <input
                value={row}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={
                  configKind === 'acres' ? 'e.g. 2.5 acres'
                    : configKind === 'sft' ? 'e.g. 1200 sft'
                      : 'Pick a property type first'
                }
                disabled={!configKind}
              />
            )}
            {rows.length > 1 && (
              <button
                type="button"
                className="lf-remove"
                title="Remove"
                aria-label="Remove configuration"
                onClick={() => commit(rows.filter((_, n) => n !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {configKind && rows[rows.length - 1] && (
          <button type="button" className="lf-add" onClick={() => commit([...rows, ''])}>
            + Add configuration
          </button>
        )}
      </div>
    </Field>
  );
}

/* One row per unit type, each with its own areas and facing. */
function UnitList({ value, onChange }) {
  const rows = value.length ? value : [EMPTY_UNIT];
  const setAt = (i, key, text) => onChange(rows.map((u, n) => (n === i ? { ...u, [key]: text } : u)));

  return (
    <div className="lf-units">
      {rows.map((u, i) => (
        <div className="lf-unit" key={i}>
          <div className="lf-unit-head">
            <strong>Unit {i + 1}</strong>
            {rows.length > 1 && (
              <button
                type="button"
                className="lf-remove"
                title="Remove unit"
                aria-label={`Remove unit ${i + 1}`}
                onClick={() => onChange(rows.filter((_, n) => n !== i))}
              >
                ×
              </button>
            )}
          </div>
          <div className="lf-grid">
            <Field label="Unit / type">
              <input value={u.name} onChange={(e) => setAt(i, 'name', e.target.value)} placeholder="e.g. 3 BHK – Type A" />
            </Field>
            <Field label="Super built-up area">
              <input value={u.superBuiltUp} onChange={(e) => setAt(i, 'superBuiltUp', e.target.value)} placeholder="e.g. 2050 sft" />
            </Field>
            <Field label="Carpet area">
              <input value={u.carpetArea} onChange={(e) => setAt(i, 'carpetArea', e.target.value)} placeholder="e.g. 1450 sft" />
            </Field>
            <Field label="UDS">
              <input value={u.uds} onChange={(e) => setAt(i, 'uds', e.target.value)} placeholder="e.g. 65 sq yds" />
            </Field>
            <Field label="Facing">
              <select value={u.facing} onChange={(e) => setAt(i, 'facing', e.target.value)}>
                <option value="">Select…</option>
                {FACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </div>
        </div>
      ))}
      <button type="button" className="lf-add" onClick={() => onChange([...rows, { ...EMPTY_UNIT }])}>
        + Add unit
      </button>
    </div>
  );
}

export default function ListingForm({ value, onChange }) {
  const set = (key) => (e) => {
    const next = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange((f) => ({ ...f, [key]: next }));
  };

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
          <ConfigList value={value} onChange={onChange} />

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
        <UnitList value={value.units || []} onChange={(units) => onChange((f) => ({ ...f, units }))} />
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
          <Field label="RERA No.">
            <input value={value.reraNumber} onChange={set('reraNumber')} placeholder="RERA registration number" />
          </Field>
          <Field label="Approved date">
            <input type="date" value={value.reraApprovedDate} onChange={set('reraApprovedDate')} />
          </Field>
          <Field label="Valid up to">
            <input type="date" value={value.reraValidUpto} onChange={set('reraValidUpto')} />
          </Field>
          <Field label="Sy. No." hint="Land / plot records">
            <input value={value.surveyNumber} onChange={set('surveyNumber')} placeholder="e.g. Sy. No. 123/A" />
          </Field>
        </div>

        <div className="lf-subhead">Building permit order / layout approval</div>
        <div className="lf-grid">
          <Field label="Approved by">
            <select value={value.approval} onChange={set('approval')}>
              <option value="">Select…</option>
              {APPROVALS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="File No.">
            <input value={value.permitFileNo} onChange={set('permitFileNo')} placeholder="Permit / LP file number" />
          </Field>
          <Field label="Approved date">
            <input type="date" value={value.permitApprovedDate} onChange={set('permitApprovedDate')} />
          </Field>
          <Field label="Valid up to">
            <input type="date" value={value.permitValidUpto} onChange={set('permitValidUpto')} />
          </Field>
        </div>

        <div className="lf-grid lf-gap-top">
          <Field label="Bank approved">
            <input value={value.bankApproved} onChange={set('bankApproved')} placeholder="Banks offering loans" />
          </Field>
          <Field label="Title status">
            <select value={value.titleStatus} onChange={set('titleStatus')}>
              <option value="">Select…</option>
              {TITLE_STATUS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
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

        <div className="lf-subhead">Legal documents</div>
        <div className="lf-grid">
          {LEGAL_DOCS.map(([key, label]) => (
            <FileField
              key={key}
              label={label}
              value={value[key]}
              onChange={(url) => onChange((f) => ({ ...f, [key]: url }))}
              accept="application/pdf,image/*"
              hint="PDF or image, up to 8 MB"
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Micro Market</legend>
        <Field label="Micro market" hint="Visible to the internal team only">
          <textarea
            rows={3}
            value={value.microMarket}
            onChange={set('microMarket')}
            placeholder="Locality rates, comparable projects, demand, upcoming infrastructure"
          />
        </Field>
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
