const dayjs = require('dayjs');
const { db } = require('../db');
const { logAudit, logActivity } = require('../utils/audit');
const { recordRoomStatusChange } = require('../utils/roomStatusHistory');

async function getRoomDetails(roomId) {
  const room = await db('rooms').whereNull('deleted_at').where({ id: roomId }).first();
  if (!room) return null;

  const property = await db('properties').where({ id: room.property_id }).first();
  const building = await db('buildings').where({ id: room.building_id }).first();
  const floor = await db('floors').where({ id: room.floor_id }).first();
  const activeLink = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('cr.room_id', roomId)
    .where('c.status', 'active')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select(
      'c.*',
      't.name as tenant_name',
      't.id as tenant_id',
      't.status as tenant_status',
      'cr.area as contract_area',
      'cr.rate_without_vat as room_rate'
    )
    .first();

  const negotiation = await db('room_negotiations')
    .where({ room_id: roomId })
    .whereNot('status', 'converted')
    .whereNot('status', 'declined')
    .orderBy('updated_at', 'desc')
    .first()
    .catch(() => null);

  const year = dayjs().year();
  const month = dayjs().month() + 1;

  const charges = await db('rent_charges')
    .where({ room_id: roomId, period_year: year, period_month: month })
    .whereNot('status', 'cancelled');

  const utilityCharges = await db('utility_charges')
    .where({ room_id: roomId, period_year: year, period_month: month })
    .sum('amount as total')
    .first()
    .catch(() => ({ total: 0 }));

  const charged = charges.reduce((s, c) => s + Number(c.amount_with_vat), 0);
  const utilities = Number(utilityCharges?.total || 0);
  const payments = activeLink
    ? await db('payments')
        .where({ tenant_id: activeLink.tenant_id, period_year: year, period_month: month })
        .sum('amount as total')
        .first()
    : { total: 0 };

  const paid = Number(payments?.total || 0);
  const debt = Math.max(0, charged + utilities - paid);

  const vatRate = activeLink ? Number(activeLink.vat_rate) : 20;
  const rateWithoutVat = activeLink
    ? Number(activeLink.room_rate || activeLink.rate_without_vat)
    : Number(room.current_rate_without_vat || room.recommended_rate_without_vat || 0);

  return {
    ...room,
    property,
    building,
    floor,
    contract: activeLink || null,
    tenant: activeLink ? { id: activeLink.tenant_id, name: activeLink.tenant_name, status: activeLink.tenant_status } : null,
    negotiation: negotiation || null,
    monthlyCharged: charged,
    monthlyUtilities: utilities,
    monthlyPaid: paid,
    debt,
    rateWithoutVat,
    rateWithVat: rateWithoutVat * (1 + vatRate / 100),
    vatRate,
  };
}

async function changeRoomStatus({
  roomId,
  status,
  reason,
  comment,
  userId,
  organizationId,
  propertyId,
  ip,
}) {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) throw Object.assign(new Error('Помещение не найдено'), { status: 404 });

  const oldStatus = room.status;
  await db('rooms').where({ id: roomId }).update({
    status,
    comment: comment ?? room.comment,
    updated_at: db.fn.now(),
  });

  await recordRoomStatusChange({
    roomId,
    oldStatus,
    newStatus: status,
    reason,
    comment,
    userId,
  });

  if (status === 'negotiation' && !comment) {
    /* переговоры оформляются отдельным API */
  }

  await logAudit({
    organizationId,
    userId,
    entityType: 'room',
    entityId: roomId,
    action: 'change_status',
    oldValue: { status: oldStatus },
    newValue: { status, reason, comment },
    ip,
  });
  await logActivity({
    organizationId,
    propertyId,
    userId,
    eventType: 'status_change',
    title: `Статус помещения ${room.room_number}: ${oldStatus} → ${status}`,
    entityType: 'room',
    entityId: roomId,
  });

  return getRoomDetails(roomId);
}

