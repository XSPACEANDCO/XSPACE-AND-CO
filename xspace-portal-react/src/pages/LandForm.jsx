import FileField from '../components/FileField';
import { APPROVALS, Field, NEGOTIATION, PropertyTypeFields, TITLE_STATUS } from './ListingForm';

/* The listing sheet for land.

   A plot or an acreage is bought on different facts from a flat: how big it
   is, where it sits in the revenue records (village, mandal, survey number),
   what the master plan lets you build on it, whether it has been converted
   from agricultural use, the road in front of it, and who the pattadar is.
   None of the flat's fields — carpet area, UDS, facing, possession — mean
   anything here, so land gets its own form rather than half of that one.

   Same state shape as ListingForm, so Listings and ListingView save it
   through the same endpoints — and the property-type picker at the top is the
   same one, so changing it away from Land switches back to that form. */

export const LAND_KINDS = [
  'Agricultural land',
  'Open plot (layout)',
  'Farm land / farm plot',
  'Commercial land',
  'Industrial land',
  'Development land (JV)',
];
export const PRICE_BASIS = ['Per acre', 'Per gunta', 'Per sq. yard', 'Lump sum'];
export const ZONING = [
  'Residential',
  'Commercial',
  'Agricultural / Conservation',
  'Industrial',
  'Mixed use',
  'Peri-urban',
  'Not checked',
];
export const CONVERSION = ['Converted (NALA)', 'Conversion applied', 'Not converted', 'Not required'];
export const LAND_APPROVALS = [...APPROVALS.filter((a) => a !== 'RERA only' && a !== 'Other'), 'RERA (layout)', 'Unapproved', 'Other'];
export const PASSBOOK = ['Available', 'Applied', 'Not available'];
export const EC_STATUS = ['Clear', 'Encumbered (loan / charge)', 'Not checked'];
export const LITIGATION = ['None known', 'Case pending', 'Not checked'];

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange}>
      <option value="">Select…</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function LandForm({ value, onChange }) {
  const set = (key) => (e) => {
    const next = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    onChange((f) => ({ ...f, [key]: next }));
  };
  const setUrl = (key) => (url) => onChange((f) => ({ ...f, [key]: url }));

  return (
    <div className="listing-form">
      <fieldset>
        <legend>Land Snapshot</legend>
        <div className="lf-grid">
          <Field label="Listing title">
            <input value={value.title} onChange={set('title')} placeholder="e.g. 4 acres – Shankarpally" required />
          </Field>
          <PropertyTypeFields value={value} onChange={onChange} />
          <Field label="Land type">
            <Select value={value.landKind} onChange={set('landKind')} options={LAND_KINDS} />
          </Field>
          <Field label="Extent" hint="Acres and guntas, or square yards for a plot">
            <input value={value.extent} onChange={set('extent')} placeholder="e.g. 4 acres 20 guntas / 267 sq yds" />
          </Field>
          <Field label="Location">
            <input value={value.area} onChange={set('area')} placeholder="Nearest locality, city" />
          </Field>
          <Field label="Village">
            <input value={value.village} onChange={set('village')} placeholder="Revenue village" />
          </Field>
          <Field label="Mandal">
            <input value={value.mandal} onChange={set('mandal')} placeholder="Mandal" />
          </Field>
          <Field label="District">
            <input value={value.district} onChange={set('district')} placeholder="e.g. Rangareddy" />
          </Field>
        </div>
        <label className="lf-check">
          <input type="checkbox" checked={value.highDemand} onChange={set('highDemand')} />
          <span>🔥 Mark as high demand</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Price &amp; Commercials</legend>
        <div className="lf-grid">
          <Field label="Price" hint="What shows in the listings table">
            <input value={value.price} onChange={set('price')} placeholder="e.g. ₹1.2 Cr / acre" />
          </Field>
          <Field label="Price basis">
            <Select value={value.priceBasis} onChange={set('priceBasis')} options={PRICE_BASIS} />
          </Field>
          <Field label="Negotiation">
            <Select value={value.negotiation} onChange={set('negotiation')} options={NEGOTIATION} />
          </Field>
          <Field label="Commission">
            <input value={value.commission} onChange={set('commission')} placeholder="e.g. 2% (Seller)" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Site Details</legend>
        <div className="lf-grid">
          <Field label="Road access">
            <input value={value.roadAccess} onChange={set('roadAccess')} placeholder="e.g. 40 ft BT road" />
          </Field>
          <Field label="Frontage">
            <input value={value.frontage} onChange={set('frontage')} placeholder="e.g. 220 ft on main road" />
          </Field>
          <Field label="Water & power">
            <input value={value.utilities} onChange={set('utilities')} placeholder="Borewell, 3-phase line on site…" />
          </Field>
          <Field label="Nearby landmarks" hint="Distance to ORR, highway, upcoming projects">
            <input value={value.landmarks} onChange={set('landmarks')} placeholder="e.g. 6 km from ORR Exit 3" />
          </Field>
        </div>
        <Field label="Boundaries" hint="What lies on each side, as written in the documents">
          <textarea
            rows={2}
            value={value.boundaries}
            onChange={set('boundaries')}
            placeholder="North: … · South: … · East: … · West: …"
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Ownership &amp; Legal</legend>
        <div className="lf-grid">
          <Field label="Survey number">
            <input value={value.surveyNumber} onChange={set('surveyNumber')} placeholder="e.g. Sy. No. 123/A" />
          </Field>
          <Field label="Pattadar (owner on record)">
            <input value={value.pattadar} onChange={set('pattadar')} placeholder="Name as in Bhu Bharati" />
          </Field>
          <Field label="Pattadar passbook">
            <Select value={value.passbook} onChange={set('passbook')} options={PASSBOOK} />
          </Field>
          <Field label="Title status">
            <Select value={value.titleStatus} onChange={set('titleStatus')} options={TITLE_STATUS} />
          </Field>
          <Field label="Encumbrance (EC)">
            <Select value={value.ecStatus} onChange={set('ecStatus')} options={EC_STATUS} />
          </Field>
          <Field label="Litigation">
            <Select value={value.litigation} onChange={set('litigation')} options={LITIGATION} />
          </Field>
          <Field label="Zoning (master plan)">
            <Select value={value.zoning} onChange={set('zoning')} options={ZONING} />
          </Field>
          <Field label="Land-use conversion">
            <Select value={value.conversion} onChange={set('conversion')} options={CONVERSION} />
          </Field>
          <Field label="Approval">
            <Select value={value.approval} onChange={set('approval')} options={LAND_APPROVALS} />
          </Field>
          <Field label="RERA / LP number" hint="For an approved layout">
            <input value={value.reraNumber} onChange={set('reraNumber')} placeholder="RERA or layout permit number" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Documents &amp; Media</legend>
        <div className="lf-grid">
          <FileField
            label="Layout plan / survey sketch"
            value={value.layoutPlanUrl}
            onChange={setUrl('layoutPlanUrl')}
            accept="application/pdf,image/*"
            hint="Layout copy or FMB sketch — PDF or image, up to 8 MB"
          />
          <FileField
            label="Brochure"
            value={value.brochureUrl}
            onChange={setUrl('brochureUrl')}
            accept="application/pdf,image/*"
            hint="PDF, up to 8 MB"
          />
          <FileField
            label="Video"
            value={value.videoLink}
            onChange={setUrl('videoLink')}
            accept="video/*"
            placeholder="Drone / walkthrough link, or upload a clip"
            hint="Long video belongs on a link — only clips under 8 MB can be uploaded."
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
            placeholder="Owner expectations, access issues, anything the team should know"
          />
        </Field>
      </fieldset>
    </div>
  );
}
