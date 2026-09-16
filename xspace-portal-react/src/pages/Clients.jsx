import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageClass } from '../hooks/usePageClass';
import { timeAgo } from '../lib/time';
import './clients.css';

/* Demo roster, verbatim from client.html. */
const CLIENTS = [
  { id: 1, name: 'Ramesh Kumar', source: 'Instagram', phone: '9000011111', req: '2BHK • Kukatpally • ₹90L', status: 'visit', temperature: 'hot', createdAt: '2026-09-15T10:24:00' },
  { id: 2, name: 'Sita Reddy', source: 'Referral', phone: '9000022222', req: '3BHK • Nallagandla • ₹1.2Cr', status: 'contacted', temperature: 'warm', createdAt: '2026-09-14T16:05:00' },
  { id: 3, name: 'Rahul Jain', source: 'Website', phone: '9000033333', req: '2BHK • Miyapur • ₹75L', status: 'new', temperature: 'cold', createdAt: '2026-09-12T09:40:00' },
  { id: 4, name: 'Anjali Sharma', source: 'Walk-in', phone: '9000044444', req: 'Villa • Tellapur • ₹1.8Cr', status: 'negotiation', temperature: 'hot', createdAt: '2026-09-09T18:12:00' },
];

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  visit: 'Site Visit Done',
  negotiation: 'Negotiation',
  closed: 'Closed',
};

const TEMP_LABELS = { hot: '🔥 Hot', warm: '🌤️ Warm', cold: '❄️ Cold' };

export default function Clients() {
  usePageClass('clients');
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const visible = useMemo(
    () => (filter === 'all' ? CLIENTS : CLIENTS.filter((c) => c.status === filter)),
    [filter]
  );

  return (
    <div className="page-clients">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>Clients</h1>
            <p className="subtitle">Click on a client to view complete details</p>
          </div>

          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Clients</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="visit">Site Visit Done</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Requirement</th>
              <th>Added</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} onClick={() => navigate('/clients/' + c.id)}>
                <td>
                  {c.name}
                  <span className={'temp ' + c.temperature}>{TEMP_LABELS[c.temperature] || ''}</span>
                  <span className="source">{c.source}</span>
                </td>
                <td>{c.phone}</td>
                <td>{c.req}</td>
                <td className="stamp">
                  {STAMP.format(new Date(c.createdAt))}
                  <span className="source">{timeAgo(new Date(c.createdAt).getTime())}</span>
                </td>
                <td>
                  <span className={'status ' + c.status}>{STATUS_LABELS[c.status] || c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
