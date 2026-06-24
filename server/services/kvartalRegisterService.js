const { db } = require('../db');
const TENANTS = require('../data/kvartal-tenants-register');

const DEMO_TENANT_NAMES = [
  'GreenCity',
  'Galileo Group',
  'Coffee Hub',
  'Golden Coffee',
  'Sport Life',
  'Модный Дом',
  'Kids Planet',
  'Аптека №1',
  'TechStore',
  'Beauty Room',
  'Burger Street',
];

function detectLegalType(name) {
  const s = String(name).toUpperCase();
  if (/\bИП\b/.test(s) || s.startsWith('ИП ')) return 'ip';
  if (/\bЧП\b/.test(s) || /\bЧУП\b/.test(s) || /\bЧТУП\b/.test(s)) return 'chp';
  if (/\bООО\b/.test(s) || s.includes('«')) return 'ooo';
  if (/\bОАО\b/.test(s)) return 'oao';
  if (/\bЗАО\b/.test(s)) return 'zao';
  if (/\bРУП\b/.test(s) || /\bФ-Л\b/.test(s)) return 'other';
  if (/^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\./.test(String(name).trim())) return 'physical';
  return 'other';
}

function parseContract(contractStr, seq) {
  if (!contractStr || !String(contractStr).trim()) {
    return {
      contractNumber: `REG-${String(seq).padStart(3, '0')}`,
      startDate: '2020-12-01',
      contractDate: null,
    };
  }
  const s = String(contractStr).trim();
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const startDate = m ? `${m[3]}-${m[2]}-${m[1]}` : '2020-12-01';
  const contractNumber = s.split(/\s+от\s+/i)[0].trim() || s;
  return { contractNumber, startDate, contractDate: startDate };
}

function totalArea(areas) {
  const sum = areas.reduce((a, b) => a + (Number(b) || 0), 0);
  return sum > 0 ? sum : 0;
}

function primaryRate(rates) {
  const r = rates.find((x) => Number(x) > 0);
  return r != null ? Number(r) : Number(rates[0]) || 0;
}

function rentWithVat(area, rate) {
  return Math.round(Number(area) * Number(rate) * 1.2 * 100) / 100;
}

function splitAmounts(gross) {
  const amountWithVat = Math.round(Number(gross) * 100) / 100;
  const net = Math.round((amountWithVat / 1.2) * 100) / 100;
  const vat = Math.round((amountWithVat - net) * 100) / 100;
  return { amountWithVat, net, vat };
}

async function ensureRegistryFloor(propertyId) {
  let building = await db('buildings').where({ property_id: propertyId, code: '56' }).first();
  if (!building) {
    const [bid] = await db('buildings').insert({
      property_id: propertyId,
      name: 'Здание 56',
      code: '56',
    });
    building = { id: bid };
  }

  let floor = await db('floors')
    .where({ building_id: building.id })
    .where('name', 'like', '%реестр%')
    .first();

  if (!floor) {
    const maxLevel = await db('floors').where({ building_id: building.id }).max('level_number as m').first();
    const level = (Number(maxLevel?.m) || 0) + 10;
    const [fid] = await db('floors').insert({
      building_id: building.id,
      name: 'Реестр аренды',
      level_number: level,
    });
    floor = { id: fid, building_id: building.id };
  }

  return { buildingId: building.id, floorId: floor.id };
}

async function removeDemoTenants(organizationId, propertyId) {
  const summary = { tenants: 0, contracts: 0 };
  for (const name of DEMO_TENANT_NAMES) {
    const tenant = await db('tenants')
      .where({ organization_id: organizationId, name })
      .whereNull('deleted_at')
      .first();
    if (!tenant) continue;

    const contracts = await db('contracts')
      .where({ tenant_id: tenant.id, property_id: propertyId })
      .whereNull('deleted_at');

    for (const contract of contracts) {
      await db('rent_charges').where({ contract_id: contract.id }).delete();
      await db('utility_charges').where({ contract_id: contract.id }).delete();
      await db('payments').where({ contract_id: contract.id }).delete();
      await db('contract_rooms').where({ contract_id: contract.id }).delete();
      await db('contracts').where({ id: contract.id }).update({ deleted_at: db.fn.now() });
      summary.contracts++;
    }

    await db('tenants').where({ id: tenant.id }).update({ deleted_at: db.fn.now() });
    summary.tenants++;
  }
  return summary;
}

