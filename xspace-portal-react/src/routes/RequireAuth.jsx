import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { getToken } from '../lib/api';

/* Front-end guard: no API token means bounce to login. ?dev=1 still bypasses
   it for local work on the UI without a running backend.

   This only decides what to render — the API re-checks every request, so a
   forged token here gets you a login screen's worth of nothing. */
export default function RequireAuth({ children }) {
  const [params] = useSearchParams();
  const location = useLocation();

  if (params.get('dev')) return children;
  if (!getToken()) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}
