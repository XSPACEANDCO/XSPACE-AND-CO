#!/usr/bin/env node
/* Build an APK that talks to a backend running on this computer.

     node scripts/build-local-apk.mjs 192.168.0.6
     node scripts/build-local-apk.mjs 192.168.0.6:10000

   The phone must be on the same Wi-Fi, and the server must be running
   (cd server && npm start). The app loads the portal straight from that
   address, so the APK only needs rebuilding when the computer's IP changes.

   capacitor.config.json is left exactly as committed: it is swapped for a
   local copy only while Capacitor copies it into the Android project, then
   put back — even if the build fails. Output: dist-apk/xspace-local.apk */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/build-local-apk.mjs <computer-ip>[:port]');
  process.exit(1);
}
const host = arg.includes(':') ? arg : `${arg}:10000`;
const url = `http://${host}`;

const run = (cmd, cwd = root, env = {}) =>
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

/* Gradle needs a JDK and the SDK; fall back to the copies Android Studio
   installs on Windows when the environment does not name them. */
const env = {};
if (!process.env.JAVA_HOME && process.platform === 'win32') {
  env.JAVA_HOME = 'C:\\Program Files\\Android\\Android Studio\\jbr';
}
if (!process.env.ANDROID_HOME && process.env.LOCALAPPDATA) {
  env.ANDROID_HOME = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
}

const configPath = path.join(root, 'capacitor.config.json');
const original = readFileSync(configPath, 'utf8');
const config = JSON.parse(original);
config.server = { url, cleartext: true, androidScheme: 'http' };

console.log(`\n▶ Building the web app`);
run('npm run build');

try {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`\n▶ Pointing the app at ${url}`);
  run('npx cap sync android', root, env);
} finally {
  writeFileSync(configPath, original);
}

console.log('\n▶ Building the APK');
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradlew} assembleDebug -PlocalServer`, path.join(root, 'android'), env);

const built = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(root, 'dist-apk');
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'xspace-local.apk');
copyFileSync(built, out);

/* Leave the Android project pointing back at the committed config, so the
   next normal `cap sync` / store build is not quietly a local one. */
run('npx cap copy android', root, env);

console.log(`\n✔ ${out}\n  Opens ${url} — keep the server running and the phone on the same Wi-Fi.`);
