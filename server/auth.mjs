import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { apiError } from './store.mjs';

const derive = promisify(scrypt);
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const COOKIE_NAME = 'treehole_session';
export function usernameInput(value) {
  if (typeof value !== 'string') throw apiError(400, 'INVALID_USERNAME', '请填写用户名。');
  const username = value.normalize('NFC').trim();
  if (!/^[\p{L}\p{N}_.-]{2,32}$/u.test(username)) throw apiError(400, 'INVALID_USERNAME', '用户名需为 2–32 个字，可使用文字、数字、下划线、点或短横线。');
  return { username, usernameKey: username.toLowerCase() };
}
export function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128 || !value.trim()) {
    throw apiError(400, 'INVALID_PASSWORD', '密码需为 8–128 个字符，不能全为空格。');
  }
  return value;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${key.toString('hex')}`;
}
const dummyHash = `scrypt:00000000000000000000000000000000:${'00'.repeat(64)}`;
export async function verifyPassword(password, hash, allowEmpty = false) {
  if (typeof password !== 'string' || password.length > 128) return false;
  if (hash === null && allowEmpty && password === '') return true;
  const [, salt, stored] = (hash || dummyHash).split(':');
  const key = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return hash !== null && timingSafeEqual(key, Buffer.from(stored, 'hex'));
}
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function cookieToken(req) {
  const value = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
export function sessionCookie(token, secure, clear = false) {
  return `${COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
