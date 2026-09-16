import { usePageClass } from '../hooks/usePageClass';
import './listingview.css';

/* Static detail sheet, content unchanged from listingsview.html. Each group is
   a list so the four-up .grid boxes stay uniform. */
const SNAPSHOT = [
  ['Builder', 'MyHome Group'],
  ['Property Type', 'Apartment (Gated)'],
  ['Configuration', '3BHK'],
  ['Possession', 'Dec 2027'],
];

const UNIT = [
  ['Super Built-up Area', '2,050 sft'],
  ['Carpet Area', '1,450 sft'],
  ['UDS', '65 sq yds'],
  ['Facing', 'East'],
];

const PRICE = [
  ['Base Price', '₹1.05 Cr'],
  ['All-Inclusive', '₹1.15 Cr'],
  ['Negotiation', 'Limited'],
  ['Commission', '2% (Builder)'],
];

const LEGAL = [
  ['RERA No.', 'P02400005555'],
  ['Approval', 'HMDA'],
  ['Title Status', 'Clear'],
  ['Bank Approved', 'HDFC, SBI, ICICI'],
];

const AMENITIES = [
  '🏊 Swimming Pool',
  '🏋️ Gymnasium',
  '🌳 Landscaped Gardens',
  '🎾 Sports Courts',
  '🧒 Children’s Play Area',
  '🛡️ 24×7 Security',
  '🚗 Visitor Parking',
  '🏠 Clubhouse',
  '🚶 Jogging Track',
];

function Grid({ rows }) {
  return (
    <div className="grid">
      {rows.map(([label, value]) => (
        <div className="box" key={label}>
          <strong>{label}</strong>
          {value}
        </div>
      ))}
    </div>
  );
}

export default function ListingView() {
  usePageClass('listingview');

  return (
    <div className="page-listingview">
      <div className="container">
        {/* HEADER */}
        <div className="section header">
          <div>
            <h1>MyHome Avatar – 3BHK</h1>
            <div className="small">📍 Tellapur, West Hyderabad</div>
            <div className="small">Submitted by: Sai (Agent)</div>
            <div className="small hot">🔥 High Demand</div>
          </div>
          <div>
            <span className="badge verified">Verified</span>
          </div>
        </div>

        <div className="section">
          <h3>Project Snapshot</h3>
          <Grid rows={SNAPSHOT} />
        </div>

        <div className="section">
          <h3>Unit Details</h3>
          <Grid rows={UNIT} />
        </div>

        <div className="section">
          <h3>Amenities</h3>
          <div className="amenities">
            {AMENITIES.map((a) => (
              <div className="amenity" key={a}>
                {a}
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Price &amp; Commercials</h3>
          <Grid rows={PRICE} />
        </div>

        <div className="section">
          <h3>Legal &amp; Verification</h3>
          <Grid rows={LEGAL} />
        </div>

        {/* MEDIA & DOCUMENTS */}
        <div className="section">
          <h3>Media &amp; Documents</h3>

          <div className="box media-box">
            <strong>Photos</strong>
            <div className="small">Elevation, amenities, site images</div>
            <input type="file" multiple accept="image/*" />
          </div>

          <div className="box media-box">
            <strong>Videos</strong>
            <div className="small">Walkthrough / Drone / Reel</div>
            <input type="file" multiple accept="video/*" />
            <input type="text" placeholder="Instagram / YouTube video link" />
          </div>

          <div className="box">
            <strong>Documents (PDF)</strong>
            📄 Brochure
            <input type="file" accept=".pdf" />
            <br />
            <br />
            📄 Floor Plan
            <input type="file" accept=".pdf" />
            <br />
            <br />
            📄 Price Sheet
            <input type="file" accept=".pdf" />
          </div>
        </div>

        <div className="section">
          <h3>Site Visits</h3>
          <div className="small">
            • 12 Jan 2026 – Ramesh Kumar
            <br />• 18 Jan 2026 – NRI Client (Scheduled)
          </div>
        </div>

        <div className="section">
          <h3>Internal Notes</h3>
          <div className="small">
            Tower B preferred. Clients asking for higher floors. Inventory moving fast.
          </div>
        </div>
      </div>
    </div>
  );
}
