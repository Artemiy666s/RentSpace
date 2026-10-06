/**
 * Relink register contracts from synthetic "реестр" rooms onto real map rooms
 * that are marked occupied (with rate/area) but have no active contract_rooms row.
 */
const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

function nearly(a, b, eps = 0.15) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function normalizeRoomNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/а/g, 'a')
    .replace(/\s+/g, '');
}

async function loadOpenLeaseRoomIds(roomIds) {
  if (!roomIds.length) return new Set();
  const asOf = dayjs().format('YYYY-MM-DD');
  const rows = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .whereIn('cr.room_id', roomIds)
    .whereIn('c.status', ['active', 'expiring'])
    .whereNull('c.deleted_at')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
    })
    .select('cr.room_id');
  return new Set(rows.map((r) => Number(r.room_id)));
}

function isRegistryRoom(room) {
  const num = String(room.room_number || '');
  const floor = String(room.floor_name || '');
  return /^Р\d+/i.test(num) || /реестр/i.test(floor);
}

async function loadActiveContractCandidates(propertyId) {
  const asOf = dayjs().format('YYYY-MM-DD');
  const contracts = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('c.property_id', propertyId)
    .whereIn('c.status', ['active', 'expiring'])
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .select(
      'c.id',
      'c.contract_number',
      'c.rate_without_vat',
      'c.start_date',
      't.id as tenant_id',
      't.name as tenant_name'
    );

  const out = [];
  for (const contract of contracts) {
    const links = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .where('cr.contract_id', contract.id)
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .select(
        'cr.id',
        'cr.room_id',
        'cr.area',
        'cr.rate_without_vat',
        'r.room_number',
        'r.building_id',
        'f.name as floor_name'
      );
    if (!links.length) continue;
    out.push({ contract, links });
  }
  return out;
}

