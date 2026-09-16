#!/usr/bin/env node
/* User admin from the command line.

   For anywhere you have a shell or a psql-reachable database: a Render paid
   instance, your laptop pointed at the External Database URL, or CI.
   On Render's free tier there is no shell — use BOOTSTRAP_EMAIL /
   BOOTSTRAP_PASSWORD instead (see src/bootstrap.js).

   Usage:
     npm run user -- list
     npm run user -- create --email a@b.co --name "A B" --role founder [--password secret]
     npm run user -- role --email a@b.co --role core
     npm run user -- password --email a@b.co [--password secret]
     npm run user -- deactivate --email a@b.co
     npm run user -- activate --email a@b.co
*/

import { randomBytes } from 'node:crypto';
import { many, one, pool, query } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { ROLES } from '../src/rbac.js';
import { newId, recordAudit } from '../src/helpers.js';

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function findByEmail(email) {
  if (!email) die('--email is required');
  const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  if (!user) die(`no user with email ${email}`);
  return user;
}

const commands = {
  async list() {
    const users = await many(
      'SELECT id, name, email, role, active, kyc_status, created_at FROM users ORDER BY role, name'
    );
    if (!users.length) return console.log('(no users yet)');
    console.log(
      ['ROLE', 'EMAIL', 'NAME', 'ACTIVE'].map((h, i) => h.padEnd([10, 30, 26, 6][i])).join('')
    );
    for (const u of users) {
      console.log(
        u.role.padEnd(10) + u.email.padEnd(30) + u.name.padEnd(26) + (u.active ? 'yes' : 'NO')
      );
    }
  },

  async create() {
    const email = flag('email');
    const name = flag('name');
    const role = flag('role');
    if (!email || !name || !role) die('--email, --name and --role are all required');
    if (!ROLES.includes(role)) die(`--role must be one of: ${ROLES.join(', ')}`);

    const clash = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (clash) die(`${email} already exists — use "role" or "password" to change it`);

    /* They sign in with this, so default it to the readable half of the email. */
    const username = (flag('username') || email.split('@')[0]).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      die('--username must be 3–32 characters: letters, digits, dot, dash or underscore');
    }
    const taken = await one('SELECT id FROM users WHERE lower(username) = $1', [username]);
    if (taken) die(`username "${username}" is already taken — pass --username`);

    /* A generated password is strong and shown once; nothing is stored in the
       clear, so there is no way to read it back later. */
    const password = flag('password') || randomBytes(9).toString('base64url');
    const id = newId('u');
    await query(
      `INSERT INTO users (id, name, email, username, password_hash, role, kyc_status)
       VALUES ($1,$2,lower($3),$4,$5,$6,'verified')`,
      [id, name, email, username, await hashPassword(password), role]
    );
    await recordAudit(`User ${email} created as ${role} via CLI`, id, 'user', id);
    console.log(`created ${email} (${role})`);
    console.log(`username: ${username}`);
    console.log(`password: ${password}`);
    console.log('Give them these directly.');
    console.log('The password is stored only as a hash — if lost, reset rather than look it up.');
  },

  async role() {
    const role = flag('role');
    if (!ROLES.includes(role)) die(`--role must be one of: ${ROLES.join(', ')}`);
    const user = await findByEmail(flag('email'));

    /* Removing the last active Founder locks everyone out of Finances, the
       Core Team directory and user administration. */
    if (user.role === 'founder' && role !== 'founder') {
      const { n } = await one(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'founder' AND active AND id <> $1",
        [user.id]
      );
      if (n === 0) die('that is the only active Founder — promote someone else first');
    }

    await query('UPDATE users SET role = $2 WHERE id = $1', [user.id, role]);
    await recordAudit(`Role of ${user.email}: ${user.role} -> ${role} via CLI`, user.id, 'user', user.id);
    console.log(`${user.email}: ${user.role} -> ${role}`);
  },

  async password() {
    const user = await findByEmail(flag('email'));
    const password = flag('password') || randomBytes(9).toString('base64url');
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      user.id,
      await hashPassword(password),
    ]);
    await recordAudit(`Password reset for ${user.email} via CLI`, user.id, 'user', user.id);
    console.log(`${user.email} password: ${password}`);
  },

  async deactivate() {
    const user = await findByEmail(flag('email'));
    if (user.role === 'founder') {
      const { n } = await one(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'founder' AND active AND id <> $1",
        [user.id]
      );
      if (n === 0) die('that is the only active Founder — promote someone else first');
    }
    await query('UPDATE users SET active = FALSE WHERE id = $1', [user.id]);
    await recordAudit(`${user.email} deactivated via CLI`, user.id, 'user', user.id);
    console.log(`${user.email} deactivated — their next request will be rejected`);
  },

  async activate() {
    const user = await findByEmail(flag('email'));
    await query('UPDATE users SET active = TRUE WHERE id = $1', [user.id]);
    console.log(`${user.email} reactivated`);
  },
};

if (!command || !commands[command]) {
  console.log(
    `usage: npm run user -- <command> [flags]\n\n` +
      `commands: ${Object.keys(commands).join(', ')}\n` +
      `roles:    ${ROLES.join(', ')}\n\n` +
      `example:  npm run user -- create --email tej@xspace.co --name "Tej" --role founder`
  );
  process.exit(command ? 1 : 0);
}

try {
  await commands[command]();
  await pool.end();
} catch (err) {
  console.error(err.message);
  await pool.end();
  process.exit(1);
}