async function rentOutRoom({
  roomId,
  tenantId,
  tenantPayload,
  contractNumber,
  contractDate,
  startDate,
  endDate,
  rateWithoutVat,
  vatRate,
  paymentDay,
  organizationId,
  propertyId,
  userId,
  ip,
}) {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) throw Object.assign(new Error('Помещение не найдено'), { status: 404 });
  if (!['free', 'negotiation', 'reserved', 'ready_for_rent'].includes(room.status)) {
    throw Object.assign(new Error('Помещение недоступно для сдачи'), { status: 400 });
  }

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId && tenantPayload?.name) {
    const [tid] = await db('tenants').insert({
      organization_id: organizationId,
      name: tenantPayload.name,
      legal_type: tenantPayload.legalType || 'other',
      unp: tenantPayload.unp,
      contact_person: tenantPayload.contactPerson,
      phone: tenantPayload.phone,
      email: tenantPayload.email,
      status: 'active',
      comment: tenantPayload.comment,
    });
    resolvedTenantId = tid;
  }

  const [contractId] = await db('contracts').insert({
    organization_id: organizationId,
    property_id: propertyId,
    tenant_id: resolvedTenantId,
    contract_number: contractNumber,
    contract_date: contractDate || startDate,
    start_date: startDate,
    end_date: endDate,
    rate_without_vat: rateWithoutVat,
    vat_rate: vatRate || 20,
    payment_day: paymentDay,
    status: 'active',
  });

  await db('contract_rooms').insert({
    contract_id: contractId,
    room_id: roomId,
    area: room.rentable_area || room.area,
    rate_without_vat: rateWithoutVat,
    start_date: startDate,
    end_date: endDate,
  });

  const oldStatus = room.status;
  await db('rooms').where({ id: roomId }).update({
    status: 'occupied',
    current_rate_without_vat: rateWithoutVat,
    updated_at: db.fn.now(),
  });

  await db('room_negotiations')
    .where({ room_id: roomId })
    .whereNotIn('status', ['converted', 'declined'])
    .update({ status: 'converted', updated_at: db.fn.now() })
    .catch(() => {});

  await recordRoomStatusChange({
    roomId,
    oldStatus,
    newStatus: 'occupied',
    reason: 'rent_out',
    comment: contractNumber,
    userId,
  });

  await logAudit({
    organizationId,
    userId,
    entityType: 'room',
    entityId: roomId,
    action: 'rent_out',
    newValue: { contractId, tenantId: resolvedTenantId },
    ip,
  });
  await logActivity({
    organizationId,
    propertyId,
    userId,
    eventType: 'rent_out',
    title: `Сдано помещение ${room.room_number}`,
    entityType: 'room',
    entityId: roomId,
  });

  return { contractId, roomId, tenantId: resolvedTenantId };
}

async function vacateRoom({
  roomId,
  endDate,
  reason,
  newStatus,
  comment,
  userId,
  organizationId,
  propertyId,
  ip,
}) {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) throw Object.assign(new Error('Помещение не найдено'), { status: 404 });

  const links = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .where('cr.room_id', roomId)
    .where('c.status', 'active');

  for (const link of links) {
    await db('contract_rooms').where({ id: link.id }).update({ end_date: endDate });
    await db('contracts').where({ id: link.contract_id }).update({
      status: reason === 'debt' ? 'terminated' : 'completed',
      actual_end_date: endDate,
      comment: comment || reason || link.comment,
      updated_at: db.fn.now(),
    });
  }

  const targetStatus = newStatus || 'free';
  const oldStatus = room.status;
  await db('rooms').where({ id: roomId }).update({
    status: targetStatus,
    current_rate_without_vat: null,
    comment: comment ?? room.comment,
    updated_at: db.fn.now(),
  });

  await recordRoomStatusChange({
    roomId,
    oldStatus,
    newStatus: targetStatus,
    reason,
    comment,
    userId,
  });

  await logAudit({
    organizationId,
    userId,
    entityType: 'room',
    entityId: roomId,
    action: 'vacate',
    newValue: { endDate, reason, newStatus: targetStatus },
    ip,
  });
  await logActivity({
    organizationId,
    propertyId,
    userId,
    eventType: 'vacate',
    title: `Освобождено помещение ${room.room_number}`,
    description: reason,
    entityType: 'room',
    entityId: roomId,
  });
}

