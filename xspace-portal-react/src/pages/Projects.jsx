import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { propertyLabel } from '../lib/leadStatus';
import './projects.css';

/* Verified inventory.

   A listing arrives in Listings as a submission, gets checked against the
   government portals, and on verification is published here. So this page is
   not a second copy of Listings — it is what survived verification, and it is
   the only inventory anyone should be showing a client. */

const STAMP = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
});

export default function Projects() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      /* The verified listings are fetched alongside so each project can link
         straight to the sheet that was verified. */
      const [projectsOut, listingsOut] = await Promise.all([
        api.projects.list(),
        api.listings.list({ include: 'verified' }).catch(() => ({ listings: [] })),
      ]);
      setProjects(projectsOut.projects || []);
      setListings((listingsOut.listings || []).filter((l) => l.verified));
    } catch (err) {
      setError(err.message || 'Could not load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const listingFor = (projectId) => listings.find((l) => l.project_id === projectId);

  return (
    <div className="page-projects">
      <div className="container">
        <div className="top-bar">
          <div>
            <h1>Projects</h1>
            <p className="small">Verified inventory — published from Listings after verification</p>
          </div>
        </div>

        {error && <div className="projects-error">{error}</div>}

        {loading ? (
          <p className="small">Loading projects…</p>
        ) : projects.length === 0 ? (
          <p className="small">
            No projects yet. Verify a listing from the Listings page and it will be published here.
          </p>
        ) : (
          <div className="project-grid">
            {projects.map((p) => {
              const listing = listingFor(p.id);
              return (
                <article className="project-card" key={p.id}>
                  <header>
                    <h3>{p.name}</h3>
                    <span className="badge verified">Verified</span>
                  </header>

                  <div className="small muted">
                    📍 {p.area || '—'}
                    {p.builder ? ` • ${p.builder}` : ''}
                  </div>

                  <dl className="project-facts">
                    <div>
                      <dt>Type</dt>
                      <dd>{propertyLabel(p.property_type) || '—'}</dd>
                    </div>
                    <div>
                      <dt>Configuration</dt>
                      <dd>{p.configuration || '—'}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>{p.price || '—'}</dd>
                    </div>
                    <div>
                      <dt>Possession</dt>
                      <dd>{p.possession || '—'}</dd>
                    </div>
                    <div>
                      <dt>RERA</dt>
                      <dd>{p.rera || p.listing_rera || '—'}</dd>
                    </div>
                    <div>
                      <dt>Verified</dt>
                      <dd>{p.verified_at ? STAMP.format(new Date(p.verified_at)) : '—'}</dd>
                    </div>
                  </dl>

                  <footer>
                    <span className="small muted">
                      {p.listing_count} verified {p.listing_count === 1 ? 'unit' : 'units'}
                    </span>
                    {listing && (
                      <button className="btn-ghost" onClick={() => navigate('/listings/' + listing.id)}>
                        Open listing sheet
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
