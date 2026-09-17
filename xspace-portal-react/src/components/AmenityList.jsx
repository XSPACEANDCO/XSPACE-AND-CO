/* Amenities, one per box.

   This was a textarea where each line became an amenity. That works but reads
   as a wall of text, and it is easy to lose track of what you have typed
   halfway down. One box per amenity makes each entry a thing you can see,
   edit and delete on its own.

   The value is still stored as newline-separated text, so nothing downstream
   changes and listings entered before this control still open correctly —
   splitting and joining happens here rather than in the database. */

const SUGGESTIONS = [
  'Swimming Pool', 'Gymnasium', 'Clubhouse', '24×7 Security', 'Power Backup',
  'Covered Parking', 'Landscaped Gardens', 'Children’s Play Area',
  'Jogging Track', 'Indoor Games', 'Lift', 'Rainwater Harvesting',
];

export default function AmenityList({ value, onChange }) {
  /* Always render one empty box at the end so there is somewhere to type
     without pressing Add first. */
  const items = String(value || '').split('\n');
  const rows = items.length === 0 || items[items.length - 1].trim() !== '' ? [...items, ''] : items;

  const commit = (next) => onChange(next.join('\n').replace(/\n+$/, ''));

  const setAt = (i, text) => {
    const next = [...rows];
    next[i] = text;
    commit(next);
  };

  const removeAt = (i) => commit(rows.filter((_, n) => n !== i));

  const add = (text) => {
    const filled = rows.filter((r) => r.trim());
    if (filled.some((r) => r.toLowerCase() === text.toLowerCase())) return;
    commit([...filled, text]);
  };

  const chosen = new Set(rows.map((r) => r.trim().toLowerCase()).filter(Boolean));
  const remaining = SUGGESTIONS.filter((s) => !chosen.has(s.toLowerCase()));

  return (
    <div className="amenity-list">
      <div className="al-boxes">
        {rows.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div className="al-box" key={i}>
            <input
              value={row}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={i === rows.length - 1 ? 'Add an amenity…' : ''}
              onKeyDown={(e) => {
                /* Enter moves to a new box rather than submitting the form. */
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (row.trim()) commit([...rows.filter((r) => r.trim()), '']);
                }
              }}
            />
            {row.trim() !== '' && (
              <button
                type="button"
                className="al-remove"
                aria-label={`Remove ${row}`}
                title="Remove"
                onClick={() => removeAt(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {remaining.length > 0 && (
        <div className="al-suggest">
          <span className="al-suggest-label">Common:</span>
          {remaining.slice(0, 8).map((s) => (
            <button type="button" className="al-chip" key={s} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
