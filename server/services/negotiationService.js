const { db } = require('../db');
const { changeRoomStatus } = require('./roomService');
const { logActivity } = require('../utils/audit');

async function startNegotiation({
  roomId,
  organizationId,
  propertyId,
  userId,
  payload,
  ip,
}) {
  const [id] = await db('room_negotiations').insert({
    room_id: roomId,
    organization_id: organizationId,
    tenant_name: payload.tenantName,
    contact_person: payload.contactPerson,
    phone: payload.phone,
    planned_start_date: payload.plannedStartDate,
    expected_rate_without_vat: payload.expectedRateWithoutVat,
    status: payload.status || 'initial_interest',
    next_contact_date: payload.nextContactDate,
    next_step: payload.nextStep,
    comment: payload.comment,
    created_by: userId,
  });

  await changeRoomStatus({
    roomId,
    status: 'negotiation',
    reason: 'start_negotiation',
    comment: payload.comment,
    userId,
    organizationId,
    propertyId,
    ip,
  });

  await logActivity({
    organizationId,
    propertyId,
    userId,
    eventType: 'negotiation',
    title: `Переговоры по помещению`,
    entityType: 'room',
    entityId: roomId,
  });

  return db('room_negotiations').where({ id }).first();
}

async function updateNegotiation(id, payload) {
  await db('room_negotiations').where({ id }).update({
    tenant_name: payload.tenantName,
    contact_person: payload.contactPerson,
    phone: payload.phone,
    planned_start_date: payload.plannedStartDate,
    expected_rate_without_vat: payload.expectedRateWithoutVat,
    status: payload.status,
    next_contact_date: payload.nextContactDate,
    next_step: payload.nextStep,
    comment: payload.comment,
    updated_at: db.fn.now(),
  });
  return db('room_negotiations').where({ id }).first();
}

module.exports = { startNegotiation, updateNegotiation };
