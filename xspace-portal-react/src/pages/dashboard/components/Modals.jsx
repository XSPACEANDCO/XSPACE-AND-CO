import { useEffect, useState } from 'react';
import { timeAgo } from '../../../lib/time';
import { ROLES, ROLE_KEYS } from '../../../lib/roleConfig';
import { useDashboard } from '../DashboardStore';

/* Shared shell: backdrop click closes, same markup the original used. */
function ModalShell({ onClose, labelledBy, children }) {
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Notification Center ---------- */
export function NotificationCenter({ onClose, onRaiseTicket }) {
  const { role, notifications } = useDashboard();
  const [filter, setFilter] = useState('all');

  let items = notifications.slice().reverse().filter((n) => !n.role || n.role === role || n.role === 'all');
  if (filter === 'unread') items = items.filter((i) => !i.read);
  else if (filter !== 'all') items = items.filter((i) => i.type === filter.replace(/s$/, ''));

  return (
    <ModalShell onClose={onClose} labelledBy="notifTitle">
      <h3 id="notifTitle">Notification Center</h3>
      <div className="modal-row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="approvals">Approvals</option>
          <option value="tickets">Tickets</option>
          <option value="tasks">Tasks</option>
        </select>
        <div className="push">
          <button className="btn" onClick={onRaiseTicket}>Raise Query</button>{' '}
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="modal-list">
        {items.length === 0 ? (
          <div className="small muted">No notifications</div>
        ) : (
          items.map((n) => (
            <div className="notif-item" key={n.id}>
              <div className="row">
                <div>
                  <strong>{n.title}</strong>
                  <div className="small muted">{n.body}</div>
                </div>
                <div className="small muted">{timeAgo(n.ts)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- Raise a Query / Ticket ---------- */
export function TicketModal({ onClose }) {
  const { addTicket, addNotification, addAudit, currentUser } = useDashboard();
  const [category, setCategory] = useState('listing');
  const [priority, setPriority] = useState('medium');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  function create() {
    if (!title.trim() || !desc.trim()) {
      alert('Please enter title & description');
      return;
    }
    addTicket({ category, priority, title: title.trim(), desc: desc.trim() });
    addNotification({ type: 'ticket', title: `Ticket: ${title.trim()}`, body: desc.trim(), role: 'core' });
    addAudit(`Ticket created: ${title.trim()} by ${currentUser ? currentUser.name : 'user'}`);
    alert('Ticket created (demo).');
    onClose();
  }

  return (
    <ModalShell onClose={onClose} labelledBy="ticketTitle">
      <h3 id="ticketTitle">Raise a Query / Ticket</h3>
      <div className="modal-row">
        <div style={{ flex: 1 }}>
          <label className="small">Category</label>
          <br />
          <select className="full" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="listing">Listing</option>
            <option value="legal">Legal</option>
            <option value="visit">Visit</option>
            <option value="media">Media / Studio</option>
            <option value="payment">Payment / Commission</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div style={{ width: 140 }}>
          <label className="small">Priority</label>
          <br />
          <select className="full" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="small">Title</label>
        <input className="full" placeholder="Brief title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="small">Description</label>
        <textarea className="full" rows={5} placeholder="Describe the issue" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={create}>Create Ticket</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </ModalShell>
  );
}

/* ---------- Contact Core (partner roles only) ---------- */
export function ContactCoreModal({ onClose }) {
  const { addTicket, addNotification, addAudit, currentUser } = useDashboard();
  const [showContacts, setShowContacts] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  function send() {
    const msg = message.trim();
    if (!msg) {
      alert('Please enter a message');
      return;
    }
    const who = currentUser ? currentUser.name : 'Partner';
    addTicket({ category: 'internal_contact', priority: 'medium', title: 'Partner message to Core', desc: msg });
    addNotification({ type: 'ticket', title: `Partner message from ${who}`, body: msg, role: 'core' });
    addAudit(`Partner message sent to Core: ${who}`);
    alert('Message sent to Core team (demo). A ticket has been created.');
    onClose();
  }

  return (
    <ModalShell onClose={onClose} labelledBy="contactCoreTitle">
      <h3 id="contactCoreTitle">Contact Core Team</h3>

      <div style={{ marginTop: 12 }}>
        <div className="small muted">
          Quick contact options — Core Team will receive a notification / ticket when you send a message.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => {
              setShowContacts((v) => !v);
              setShowForm(false);
            }}
          >
            View Core Contacts
          </button>
          <button
            className="btn"
            onClick={() => {
              setShowForm(true);
              setShowContacts(false);
            }}
          >
            Send Message to Core
          </button>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        {showContacts && (
          <div style={{ marginTop: 12 }}>
            <div className="contact-card">
              <div><strong>Core Team</strong></div>
              <div className="small muted">Karthik (Core) — +91 90000 00002 • karthik@xspace.co</div>
              <div className="spacer-8" />
              <div className="small muted">
                If urgent, call directly. Otherwise use "Send Message" and Core will get a ticket.
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div style={{ marginTop: 12 }}>
            <label className="small">Message to Core</label>
            <br />
            <textarea
              className="full"
              rows={4}
              placeholder="Describe the issue or request to Core team"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={send}>Send</button>
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- Profile ---------- */
export function ProfileModal({ onClose }) {
  const { currentUser, update, addAudit, switchRole, role } = useDashboard();
  const [form, setForm] = useState({ name: '', email: '', role: 'realtor', presence: 'online' });

  useEffect(() => {
    if (currentUser) {
      setForm({
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        presence: currentUser.presence || 'online',
      });
    }
  }, [currentUser]);

  function save() {
    if (!currentUser) return;
    update('users', (prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, ...form } : u)));
    addAudit(`Profile updated: ${form.name}`);
    /* Changing your own role re-scopes the whole dashboard, as before. */
    if (role !== form.role) switchRole(form.role);
    onClose();
  }

  return (
    <ModalShell onClose={onClose} labelledBy="profileTitle">
      <h3 id="profileTitle">Profile</h3>
      <div className="profile-body">
        <div className="profile-side">
          <div className="profile-avatar-large" />
          <div style={{ marginTop: 8 }}>
            <button className="btn-ghost" onClick={() => alert('Upload photo (demo)')}>Upload</button>
          </div>
        </div>
        <div className="profile-fields">
          <label className="small">Full name</label>
          <br />
          <input className="full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="small">Email</label>
              <br />
              <input className="full" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div style={{ width: 140 }}>
              <label className="small">Role</label>
              <br />
              <select className="full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ROLES[k].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <label className="small">Presence</label>
            <select value={form.presence} onChange={(e) => setForm({ ...form, presence: e.target.value })}>
              <option value="online">Online</option>
              <option value="away">Away</option>
              <option value="dnd">Do not disturb</option>
            </select>
            <div className="push">
              <button className="btn" onClick={save}>Save</button>{' '}
              <button className="btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
