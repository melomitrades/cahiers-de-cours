import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const SESSION_COOKIE = 'cahiers_admin';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

function secret() {
  return `${process.env.ADMIN_PASSWORD ?? ''}::${process.env.SESSION_SECRET ?? ''}`;
}

/** Jeton de session : change automatiquement si le mot de passe change. */
export function sessionToken() {
  return createHmac('sha256', secret()).update('cahiers-admin-session-v1').digest('hex');
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(password, expected);
}

export async function isAdmin() {
  if (!process.env.ADMIN_PASSWORD) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(value && safeEqual(value, sessionToken()));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login');
}
