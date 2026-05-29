const { db } = require('../db');

async function logAudit({ organizationId, userId, entityType, entityId, action, oldValue, newValue, ip }) {
  await db('audit_logs').insert({
    organization_id: organizationId,
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_value_json: oldValue ? JSON.stringify(oldValue) : null,
    new_value_json: newValue ? JSON.stringify(newValue) : null,
    ip_address: ip || null,
  });
}

async function logActivity({ organizationId, propertyId, userId, eventType, title, description, entityType, entityId }) {
  await db('activity_events').insert({
    organization_id: organizationId,
    property_id: propertyId,
    user_id: userId,
    event_type: eventType,
    title,
    description: description || null,
    entity_type: entityType || null,
    entity_id: entityId || null,
  });
}

module.exports = { logAudit, logActivity };
