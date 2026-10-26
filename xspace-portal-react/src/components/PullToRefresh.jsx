import { useEffect, useRef, useState } from 'react';
import './pullToRefresh.css';

/* Pull down from the top of any page to reload it.

   The Android app is a WebView, which has no pull-to-refresh of its own, and
   mobile Chrome's built-in one is switched off in global.css
   (overscroll-behavior) so the two never fire together. One gesture, the same
   everywhere.

   A pull only starts when the page is at the very top and the finger is not
   inside something that scrolls on its own (a modal, the sidebar, a wide
   table) and is itself scrolled down — otherwise scrolling back up through a
   list would keep reloading the page. */

const TRIGGER = 70; // px of (damped) pull needed to reload
const MAX = 110;

function scrolledAncestor(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollTop > 0) return node;
  }
  return null;
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null);
  const current = useRef(0);

  useEffect(() => {
    function onStart(e) {
      if (refreshing || e.touches.length !== 1 || window.scrollY > 0) return;
      if (e.target.closest?.('.modal-backdrop, [data-no-pull-refresh]')) return;
      if (scrolledAncestor(e.target)) return;
      start.current = e.touches[0].clientY;
    }

    function onMove(e) {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        current.current = 0;
        setPull(0);
        return;
      }
      e.preventDefault();
      current.current = Math.min(dy * 0.5, MAX);
      setPull(current.current);
    }

    function onEnd() {
      if (start.current === null) return;
      start.current = null;
      if (current.current >= TRIGGER) {
        setRefreshing(true);
        setPull(TRIGGER);
        window.location.reload();
      } else {
        setPull(0);
      }
      current.current = 0;
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing]);

  if (pull === 0 && !refreshing) return null;

  const ready = pull >= TRIGGER;
  return (
    <div
      className={'ptr' + (start.current === null ? ' ptr-settle' : '')}
      style={{ transform: `translate(-50%, ${pull - 44}px)` }}
      role="status"
      aria-label={refreshing ? 'Refreshing' : ready ? 'Release to refresh' : 'Pull to refresh'}
    >
      <div
        className={'ptr-spinner' + (refreshing ? ' ptr-spinning' : '')}
        style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(pull / TRIGGER, 1) }}
      />
    </div>
  );
}
