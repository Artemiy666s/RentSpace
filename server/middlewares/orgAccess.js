const { db } = require('../db');
const { fail } = require('../utils/response');

async function getPropertyOrgId(propertyId) {
  const row = await db('properties').where({ id: propertyId }).first();
  return row?.organization_id;
}

function requireOrgAccess() {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    const orgId = req.user.organizationId;
    if (!orgId) return fail(res, 'Организация не назначена', 403);

    const paramOrg = req.params.organizationId || req.body?.organizationId;
    const paramProperty = req.params.propertyId || req.body?.propertyId || req.query?.propertyId;

    if (paramOrg && Number(paramOrg) !== Number(orgId)) {
      return fail(res, 'Доступ запрещён', 403);
    }

    if (paramProperty) {
      const propOrg = await getPropertyOrgId(paramProperty);
      if (propOrg && Number(propOrg) !== Number(orgId)) {
        return fail(res, 'Доступ к объекту запрещён', 403);
      }
    }
    req.organizationId = orgId;
    next();
  };
}

function scopeQuery(query, user, orgColumn = 'organization_id') {
  if (user.role === 'super_admin') return query;
  return query.where(orgColumn, user.organizationId);
}

module.exports = { requireOrgAccess, scopeQuery, getPropertyOrgId };