async function upsertRentCharge(ctx, contract, tenantId, roomId, year, month, grossAmount) {
  if (!grossAmount || grossAmount <= 0) return false;
  const { amountWithVat, net, vat } = splitAmounts(grossAmount);
  const existing = await db('rent_charges')
    .where({
      contract_id: contract.id,
      period_year: year,
      period_month: month,
    })
    .first();

  const payload = {
    organization_id: ctx.organizationId,
    property_id: ctx.propertyId,
    tenant_id: tenantId,
    contract_id: contract.id,
    room_id: roomId,
    period_year: year,
    period_month: month,
    area: contract.area,
    rate_without_vat: contract.rate,
    vat_rate: 20,
    amount_without_vat: net,
    vat_amount: vat,
    amount_with_vat: amountWithVat,
    status: 'charged',
    updated_at: db.fn.now(),
  };

  if (existing) {
    await db('rent_charges').where({ id: existing.id }).update(payload);
    return 'updated';
  }
  await db('rent_charges').insert(payload);
  return 'created';
}

async function upsertUtilityCharge(ctx, contract, tenantId, year, month, amount) {
  if (!amount || amount <= 0) return false;
  const existing = await db('utility_charges')
    .where({
      contract_id: contract.id,
      period_year: year,
      period_month: month,
      utility_type: 'heating',
    })
    .first();

  const payload = {
    organization_id: ctx.organizationId,
    property_id: ctx.propertyId,
    tenant_id: tenantId,
    contract_id: contract.id,
    period_year: year,
    period_month: month,
    utility_type: 'heating',
    calculation_method: 'manual',
    amount: Math.round(Number(amount) * 100) / 100,
    updated_at: db.fn.now(),
  };

  if (existing) {
    await db('utility_charges').where({ id: existing.id }).update(payload);
    return 'updated';
  }
  await db('utility_charges').insert(payload);
  return 'created';
}

