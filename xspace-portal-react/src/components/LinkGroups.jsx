/* Renders a grouped list of external links — see lib/links.js. Each opens in
   a new tab, so the portal stays where it was. */
export default function LinkGroups({ groups }) {
  return groups.map((g) => (
    <div className="link-group" key={g.group}>
      <h5>{g.group}</h5>
      <div className="portal-list">
        {g.links.map((l) => (
          <a className="portal" key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
            <strong>{l.label} ↗</strong>
            <span className="small muted">{l.hint}</span>
          </a>
        ))}
      </div>
    </div>
  ));
}
