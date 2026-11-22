"use client";

import useSession from "./useSession";

/**
 * What the signed-in user may do, from the permission keys the backend puts in the session (`user.permissions`; a system
 * admin holds all of them). Used to show each person only the screens and buttons that are theirs.
 *
 * This is presentation only — the backend enforces every permission. When the list is not known (the session has not
 * loaded yet, or an older session without one) `can` answers true, so nothing is hidden wrongly; it never grants anything.
 */
export default function usePermissions() {
  const { user } = useSession();
  const isAdmin = user?.is_system_admin === true;
  const list = Array.isArray(user?.permissions) ? user.permissions : null;
  const known = isAdmin || list !== null;
  const set = new Set(list ?? []);
  const can = (key) => !known || isAdmin || set.has(key);
  const canAny = (...keys) => keys.some(can);
  return { can, canAny, isAdmin, known };
}
