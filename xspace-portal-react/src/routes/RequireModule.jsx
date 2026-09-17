import PortalLayout from '../pages/dashboard/PortalLayout';
import ModulePage from '../pages/ModulePage';
import { moduleForRoute, roleLabel } from '../lib/roleConfig';
import { getRole } from '../lib/storage';

/* Route-level permission gate.

   A route may back more than one module, so the role gets in if any module
   mapped to the route allows it. Pages that exist render; the rest fall
   through to ModulePage, which describes what belongs there.

   This is front-end gating only. It decides what to paint, not what the user
   is allowed to have; the same checks have to exist on the server. */
export default function RequireModule({ to, element }) {
  const role = getRole();
  const mod = moduleForRoute(to, role);

  if (!mod) {
    return (
      <PortalLayout>
        <section className="panel">
          <h4>Access denied</h4>
          <div className="muted small">
            {roleLabel(role)} does not have access to this module.
          </div>
        </section>
      </PortalLayout>
    );
  }

  return element || <ModulePage moduleKey={mod.key} />;
}
