import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KEYS, getJSON, getRole, getCurrentUserId } from '../lib/storage';
import { usePageClass } from '../hooks/usePageClass';
import './listings.css';

/* Submitted inventory, verbatim from listings.html. The submittedBy ids line
   up with the seeded user records. */
const INITIAL_LISTINGS = [
  { id: 1, title: 'MyHome Avatar – 3BHK', location: 'Tellapur', price: '₹1.15 Cr', submittedBy: 'u3', submittedByName: 'Sai', status: 'unverified' },
  { id: 2, title: 'Vasavi Skyla – 2BHK', location: 'Nallagandla', price: '₹92 L', submittedBy: 'u2', submittedByName: 'Karthik', status: 'verified' },
  { id: 3, title: 'Standalone Apartment', location: 'Miyapur', price: '₹68 L', submittedBy: 'u4', submittedByName: 'Priya', status: 'unverified' },
];

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export default function Listings() {
  usePageClass('listings');
  const navigate = useNavigate();
  const [listings, setListings] = useState(INITIAL_LISTINGS);

  /* The original hard-coded a demo user here; reading the live session instead
     keeps this page consistent with whoever is logged in. */
  const currentUser = useMemo(() => {
    const role = getRole();
    const id = getCurrentUserId();
    const users = getJSON(KEYS.users);
    const me = users.find((u) => u.id === id);
    return { id: id || 'u3', name: me ? me.name : 'You', role };
  }, []);

  const canSeeAll = currentUser.role === 'founder' || currentUser.role === 'core';
  const canVerify = canSeeAll;

  const visible = canSeeAll ? listings : listings.filter((l) => l.submittedBy === currentUser.id);

  function addListing() {
    const title = prompt('Listing title:');
    if (!title) return;
    setListings((prev) => [
      ...prev,
      {
        id: Date.now(),
        title,
        location: '—',
        price: '—',
        submittedBy: currentUser.id,
        submittedByName: currentUser.name,
        status: 'unverified',
      },
    ]);
  }

  function verifyListing(id) {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'verified' } : l)));
    alert('Listing verified. Ready to move to Projects.');
  }

  return (
    <div className="page-listings">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>Listings</h1>
            <p className="small">All submitted inventory (internal)</p>
          </div>

          <button onClick={addListing}>+ Add Listing</button>
        </div>

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
            {visible.map((l) => (
              <tr key={l.id}>
                <td className="title-cell" onClick={() => navigate('/listings/' + l.id)}>
                  <strong>{l.title}</strong>
                </td>
                <td>{l.location}</td>
                <td>{l.price}</td>
                <td>
                  {l.submittedByName}
                  {l.submittedBy === currentUser.id && <div className="small">(You)</div>}
                </td>
                <td>
                  <span className={'badge ' + l.status}>{capitalize(l.status)}</span>
                </td>
                {canVerify && (
                  <td>
                    {l.status === 'unverified' && (
                      <button className="action-btn" onClick={() => verifyListing(l.id)}>
                        Verify
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
