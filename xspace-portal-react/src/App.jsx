import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './routes/RequireAuth';
import RequireModule from './routes/RequireModule';
import { ROUTES } from './lib/roleConfig';

import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Clients from './pages/Clients';
import LeadView from './pages/LeadView';
import Listings from './pages/Listings';
import ListingView from './pages/ListingView';
import SiteVisits from './pages/SiteVisits';
import Teams from './pages/Teams';

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
