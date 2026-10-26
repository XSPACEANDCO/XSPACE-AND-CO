// Usage: node scripts/check-db-url.cjs <file containing the DATABASE_URL>
// Checks the connection string for common mistakes and tries to connect.
// Never prints the password.
const fs = require('fs');
const pg = require('pg');

const raw = fs.readFileSync(process.argv[2], 'utf8');
const url = raw.trim();
const problems = [];

if (raw !== url) problems.push('leading/trailing whitespace or newline (trimmed for this test - remove it in Render too)');
if (/^["']|["']$/.test(url)) problems.push('wrapped in quotes - remove them');
if (/\[|\]/.test(url)) problems.push('contains [ or ] - remove the brackets around the password');
if ((url.match(/@/g) || []).length > 1) problems.push('more than one @ - encode @ in the password as %40');

let u;
try {
  u = new URL(url.replace(/^["']|["']$/g, ''));
} catch (e) {
  console.log('Not a valid URL:', e.message);
  process.exit(1);
}

const password = decodeURIComponent(u.password);
console.log('user     :', decodeURIComponent(u.username));
console.log('host     :', u.hostname);
console.log('port     :', u.port || '(default 5432)');
console.log('database :', u.pathname.slice(1));
console.log('password : length', password.length,
  '| first char', JSON.stringify(password[0]), '| last char', JSON.stringify(password[password.length - 1]),
  '| symbols:', JSON.stringify(password.replace(/[A-Za-z0-9]/g, '')) || 'none');
if (password === 'YOUR-PASSWORD') problems.push('password is still the placeholder YOUR-PASSWORD');
if (!/\.edhqyrdkkureivzrfhra$/.test(decodeURIComponent(u.username))) problems.push('user should be postgres.edhqyrdkkureivzrfhra for the pooler');
if (!/pooler\.supabase\.com$/.test(u.hostname)) problems.push('host is not the Supabase pooler (…pooler.supabase.com)');

console.log(problems.length ? '\nProblems:\n - ' + problems.join('\n - ') : '\nNo format problems found.');

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query('select current_database() as db, now()'))
  .then((r) => { console.log('\nCONNECT OK', r.rows[0]); return c.end(); })
  .catch((e) => { console.log('\nCONNECT FAIL', e.code || '', e.message); process.exit(1); });
