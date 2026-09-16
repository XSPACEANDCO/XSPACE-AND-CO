import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import RequireAuth from './routes/RequireAuth';
import RequireModule from './routes/RequireModule';
import { ROUTES } from './lib/roleConfig';
import { App as CapApp } from '@capacitor/app';



import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Clients from './pages/Clients';
import LeadView from './pages/LeadView';
import Listings from './pages/Listings';
import ListingView from './pages/ListingView';
import SiteVisits from './pages/SiteVisits';
import Teams from './pages/Teams';

/* Pages where pressing back exits the app rather than navigating further back. */
const ROOT_PAGES = new Set(['/dashboard', '/login', '/']);

/* Module routes that already have a screen. Everything else in the registry
   renders ModulePage, which states what the spec says belongs there. Both go
   through RequireModule, so a built page is no easier to reach by URL than a
   placeholder one. */
const BUILT = {
  '/dashboard': <Dashboard />,
  '/clients': <Clients />,
  '/listings': <Listings />,
  '/site-visits': <SiteVisits />,

  /* Accounts. Four rosters behind four tabs — see pages/Teams.jsx. This is
     where a Founder creates Core members and a Founder or Core member creates
     partners, so it is the only way anyone gets a login. */
  '/teams': <Teams />,
};

const guard = (el) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  /* Android hardware back button — navigate back inside the app instead of
     closing it. Exit only when there is nowhere left to go (root pages).   */
  useEffect(() => {
    const handler = CapApp.addListener('backButton', () => {
      if (ROOT_PAGES.has(location.pathname)) {
        // Already at a root page — exit the app.
        CapApp.exitApp();
      } else {
        // Go back one step in React Router history.
        navigate(-1);
      }
    });
    return () => { handler.then(h => h.remove()); };
  }, [location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />

      {ROUTES.map((to) => (
        <Route key={to} path={to} element={guard(<RequireModule to={to} element={BUILT[to]} />)} />
      ))}

      {/* detail views, reached from their list page */}
      <Route path="/clients/:id" element={guard(<RequireModule to="/clients" element={<LeadView />} />)} />
      <Route path="/listings/:id" element={guard(<RequireModule to="/listings" element={<ListingView />} />)} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
