import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    /* ver: the account's token_version — see requireAuth. */
    { sub: user.id, role: user.role, name: user.name, email: user.email, ver: user.token_version || 0 },
    config.jwtSecret,
    { expiresIn: config.tokenTtl, algorithm: 'HS256' }
  );
}

/* Returns the decoded payload, or null for anything invalid or expired. */
export function verifyToken(token) {
  try {
    /* Pinned, so a token can never pick its own verification algorithm. */
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/* Compared against when the account does not exist, so a wrong username
   costs the same bcrypt work as a wrong password and response time does not
   reveal which accounts exist. (A hash of a random string, at ROUNDS.) */
export const DUMMY_HASH = bcrypt.hashSync(`no-such-account-${Math.random()}`, ROUNDS);

export function bearerFrom(req) {
  const header = req.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}
