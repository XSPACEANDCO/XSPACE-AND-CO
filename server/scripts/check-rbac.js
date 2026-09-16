/* Fails if the frontend's access matrix has drifted from the server's.

   The server copy (src/rbac.js) is authoritative — it decides what a request
   may do. The frontend copy only decides what to paint. They still have to
   agree, or the UI offers people buttons the API will reject. */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAN_CREATE_ROLES as SERVER_CAN_CREATE, MODULES as SERVER_MODULES } from '../src/rbac.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.resolve(here, '../../xspace-portal-react/src/lib/roleConfig.js');

let frontend;
try {
  frontend = await import(pathToFileURL(frontendPath).href);
} catch (err) {
  console.error(`[check:rbac] could not import ${frontendPath}\n${err.message}`);
  process.exit(1);
}

const problems = [];
const frontendByKey = Object.fromEntries(frontend.MODULES.map((m) => [m.key, m]));
const serverKeys = Object.keys(SERVER_MODULES);

for (const key of serverKeys) {
  const fe = frontendByKey[key];
  if (!fe) {
    problems.push(`server has module "${key}", frontend does not`);
    continue;
  }
  const a = [...SERVER_MODULES[key].roles].sort().join(',');
  const b = [...fe.roles].sort().join(',');
  if (a !== b) problems.push(`"${key}" roles differ — server: [${a}] frontend: [${b}]`);

  /* Scope drives row-level filtering, so a mismatch there leaks or hides data. */
  const sScope = SERVER_MODULES[key].scope || {};
  const fScope = fe.scope || {};
  for (const role of new Set([...Object.keys(sScope), ...Object.keys(fScope)])) {
    if (sScope[role] !== fScope[role]) {
      problems.push(
        `"${key}" scope for ${role} differs — server: ${sScope[role] ?? 'none'} frontend: ${fScope[role] ?? 'none'}`
      );
    }
  }
}

for (const key of Object.keys(frontendByKey)) {
  if (!SERVER_MODULES[key]) {
    problems.push(`frontend has module "${key}", server does not — it would be unreachable`);
  }
}

/* The account-creation hierarchy. Drift here is worse than a module mismatch:
   the form would offer a role the API refuses, or — the dangerous direction —
   hide one it would have allowed, making the portal look more locked down than
   it is. */
const feCanCreate = frontend.CAN_CREATE_ROLES || {};
for (const role of new Set([...Object.keys(SERVER_CAN_CREATE), ...Object.keys(feCanCreate)])) {
  const a = [...(SERVER_CAN_CREATE[role] || [])].sort().join(',');
  const b = [...(feCanCreate[role] || [])].sort().join(',');
  if (a !== b) {
    problems.push(`${role} may create — server: [${a || 'nobody'}] frontend: [${b || 'nobody'}]`);
  }
}

if (problems.length) {
  console.error(
    '[check:rbac] access matrices have drifted:\n' + problems.map((p) => '  - ' + p).join('\n')
  );
  process.exit(1);
}

console.log(`[check:rbac] OK — ${serverKeys.length} modules match between server and frontend`);
