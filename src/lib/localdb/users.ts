import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { LocalDB, type UserRow } from './db';

export interface PublicUser {
  id: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = await LocalDB.get();
  const e = normalizeEmail(email);
  return db.users.find(u => u.email === e) ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const db = await LocalDB.get();
  return db.users.find(u => u.id === id) ?? null;
}

export async function registerUser(params: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const email = normalizeEmail(params.email);
  if (!EMAIL_RE.test(email)) return { error: '邮箱格式不正确' };
  if (params.password.length < 6) return { error: '密码至少 6 位' };
  if (params.password.length > 200) return { error: '密码过长' };

  const existing = await findUserByEmail(email);
  if (existing) return { error: '该邮箱已被注册' };

  const password_hash = await bcrypt.hash(params.password, 10);
  const user: UserRow = {
    id: randomUUID(),
    email,
    password_hash,
    created_at: new Date().toISOString(),
  };

  const db = await LocalDB.get();
  await db.mutate(['users'], d => {
    d.users.push(user);
  });

  return { user: { id: user.id, email: user.email } };
}

export async function verifyLogin(params: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const row = await findUserByEmail(params.email);
  if (!row) return { error: '邮箱或密码错误' };
  const ok = await bcrypt.compare(params.password, row.password_hash);
  if (!ok) return { error: '邮箱或密码错误' };
  return { user: { id: row.id, email: row.email } };
}