async function findMatchingContract(propertyId, orphans, candidates = null) {
  const totalArea = orphans.reduce((s, r) => s + Number(r.area || r.rentable_area || 0), 0);
  const rate = Number(orphans[0]?.current_rate_without_vat || orphans[0]?.rate || 0);
  const list = candidates || (await loadActiveContractCandidates(propertyId));

  const scored = [];
  for (const { contract, links } of list) {
    const linkArea = links.reduce((s, l) => s + Number(l.area || 0), 0);
    const linkRate =
      Number(links[0].rate_without_vat) || Number(contract.rate_without_vat) || 0;
    const registryOnly = links.every((l) => isRegistryRoom(l));
    const sameBuilding = links.every(
      (l) => Number(l.building_id) === Number(orphans[0].building_id)
    );

    let score = 0;
    if (rate > 0 && nearly(linkRate, rate, 0.05)) score += 4;
    else if (rate > 0 && nearly(linkRate, rate, 0.6)) score += 2;
    if (nearly(linkArea, totalArea, 0.6)) score += 6;
    else if (nearly(linkArea, totalArea, 1.5)) score += 3;
    if (registryOnly) score += 4;
    if (sameBuilding && !registryOnly) score += 1;

    if (links.length === orphans.length) {
      const orphanAreas = orphans
        .map((r) => Number(r.area || r.rentable_area || 0))
        .sort((a, b) => a - b);
      const linkAreas = links.map((l) => Number(l.area)).sort((a, b) => a - b);
      if (orphanAreas.every((a, i) => nearly(a, linkAreas[i], 0.25))) score += 6;
    }

    // Single orphan ↔ single link by area (+ rate if known)
    if (orphans.length === 1 && links.length === 1) {
      const oa = Number(orphans[0].area || orphans[0].rentable_area || 0);
      if (nearly(oa, Number(links[0].area), 0.25)) {
        score += 3;
        if (rate > 0 && nearly(linkRate, rate, 0.05)) score += 2;
        if (registryOnly) score += 2;
      }
    }

    // Multi-room orphans should prefer aggregated area match over accidental single-room hits.
    const minScore = orphans.length > 1 ? 9 : 7;
    if (score >= minScore) {
      scored.push({ contract, links, score, linkArea, linkRate, registryOnly });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

async function relinkContractToRooms(match, orphans) {
  const { contract, links } = match;
  const asOf = dayjs().format('YYYY-MM-DD');
  const rate =
    Number(orphans[0].current_rate_without_vat) ||
    Number(match.linkRate) ||
    Number(contract.rate_without_vat) ||
    0;

  // Close old links (keep history) then attach map rooms.
  for (const link of links) {
    const stillMapRoom = orphans.some((r) => Number(r.id) === Number(link.room_id));
    if (stillMapRoom) continue;
    await db('contract_rooms').where({ id: link.id }).update({
      end_date: asOf,
      updated_at: db.fn.now(),
    });
  }

  const existingOpen = await db('contract_rooms as cr')
    .where('cr.contract_id', contract.id)
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
    })
    .whereIn(
      'cr.room_id',
      orphans.map((r) => r.id)
    )
    .select('cr.room_id');
  const already = new Set(existingOpen.map((r) => Number(r.room_id)));

  const created = [];
  for (const room of orphans) {
    if (already.has(Number(room.id))) continue;
    await db('contract_rooms').insert({
      contract_id: contract.id,
      room_id: room.id,
      area: Number(room.area) || 0,
      rate_without_vat: rate,
      start_date: contract.start_date || asOf,
      end_date: null,
    });
    await db('rooms').where({ id: room.id }).update({
      status: 'occupied',
      current_rate_without_vat: rate,
      updated_at: db.fn.now(),
    });
    created.push(room.id);
  }

  return {
    contractId: contract.id,
    tenantName: contract.tenant_name,
    contractNumber: contract.contract_number,
    roomIds: orphans.map((r) => r.id),
    createdRoomLinks: created,
  };
}

async function repairOrphanOccupiedRooms({
  propertyId = null,
  buildingId = null,
  floorId = null,
  roomNumbers = null,
  dryRun = false,
} = {}) {
  let q = db('rooms as r')
    .join('floors as f', 'f.id', 'r.floor_id')
    .join('buildings as b', 'b.id', 'r.building_id')
    .whereNull('r.deleted_at')
    .whereIn('r.status', ['occupied', 'debt'])
    .select(
      'r.id',
      'r.property_id',
      'r.building_id',
      'r.floor_id',
      'r.room_number',
      'r.area',
      'r.rentable_area',
      'r.current_rate_without_vat',
      'r.status',
      'f.name as floor_name',
      'f.level_number',
      'b.name as building_name'
    );

  if (propertyId) q = q.where('r.property_id', propertyId);
  if (buildingId) q = q.where('r.building_id', buildingId);
  if (floorId) q = q.where('r.floor_id', floorId);
  if (roomNumbers?.length) {
    const wanted = new Set(roomNumbers.map(normalizeRoomNumber));
    // filter after fetch — Cyrillic а vs Latin a
    const rows = await q;
    const filtered = rows.filter((r) => wanted.has(normalizeRoomNumber(r.room_number)));
    return repairOrphanRows(filtered, { dryRun });
  }

  return repairOrphanRows(await q, { dryRun });
}

async function repairOrphanRows(rows, { dryRun }) {
  const leased = await loadOpenLeaseRoomIds(rows.map((r) => r.id));
  const orphans = rows.filter((r) => !leased.has(Number(r.id)));
  if (!orphans.length) {
    return { orphans: 0, repaired: [], skipped: [], dryRun };
  }

  // Group by property + building + floor + rate
  const groups = new Map();
  for (const room of orphans) {
    const rate = Number(room.current_rate_without_vat || 0).toFixed(2);
    const key = `${room.property_id}:${room.building_id}:${room.floor_id}:${rate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(room);
  }

  const repaired = [];
  const skipped = [];
  const usedContracts = new Set();
  const candidatesByProperty = new Map();

  async function candidatesFor(propertyId) {
    if (!candidatesByProperty.has(propertyId)) {
      candidatesByProperty.set(propertyId, await loadActiveContractCandidates(propertyId));
    }
    return candidatesByProperty.get(propertyId).filter((c) => !usedContracts.has(c.contract.id));
  }

  for (const group of groups.values()) {
    const candidates = await candidatesFor(group[0].property_id);
    let match = await findMatchingContract(group[0].property_id, group, candidates);

    // Fallback: link each room separately by area/rate
    if (!match && group.length > 1) {
      for (const room of group) {
        const single = await findMatchingContract(
          room.property_id,
          [room],
          await candidatesFor(room.property_id)
        );
        if (!single) {
          skipped.push({
            building: room.building_name,
            floor: room.floor_name,
            rooms: [room.room_number],
            reason: 'no_matching_register_contract',
          });
          continue;
        }
        usedContracts.add(single.contract.id);
        if (dryRun) {
          repaired.push({
            dryRun: true,
            tenantName: single.contract.tenant_name,
            contractId: single.contract.id,
            score: single.score,
            rooms: [{ id: room.id, roomNumber: room.room_number, area: room.area }],
          });
        } else {
          const result = await relinkContractToRooms(single, [room]);
          invalidateRentRegisterCache(room.property_id);
          repaired.push({ ...result, score: single.score });
        }
      }
      continue;
    }

    if (!match) {
      skipped.push({
        building: group[0].building_name,
        floor: group[0].floor_name,
        rooms: group.map((r) => r.room_number),
        reason: 'no_matching_register_contract',
      });
      continue;
    }

    usedContracts.add(match.contract.id);

    if (dryRun) {
      repaired.push({
        dryRun: true,
        tenantName: match.contract.tenant_name,
        contractId: match.contract.id,
        score: match.score,
        rooms: group.map((r) => ({ id: r.id, roomNumber: r.room_number, area: r.area })),
      });
      continue;
    }

    const result = await relinkContractToRooms(match, group);
    invalidateRentRegisterCache(group[0].property_id);
    repaired.push({ ...result, score: match.score });
  }

  return {
    orphans: orphans.length,
    orphanDetails: orphans.map((r) => ({
      id: r.id,
      building: r.building_name,
      floor: r.floor_name,
      level: r.level_number,
      roomNumber: r.room_number,
      area: Number(r.area),
      rentableArea: Number(r.rentable_area || r.area),
      rate: Number(r.current_rate_without_vat || 0),
      status: r.status,
      propertyId: r.property_id,
      buildingId: r.building_id,
      floorId: r.floor_id,
    })),
    repaired,
    skipped,
    dryRun,
  };
}

module.exports = {
  repairOrphanOccupiedRooms,
};
