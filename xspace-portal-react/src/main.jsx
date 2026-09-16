import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { purgeDemoData } from './lib/storage';
import './styles/global.css';

/* The portal used to seed a blob of invented users, projects, listings, leads
   and visits into localStorage before the first paint, and the pages read
   from it. That is why the same fake names appeared for everyone.

   Nothing is seeded now — every page reads the database through lib/api.js.
   This clears the old blob out of browsers and phones that still carry it,
   which is what makes the invented rows disappear from devices already in
   use rather than only from new ones. */
purgeDemoData();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
