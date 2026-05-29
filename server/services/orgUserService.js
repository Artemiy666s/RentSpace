const bcrypt = require('bcryptjs');
const { db } = require('../db');
const {
  ROLES,
  DIRECTOR_ASSIGNABLE_ROLES,
  ORG_ADMIN_ASSIGNABLE_ROLES,
} = require('../constants/roles');

function assignableRolesFor(actorRole) {
  if (actorRole === ROLES.SUPER_ADMIN) {
    return [
      ROLES.ORG_ADMIN,
      ROLES.DIRECTOR,
      ROLES.MANAGER,
      ROLES.ACCOUNTANT,
      ROLES.VIEWER,
      ROLES.OWNER,
    ];
  }
  if (actorRole === ROLES.ORG_ADMIN) return [...ORG_ADMIN_ASSIGNABLE_ROLES];
  if (actorRole === ROLES.DIRECTOR) return [...DIRECTOR_ASSIGNABLE_ROLES];
  return [];
}

function canManageUser(actor, target) {
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  if (!actor.organizationId || !target.organization_id) return false;
  if (Number(actor.organizationId) !== Number(target.organization_id)) return false;
  if (target.role === ROLES.SUPER_ADMIN) return false;
  if (actor.role === ROLES.DIRECTOR && target.role === ROLES.ORG_ADMIN) return false;
  return true;
}

function formatUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    organizationId: row.organization_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

async function resolveOrgId(actor, requestedOrgId) {
  if (actor.role === ROLES.SUPER_ADMIN) {
    const orgId = requestedOrgId != null ? Number(requestedOrgId) : actor.organizationId;
    if (!orgId) {
      const err = new Error('organization_required');
      err.status = 400;
      throw err;
    }
    return orgId;
  }
  if (!actor.organizationId) {
    const err = new Error('organization_missing');
    err.status = 403;
    throw err;
  }
  return Number(actor.organizationId);
}

async function listOrgUsers(actor, requestedOrgId) {
  const orgId = await resolveOrgId(actor, requestedOrgId);
  const rows = await db('users')
    .where({ organization_id: orgId })
    .whereNot({ role: ROLES.SUPER_ADMIN })
    .orderBy('name', 'asc');
  return rows.map(formatUser);
}

async function createOrgUser(actor, payload) {
  const orgId = await resolveOrgId(actor, payload.organizationId);
  const allowed = assignableRolesFor(actor.role);
  if (!allowed.includes(payload.role)) {
    const err = new Error('role_not_allowed');
    err.status = 400;
    throw err;
  }

  const email = payload.email.trim().toLowerCase();
  const taken = await db('users').whereRaw('LOWER(email) = ?', [email]).first();
  if (taken) {
    const err = new Error('email_taken');
    err.status = 400;
    throw err;
  }

  const password_hash = await bcrypt.hash(payload.password, 10);
  const [id] = await db('users').insert({
    organization_id: orgId,
    name: payload.name.trim(),
    email,
    password_hash,
    role: payload.role,
    status: 'active',
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

  const row = await db('users').where({ id }).first();
  return formatUser(row);
}

async function updateOrgUser(actor, userId, payload) {
  const target = await db('users').where({ id: userId }).first();
  if (!target) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  if (!canManageUser(actor, target)) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }

  const upd = { updated_at: db.fn.now() };
  if (payload.name != null) upd.name = payload.name.trim();
  if (payload.status != null) upd.status = payload.status;

  if (payload.role != null) {
    const allowed = assignableRolesFor(actor.role);
    if (!allowed.includes(payload.role)) {
      const err = new Error('role_not_allowed');
      err.status = 400;
      throw err;
    }
    if (Number(target.id) === Number(actor.id) && payload.role !== target.role) {
      const err = new Error('cannot_change_own_role');
      err.status = 400;
      throw err;
    }
    upd.role = payload.role;
  }

  if (payload.status === 'blocked' && Number(target.id) === Number(actor.id)) {
    const err = new Error('cannot_block_self');
    err.status = 400;
    throw err;
  }

  await db('users').where({ id: userId }).update(upd);
  const row = await db('users').where({ id: userId }).first();
  return formatUser(row);
}

async function resetOrgUserPassword(actor, userId, newPassword) {
  const target = await db('users').where({ id: userId }).first();
  if (!target) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  if (!canManageUser(actor, target)) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  await db('users').where({ id: userId }).update({
    password_hash,
    updated_at: db.fn.now(),
  });
}

module.exports = {
  assignableRolesFor,
  listOrgUsers,
  createOrgUser,
  updateOrgUser,
  resetOrgUserPassword,
  formatUser,
};
