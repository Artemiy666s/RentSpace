/** Роли с полным операционным меню (как у заведующей + финансы + админ-инструменты) */
export const DIRECTOR_FULL_ACCESS_ROLES = [
  'super_admin',
  'org_admin',
  'director',
  'manager',
] as const;

export const FINANCE_WRITE_ROLES = [
  'super_admin',
  'org_admin',
  'director',
  'manager',
  'accountant',
] as const;

export const PLAN_FACT_EDIT_ROLES = [
  'owner',
  'director',
  'org_admin',
  'super_admin',
  'manager',
] as const;

export const MAP_EDITOR_ROLES = ['super_admin', 'org_admin', 'director', 'manager'] as const;

export const ORG_DATA_ADMIN_ROLES = ['super_admin', 'org_admin', 'director'] as const;

export const ORG_USER_ADMIN_ROLES = ['super_admin', 'org_admin', 'director'] as const;

export function hasRole(
  role: string | undefined,
  allowed: readonly string[]
): boolean {
  return !!role && allowed.includes(role);
}