async function updateRoomLease({
  roomId,
  tenantId,
  rateWithoutVat,
  vatRate,
  userId,
  organizationId,
  propertyId,
  ip,
}) {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) throw Object.assign(new Error('Помещение не найдено'), { status: 404 });

  const link = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .where('cr.room_id', roomId)
    .where('c.status', 'active')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select('cr.*', 'c.id as contract_id', 'c.tenant_id')
    .first();

  if (!link) {
    if (tenantId != null || rateWithoutVat != null) {
      throw Object.assign(
        new Error('Нет активного договора — оформите сдачу в аренду'),
        { status: 400 }
      );
    }
    return null;
  }

  const contractPatch = { updated_at: db.fn.now() };
  const roomPatch = { updated_at: db.fn.now() };
  const linkPatch = {};

  if (tenantId != null) {
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) throw Object.assign(new Error('Арендатор не найден'), { status: 404 });
    contractPatch.tenant_id = tenantId;
  }

  if (rateWithoutVat != null) {
    const rate = Number(rateWithoutVat);
    contractPatch.rate_without_vat = rate;
    linkPatch.rate_without_vat = rate;
    roomPatch.current_rate_without_vat = rate;
  }

  if (vatRate != null) {
    contractPatch.vat_rate = Number(vatRate);
  }

  if (Object.keys(contractPatch).length > 1) {
    await db('contracts').where({ id: link.contract_id }).update(contractPatch);
  }
  if (Object.keys(linkPatch).length) {
    await db('contract_rooms').where({ id: link.id }).update(linkPatch);
  }
  if (Object.keys(roomPatch).length > 1) {
    await db('rooms').where({ id: roomId }).update(roomPatch);
  }

  await logAudit({
    organizationId,
    userId,
    entityType: 'room',
    entityId: roomId,
    action: 'update_lease',
    newValue: { tenantId, rateWithoutVat, vatRate },
    ip,
  });
  await logActivity({
    organizationId,
    propertyId,
    userId,
    eventType: 'lease_update',
    title: `Обновлена аренда помещения ${room.room_number}`,
    entityType: 'room',
    entityId: roomId,
  });

  return getRoomDetails(roomId);
}

async function changeRoomTenant({
  roomId,
  previousEndDate,
  tenantId,
  tenantPayload,
  contractNumber,
  contractDate,
  startDate,
  endDate,
  rateWithoutVat,
  vatRate,
  paymentDay,
  organizationId,
  propertyId,
  userId,
  ip,
}) {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) throw Object.assign(new Error('Помещение не найдено'), { status: 404 });

  const activeLink = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .where('cr.room_id', roomId)
    .where('c.status', 'active')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select('cr.id')
    .first();

  if (activeLink) {
    const end =
      previousEndDate ||
      (startDate ? dayjs(startDate).subtract(1, 'day').format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
    await vacateRoom({
      roomId,
      endDate: end,
      reason: 'tenant_change',
      newStatus: 'free',
      comment: 'Смена арендатора',
      userId,
      organizationId,
      propertyId,
      ip,
    });
  }

  return rentOutRoom({
    roomId,
    tenantId,
    tenantPayload,
    contractNumber,
    contractDate,
    startDate,
    endDate,
    rateWithoutVat,
    vatRate,
    paymentDay,
    organizationId,
    propertyId,
    userId,
    ip,
  });
}

async function getRoomHistory(roomId) {
  const statusHistory = await db('room_status_history as h')
    .leftJoin('users as u', 'u.id', 'h.changed_by')
    .where('h.room_id', roomId)
    .orderBy('h.created_at', 'desc')
    .select('h.*', 'u.name as changed_by_name');

  const audits = await db('audit_logs')
    .where({ entity_type: 'room', entity_id: roomId })
    .orderBy('created_at', 'desc')
    .limit(50);

  const contracts = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('cr.room_id', roomId)
    .select('c.*', 't.name as tenant_name', 'cr.area');

  return { statusHistory, audits, contracts };
}

module.exports = {
  getRoomDetails,
  rentOutRoom,
  vacateRoom,
  changeRoomStatus,
  updateRoomLease,
  changeRoomTenant,
  getRoomHistory,
};
