import { Navigate } from 'react-router-dom';
import PortalLayout from './dashboard/PortalLayout';
import { getModule, canAccess, roleLabel, scopeFor } from '../lib/roleConfig';
import { getRole } from '../lib/storage';

const SCOPE_TEXT = {
  all: 'You see every record in this module.',
  own: 'You see only your own records.',
  upcoming: 'You see new and upcoming listings only.',
};

/* Renders a module that has access control wired up but no screen built yet.
   It states who can reach it and what the spec says belongs here, so the
   permission model is testable now and the build-out is scoped. */
export default function ModulePage({ moduleKey }) {
  const role = getRole();
  const mod = getModule(moduleKey);

  if (!mod) return <Navigate to="/dashboard" replace />;

  /* Route-level enforcement: typing the URL directly must not get you in. */
  if (!canAccess(moduleKey, role)) {
    return (
      <PortalLayout>
        <section className="panel">
          <h4>Access denied</h4>
          <div className="muted small">
            {roleLabel(role)} does not have access to {mod.label.replace(/^\S+\s/, '')}.
          </div>
        </section>
      </PortalLayout>
    );
  }

  const scope = scopeFor(moduleKey, role);

  return (
    <PortalLayout>
      <section className="panel">
        <h4>{mod.label}</h4>
        <div className="muted small">
          Open to: {mod.roles.map(roleLabel).join(', ')}
          {scope ? ` — ${SCOPE_TEXT[scope]}` : ''}
        </div>
      </section>

      <section className="panel">
        <h4>What belongs here</h4>
        <div className="muted small">From the portal spec</div>
        <div className="studio-tiles">
          {(mod.contents || ['Not yet specified.']).map((line) => (
            <div className="studio-tile" key={line}>
              {line}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h4>Status</h4>
        <div className="muted small">
          Screen not built yet. Access control for this module is live — the sidebar only offers it to the
          roles listed above, and this route rejects anyone else.
        </div>
      </section>
    </PortalLayout>
  );
}