async function syncKvartalRegister(options = {}) {
  const years = options.years || [2024, 2025, 2026];
  const removeDemo = options.removeDemo !== false;

  const org = await db('organizations').where({ status: 'active' }).first();
  if (!org) throw new Error('Нет активной организации');

  const property = await db('properties')
    .where({ organization_id: org.id, status: 'active' })
    .where('name', 'like', '%Квартал%')
    .first();
  if (!property) throw new Error('Объект ТРК «Квартал» не найден');

  const summary = {
    demoRemoved: removeDemo ? await removeDemoTenants(org.id, property.id) : null,
    tenants: 0,
    contracts: 0,
    rooms: 0,
    contractRooms: 0,
    rentCharges: 0,
    utilityCharges: 0,
  };

  const { buildingId, floorId } = await ensureRegistryFloor(property.id);

  for (const row of TENANTS) {
    const name = row.name.trim();
    const { contractNumber, startDate, contractDate } = parseContract(row.contract, row.seq);
    const areaTotal = totalArea(row.areas);
    const rate = primaryRate(row.rates);
    const monthlyRent = areaTotal > 0 && rate > 0 ? rentWithVat(areaTotal, rate) : 0;

    let tenant = await db('tenants')
      .where({ organization_id: org.id, name })
      .whereNull('deleted_at')
      .first();

    if (!tenant) {
      const [tid] = await db('tenants').insert({
        organization_id: org.id,
        name,
        legal_type: detectLegalType(name),
        status: 'active',
      });
      tenant = { id: tid };
      summary.tenants++;
    }

    let contract = await db('contracts')
      .where({ organization_id: org.id, contract_number: contractNumber })
      .whereNull('deleted_at')
      .first();

    if (!contract) {
      const [cid] = await db('contracts').insert({
        organization_id: org.id,
        property_id: property.id,
        tenant_id: tenant.id,
        contract_number: contractNumber,
        contract_date: contractDate,
        start_date: startDate,
        end_date: '2030-12-31',
        rate_without_vat: rate,
        vat_rate: 20,
        status: rate > 0 && areaTotal > 0 ? 'active' : 'archived',
        comment: row.areas.length > 1 ? `Площади: ${row.areas.join(' + ')} м²` : null,
      });
      contract = { id: cid };
      summary.contracts++;
    } else {
      await db('contracts').where({ id: contract.id }).update({
        tenant_id: tenant.id,
        rate_without_vat: rate,
        status: rate > 0 && areaTotal > 0 ? 'active' : contract.status,
        updated_at: db.fn.now(),
      });
    }

    const roomNumber = `Р${String(row.seq).padStart(3, '0')}`;
    let room = await db('rooms')
      .where({ floor_id: floorId, room_number: roomNumber })
      .whereNull('deleted_at')
      .first();

    if (!room) {
      const [rid] = await db('rooms').insert({
        property_id: property.id,
        building_id: buildingId,
        floor_id: floorId,
        room_number: roomNumber,
        name: name.slice(0, 120),
        area: areaTotal || 1,
        rentable_area: areaTotal || 1,
        room_type: 'retail',
        status: rate > 0 && areaTotal > 0 ? 'occupied' : 'free',
        current_rate_without_vat: rate > 0 ? rate : null,
      });
      room = { id: rid };
      summary.rooms++;
    } else {
      await db('rooms').where({ id: room.id }).update({
        name: name.slice(0, 120),
        area: areaTotal || room.area,
        rentable_area: areaTotal || room.rentable_area,
        status: rate > 0 && areaTotal > 0 ? 'occupied' : 'free',
        current_rate_without_vat: rate > 0 ? rate : null,
        updated_at: db.fn.now(),
      });
    }

    const segments = row.areas.length ? row.areas : [areaTotal || 1];
    const rates = row.rates.length ? row.rates : [rate];
    let primaryRoomId = room.id;
    let linkArea = areaTotal || segments[0];
    let linkRate = rate;

    for (let i = 0; i < segments.length; i++) {
      const segArea = Number(segments[i]) || linkArea;
      const segRate = Number(rates[i] ?? rates[0]) || linkRate;
      const segRoomNumber = segments.length > 1 ? `${roomNumber}-${i + 1}` : roomNumber;

      let segRoom = room;
      if (segments.length > 1) {
        segRoom = await db('rooms')
          .where({ floor_id: floorId, room_number: segRoomNumber })
          .whereNull('deleted_at')
          .first();
        if (!segRoom) {
          const [srid] = await db('rooms').insert({
            property_id: property.id,
            building_id: buildingId,
            floor_id: floorId,
            room_number: segRoomNumber,
            name: `${name.slice(0, 80)} (${i + 1})`,
            area: segArea,
            rentable_area: segArea,
            room_type: 'retail',
            status: segRate > 0 && segArea > 0 ? 'occupied' : 'free',
            current_rate_without_vat: segRate > 0 ? segRate : null,
          });
          segRoom = { id: srid };
          summary.rooms++;
        }
        if (i === 0) primaryRoomId = segRoom.id;
      }

      const existingLink = await db('contract_rooms')
        .where({ contract_id: contract.id, room_id: segRoom.id })
        .first();

      if (!existingLink) {
        await db('contract_rooms').insert({
          contract_id: contract.id,
          room_id: segRoom.id,
          area: segArea,
          rate_without_vat: segRate,
          start_date: startDate,
        });
        summary.contractRooms++;
      } else {
        await db('contract_rooms').where({ id: existingLink.id }).update({
          area: segArea,
          rate_without_vat: segRate,
          updated_at: db.fn.now(),
        });
      }

      if (i === 0) {
        linkArea = segArea;
        linkRate = segRate;
        primaryRoomId = segRoom.id;
      }
    }

    const contractCtx = { id: contract.id, area: linkArea, rate: linkRate };
    const chargeCtx = {
      organizationId: org.id,
      propertyId: property.id,
    };

    const monthlyOverrides = row.months || {};

    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        const override = monthlyOverrides[year]?.[month];
        const rentAmount =
          override?.rent != null
            ? Number(override.rent)
            : monthlyRent > 0
              ? monthlyRent
              : 0;

        if (rentAmount > 0) {
          const res = await upsertRentCharge(
            chargeCtx,
            contractCtx,
            tenant.id,
            primaryRoomId,
            year,
            month,
            rentAmount
          );
          if (res === 'created') summary.rentCharges++;
        }

        const utilAmount = override?.utility;
        if (utilAmount != null && Number(utilAmount) > 0) {
          const res = await upsertUtilityCharge(
            chargeCtx,
            contractCtx,
            tenant.id,
            year,
            month,
            utilAmount
          );
          if (res === 'created') summary.utilityCharges++;
        }
      }
    }
  }

  return { propertyId: property.id, organizationId: org.id, summary };
}

module.exports = {
  syncKvartalRegister,
  DEMO_TENANT_NAMES,
  TENANTS,
};
