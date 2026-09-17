import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import RequireAuth from './routes/RequireAuth';
import RequireModule from './routes/RequireModule';
import { ROUTES } from './lib/roleConfig';
import { App as CapApp } from '@capacitor/app';



import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import PortalLayout from './pages/dashboard/PortalLayout';
import Clients from './pages/Clients';
import LeadView from './pages/LeadView';
import Listings from './pages/Listings';
import ListingView from './pages/ListingView';
import Projects from './pages/Projects';
import MediaUpload from './pages/MediaUpload';
import RawMedia from './pages/RawMedia';
import MediaLibrary from './pages/MediaLibrary';
import SiteVisits from './pages/SiteVisits';
import Teams from './pages/Teams';

/* Pages where pressing back exits the app rather than navigating further back. */
const ROOT_PAGES = new Set(['/dashboard', '/login', '/']);

/* Every in-portal screen gets the same shell — sidebar, top bar, modals — so
   navigation does not disappear the moment you leave the dashboard. These
   pages were ported from standalone HTML documents and used to render
   full-bleed with no way back except the browser's own Back button. */
const shell = (el) => <PortalLayout>{el}</PortalLayout>;

/* Module routes that already have a screen. Everything else in the registry
   renders ModulePage, which states what the spec says belongs there. Both go
   through RequireModule, so a built page is no easier to reach by URL than a
   placeholder one. */
const BUILT = {
  /* Dashboard brings its own PortalLayout. */
  '/dashboard': <Dashboard />,
  '/clients': shell(<Clients />),
  '/listings': shell(<Listings />),
  '/projects': shell(<Projects />),
  '/site-visits': shell(<SiteVisits />),

  /* Media pipeline: upload -> edit -> review. See server/src/routes/media.js */
  '/media-upload': shell(<MediaUpload />),
  '/raw-media': shell(<RawMedia />),
  '/media-library': shell(<MediaLibrary />),

  /* Accounts. Four rosters behind four tabs — see pages/Teams.jsx. Brings its
     own PortalLayout. This is where a Founder creates Core members and a
     Founder or Core member creates partners, so it is the only way anyone
     gets a login. */
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
      <Route path="/clients/:id" element={guard(<RequireModule to="/clients" element={shell(<LeadView />)} />)} />
      <Route path="/listings/:id" element={guard(<RequireModule to="/listings" element={shell(<ListingView />)} />)} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
