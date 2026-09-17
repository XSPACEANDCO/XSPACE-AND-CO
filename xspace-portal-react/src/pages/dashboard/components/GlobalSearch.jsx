import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/api';

/* The top-bar search.

   The box has been there since the portal was a static mock; until now it was
   an <input> with no handler, so typing in it did nothing. It searches
   clients, listings, projects, people and media, and the server decides what
   comes back — a partner searching gets only their own rows, and only from
   modules they can open.

   Typing is debounced so a query is sent once you pause rather than on every
   keystroke, and every response carries the query that produced it so a slow
   reply for "rad" can never overwrite the results for "radha". */

const DEBOUNCE_MS = 250;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const boxRef = useRef(null);
  /* The query whose results are currently on screen — see note above. */
  const latest = useRef('');

  useEffect(() => {
    const term = q.trim();
    latest.current = term;

    if (term.length < 2) {
      setGroups([]);
      setSearched(false);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const out = await api.search(term);
        /* Ignore a reply that arrived after the query moved on. */
        if (latest.current !== term) return;
        setGroups(out.groups || []);
        setSearched(true);
      } catch {
        if (latest.current === term) setGroups([]);
      } finally {
        if (latest.current === term) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q]);

  /* Clicking anywhere else closes the results. */
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function go(item) {
    setOpen(false);
    setQ('');
    navigate(item.to);
  }

  const hasResults = groups.some((g) => g.items.length > 0);

  return (
    <div className="gsearch" ref={boxRef}>
      <input
        className="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Search listings, projects, clients..."
        aria-label="Search"
      />

      {open && q.trim().length >= 2 && (
        <div className="gsearch-panel" role="listbox">
          {loading && <div className="gsearch-note">Searching…</div>}

          {!loading && !hasResults && searched && (
            <div className="gsearch-note">
              Nothing matches “{q.trim()}”.
            </div>
          )}

          {!loading &&
            groups.map((group) => (
              <div className="gsearch-group" key={group.key}>
                <div className="gsearch-label">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    type="button"
                    className="gsearch-item"
                    key={`${group.key}-${item.id}`}
                    onClick={() => go(item)}
                  >
                    <span className="gsearch-title">{item.title}</span>
                    {item.subtitle && <span className="gsearch-sub">{item.subtitle}</span>}
                    {item.badge && <span className="gsearch-badge">{item.badge}</span>}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
