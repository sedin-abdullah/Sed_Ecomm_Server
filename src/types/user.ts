import type { Address, User } from '../generated/prisma/client';

/**
 * A User as returned to API clients: the password and reset-token columns are
 * stripped (they are globally `omit`ted on the Prisma client), and every entity
 * carries `_id` mirroring `id` for frontend compatibility with the old Mongo shape.
 */
export type PublicUser = Omit<User, 'password' | 'passwordResetToken' | 'passwordResetExpires'> & {
  _id: string;
};

/** An Address as returned to API clients (carries `_id` mirroring `id`). */
export type ApiAddress = Address & { _id: string };
