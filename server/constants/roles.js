/**
 * Централизованные списки ролей для API.
 * Директор — полный операционный доступ в рамках организации (как менеджер + бухгалтер + настройка объектов).
 */

const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  DIRECTOR: 'director',
  MANAGER: 'manager',
  OWNER: 'owner',
  ACCOUNTANT: 'accountant',
  VIEWER: 'viewer',
});

/** Просмотр сводных данных / отчётов по объекту */
const DATA_READ_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ORG_ADMIN,
  ROLES.DIRECTOR,
  ROLES.MANAGER,
  ROLES.OWNER,
  ROLES.ACCOUNTANT,
];

/** Операционное управление (помещения, переговоры, закрытие месяца, карты) */
const OPERATIONAL_ROLES = [ROLES.SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.DIRECTOR, ROLES.MANAGER];

/** Операции с помещениями и договорами на объекте */
const OPERATIONAL_WRITE_ROLES = [...OPERATIONAL_ROLES, ROLES.OWNER];

/** Финансы: начисления, платежи, расходы */
const FINANCE_WRITE_ROLES = [...OPERATIONAL_ROLES, ROLES.ACCOUNTANT];

/** Редактирование план-факта */
const PLAN_FACT_EDIT_ROLES = [...OPERATIONAL_WRITE_ROLES, ROLES.ORG_ADMIN, ROLES.SUPER_ADMIN];

/** Планы этажей, редактор карт */
const MAP_EDIT_ROLES = [...OPERATIONAL_ROLES];

/** Структура объекта: здания, этажи */
const PROPERTY_ADMIN_ROLES = [...OPERATIONAL_ROLES];

/** Импорт Excel, администрирование данных организации */
const ORG_DATA_ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.DIRECTOR];

/** Учётные записи сотрудников организации */
const ORG_USER_ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ORG_ADMIN, ROLES.DIRECTOR];

/** Роли, которые может назначать директор */
const DIRECTOR_ASSIGNABLE_ROLES = [ROLES.DIRECTOR, ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.VIEWER];

/** Роли, которые может назначать администратор организации */
const ORG_ADMIN_ASSIGNABLE_ROLES = [
  ROLES.ORG_ADMIN,
  ROLES.DIRECTOR,
  ROLES.MANAGER,
  ROLES.ACCOUNTANT,
  ROLES.VIEWER,
];

module.exports = {
  ROLES,
  DATA_READ_ROLES,
  OPERATIONAL_ROLES,
  OPERATIONAL_WRITE_ROLES,
  FINANCE_WRITE_ROLES,
  PLAN_FACT_EDIT_ROLES,
  MAP_EDIT_ROLES,
  PROPERTY_ADMIN_ROLES,
  ORG_DATA_ADMIN_ROLES,
  ORG_USER_ADMIN_ROLES,
  DIRECTOR_ASSIGNABLE_ROLES,
  ORG_ADMIN_ASSIGNABLE_ROLES,
  /** @deprecated use DATA_READ_ROLES */
  managerRoles: DATA_READ_ROLES,
};
