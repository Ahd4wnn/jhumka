import { HttpError } from '../http';
import type { AdminSession } from '../auth/session';

export function requireAdmin(locals: App.Locals): AdminSession {
  if (!locals.admin) throw new HttpError(401, 'Please sign in.');
  return locals.admin;
}

export function requireOwner(locals: App.Locals): AdminSession {
  const admin = requireAdmin(locals);
  if (admin.role !== 'owner') throw new HttpError(403, 'Only the owner can do this.');
  return admin;
}

/** Postgres error code from a (possibly Drizzle-wrapped) error. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Turns unique-constraint violations into a friendly 409. */
export function rethrowUnique(err: unknown, message: string): never {
  if (pgCode(err) === '23505') throw new HttpError(409, message);
  throw err;
}

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(id: string | undefined): string {
  if (!id || !uuid.test(id)) throw new HttpError(404, 'Not found.');
  return id;
}
