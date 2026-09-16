import { useEffect } from 'react';
import api, { getToken } from '../lib/api';

/* Keeps this session's presence honest.

   The server infers presence from the last time it heard from you, which on
   its own cannot tell a closed laptop from a quiet one — everybody stayed
   "online" until a timeout expired. So two things happen here:

     - while the page is actually visible, a heartbeat every 45 seconds keeps
       the account reading as online;
     - the moment the page is hidden or closed, a sign-off request pushes the
       timestamp back so the account reads as offline immediately.

   `pagehide` rather than `beforeunload`: it is the only one that fires
   reliably on mobile, where the app is usually backgrounded rather than
   closed. `visibilitychange` covers switching apps or tabs, and coming back
   sends a heartbeat straight away rather than waiting out the interval. */

const BEAT_MS = 45_000;

export function usePresence() {
  useEffect(() => {
    if (!getToken()) return undefined;

    let timer = null;

    const beat = () => {
      if (document.visibilityState === 'visible') api.auth.heartbeat().catch(() => {});
    };

    const start = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, BEAT_MS);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        /* Backgrounded: stop beating and say so, rather than going quiet and
           being reported as online until the window lapses. */
        stop();
        api.auth.goOffline();
      }
    };

    const onPageHide = () => {
      stop();
      api.auth.goOffline();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
