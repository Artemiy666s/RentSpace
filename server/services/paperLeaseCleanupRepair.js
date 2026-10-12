const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { repairDuplicateContractPayments } = require('./duplicateContractPaymentRepair');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function freeRoomIfUnlinked(roomId) {
  const stillLinked = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .where('cr.room_id', roomId)
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .first();
  if (!stillLinked) {
    await db('rooms').where({ id: roomId }).update({
      status: 'free',
      current_rate_without_vat: null,
      updated_at: db.fn.now(),
    });
    return true;
  }
  return false;
}

async function detachLink(linkId, dryRun, actions) {
  const link = await db('contract_rooms as cr')
    .leftJoin('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.id', linkId)
    .select('cr.id', 'cr.contract_id', 'cr.room_id', 'cr.area', 'r.room_number', 'r.status as room_status')
    .first();
  if (!link) return;
  actions.push({
    type: 'detach_room',
    linkId: link.id,
    contractId: link.contract_id,
    roomId: link.room_id,
    roomNumber: link.room_number,
    area: Number(link.area || 0),
  });
  if (!dryRun) {
    await db('contract_rooms').where({ id: link.id }).delete();
    const freed = await freeRoomIfUnlinked(link.room_id);
    if (freed) {
      actions.push({ type: 'mark_room_free', roomId: link.room_id, roomNumber: link.room_number });
    }
  }
}

async function cancelChargesFromMonth(contractId, year, fromMonth, dryRun, actions) {
  const rows = await db('rent_charges')
    .where({ contract_id: contractId, period_year: year })
    .where('period_month', '>=', fromMonth)
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat');
  if (!rows.length) return;
  actions.push({
    type: 'cancel_rent_charges_from_month',
    contractId,
    fromMonth,
    count: rows.length,
    sum: roundMoney(rows.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
    months: rows.map((r) => r.period_month),
  });
  if (!dryRun) {
    await db('rent_charges')
      .whereIn(
        'id',
        rows.map((r) => r.id)
      )
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: 'tenant_left_from_march_paper_list',
        updated_at: db.fn.now(),
      });
  }
}

async function softDeleteContract(contractId, dryRun, actions, reason) {
  actions.push({ type: 'soft_delete_contract', contractId, reason });
  if (!dryRun) {
    await db('contracts').where({ id: contractId }).update({
      status: 'terminated',
      deleted_at: db.fn.now(),
      actual_end_date: '2026-02-28',
      updated_at: db.fn.now(),
    });
  }
}

async function findRoomByBuildingFloorNumber(propertyId, buildingCodes, floorLevel, roomNumber) {
  const nums = [String(roomNumber), String(roomNumber).toLowerCase(), String(roomNumber).toUpperCase()];
  const q = db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', propertyId)
    .whereNull('r.deleted_at')
    .whereIn('r.room_number', nums)
    .where(function () {
      for (const code of buildingCodes) {
        this.orWhere('b.code', code).orWhere('b.name', 'like', `%${code}%`);
      }
    })
    .select(
      'r.id as roomId',
      'r.room_number',
      'r.status',
      'r.area',
      'b.code as buildingCode',
      'b.name as buildingName',
      'f.name as floorName',
      'f.level_number'
    )
    .orderBy('r.id', 'asc');
  if (floorLevel != null) {
    q.andWhere(function () {
      this.where('f.level_number', floorLevel).orWhere('f.name', 'like', `%${floorLevel}%`);
    });
  }
  return q.first();
}

/**
 * Paper-list cleanup for specific tenants (rooms, Borzenko exit, Vlasenko room 2).
 */
async function repairPaperLeaseCleanup({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || 2026;
  const report = { propertyId: pid, year: y, dryRun, tenants: [] };

  // ——— 1. Бандюкевич: keep 10 + 888, remove 6б + 88 ———
  {
    const actions = [];
    const tenant = await db('tenants').where('name', 'like', '%Бандюкевич%').whereNull('deleted_at').first();
    if (tenant) {
      const removeRoomIds = [180169, 120098]; // 6б, 88
      const links = await db('contract_rooms').whereIn('room_id', removeRoomIds).select('id', 'room_id', 'contract_id');
      for (const link of links) {
        await detachLink(link.id, dryRun, actions);
      }
      report.tenants.push({
        key: 'bandyukevich',
        tenantId: tenant.id,
        tenantName: tenant.name,
        keep: ['10', '888'],
        actions,
      });
    } else {
      report.tenants.push({ key: 'bandyukevich', error: 'tenant_not_found' });
    }
  }

  // ——— 2. Борзенко: left from March ———
  {
    const actions = [];
    const tenant = await db('tenants').where('name', 'like', '%Борзенко%').whereNull('deleted_at').first();
    if (tenant) {
      const contract = await db('contracts')
        .where({ tenant_id: tenant.id, property_id: pid, contract_number: '59/12-20' })
        .whereNull('deleted_at')
        .first();
      if (contract) {
        await cancelChargesFromMonth(contract.id, y, 3, dryRun, actions);
        const utilFromMar = await db('utility_charges')
          .where({ contract_id: contract.id, period_year: y })
          .where('period_month', '>=', 3)
          .select('id', 'period_month', 'amount');
        if (utilFromMar.length) {
          actions.push({
            type: 'delete_utility_charges_from_month',
            contractId: contract.id,
            fromMonth: 3,
            count: utilFromMar.length,
          });
          if (!dryRun) {
            await db('utility_charges')
              .whereIn(
                'id',
                utilFromMar.map((r) => r.id)
              )
              .delete();
          }
        }
        const utilPaysFromMar = await db('payments')
          .where({
            contract_id: contract.id,
            period_year: y,
            payment_type: 'utilities',
          })
          .where('period_month', '>=', 3)
          .select('id');
        if (utilPaysFromMar.length) {
          actions.push({
            type: 'delete_utility_payments_from_month',
            contractId: contract.id,
            count: utilPaysFromMar.length,
          });
          if (!dryRun) {
            await db('payments')
              .whereIn(
                'id',
                utilPaysFromMar.map((r) => r.id)
              )
              .delete();
          }
        }
        const links = await db('contract_rooms').where({ contract_id: contract.id }).select('id');
        for (const link of links) {
          await detachLink(link.id, dryRun, actions);
        }
        await softDeleteContract(contract.id, dryRun, actions, 'left_from_march_paper_list');
      }
      report.tenants.push({
        key: 'borzenko',
        tenantId: tenant.id,
        tenantName: tenant.name,
        keep: [],
        actions,
      });
    } else {
      report.tenants.push({ key: 'borzenko', error: 'tenant_not_found' });
    }
  }

  // ——— 3. Липинская: keep 7 + 7а, remove room 1 (90098) ———
  {
    const actions = [];
    const tenant = await db('tenants').where('name', 'like', '%Липинск%').whereNull('deleted_at').first();
    if (tenant) {
      const links = await db('contract_rooms').where({ room_id: 90098 }).select('id');
      for (const link of links) {
        await detachLink(link.id, dryRun, actions);
      }
      // Cancel zero/dup charges on contract 47 for the fake 71.2 area rows if still linked charges only
      const c47 = await db('contracts').where({ id: 47, tenant_id: tenant.id }).first();
      if (c47) {
        const phantom = await db('rent_charges')
          .where({ contract_id: 47, period_year: y })
          .whereNot('status', 'cancelled')
          .where(function () {
            this.where('amount_with_vat', 0).orWhere('area', 71.2);
          })
          .select('id', 'period_month', 'amount_with_vat', 'area');
        if (phantom.length) {
          actions.push({
            type: 'cancel_phantom_lipinskaya_charges',
            count: phantom.length,
            ids: phantom.map((r) => r.id),
          });
          if (!dryRun) {
            await db('rent_charges')
              .whereIn(
                'id',
                phantom.map((r) => r.id)
              )
              .update({
                status: 'cancelled',
                manual_adjustment: true,
                adjustment_reason: 'paper_list_remove_fake_room_1',
                updated_at: db.fn.now(),
              });
          }
        }
      }
      report.tenants.push({
        key: 'lipinskaya',
        tenantId: tenant.id,
        tenantName: tenant.name,
        keep: ['7', '7а'],
        actions,
      });
    } else {
      report.tenants.push({ key: 'lipinskaya', error: 'tenant_not_found' });
    }
  }

  // ——— 4. Власенко: remove 5/6/9/9, attach 56а floor1 room 2 ———
  {
    const actions = [];
    const tenant = await db('tenants').where('name', 'like', '%Власенко%').whereNull('deleted_at').first();
    if (tenant) {
      const removeRoomIds = [150097, 180098, 180118, 270111];
      const links = await db('contract_rooms')
        .whereIn('room_id', removeRoomIds)
        .whereIn(
          'contract_id',
          db('contracts').where({ tenant_id: tenant.id }).select('id')
        )
        .select('id');
      for (const link of links) {
        await detachLink(link.id, dryRun, actions);
      }

      const canonical = await db('contracts')
        .where({ tenant_id: tenant.id, property_id: pid })
        .whereNull('deleted_at')
        .whereIn('status', ['active', 'expiring'])
        .orderBy('id', 'asc')
        .first();

      const target = await findRoomByBuildingFloorNumber(pid, ['56а', '56a'], 1, '2');
      actions.push({
        type: 'lookup_vlasenko_room_2',
        found: target || null,
      });
      if (canonical && target) {
        const already = await db('contract_rooms')
          .where({ contract_id: canonical.id, room_id: target.roomId })
          .first();
        if (!already) {
          // Ensure room not held by another live contract
          const other = await db('contract_rooms as cr')
            .join('contracts as c', 'c.id', 'cr.contract_id')
            .where('cr.room_id', target.roomId)
            .whereNull('c.deleted_at')
            .whereIn('c.status', ['active', 'expiring'])
            .whereNot('c.id', canonical.id)
            .select('cr.id', 'c.id as contractId', 'c.contract_number')
            .first();
          if (other) {
            actions.push({
              type: 'detach_room_from_other_before_attach',
              linkId: other.id,
              fromContractId: other.contractId,
              roomId: target.roomId,
            });
            if (!dryRun) {
              await db('contract_rooms').where({ id: other.id }).delete();
            }
          }
          actions.push({
            type: 'attach_room',
            contractId: canonical.id,
            roomId: target.roomId,
            roomNumber: target.room_number,
            building: target.buildingCode || target.buildingName,
            floor: target.floorName,
            area: Number(target.area || 0),
          });
          if (!dryRun) {
            const area = Number(target.area || 0);
            const rate = Number(canonical.rate_without_vat || 21) || 21;
            await db('contract_rooms').insert({
              contract_id: canonical.id,
              room_id: target.roomId,
              area: area > 0 ? area : 0.01,
              rate_without_vat: rate,
              start_date: canonical.start_date || canonical.contract_date || null,
            });
            await db('rooms').where({ id: target.roomId }).update({
              status: 'occupied',
              current_rate_without_vat: rate,
              updated_at: db.fn.now(),
            });
          }
        } else {
          actions.push({ type: 'room_2_already_linked', contractId: canonical.id, roomId: target.roomId });
        }
      } else if (!target) {
        actions.push({ type: 'warn_room_2_not_found_in_56a_floor1' });
      }

      report.tenants.push({
        key: 'vlasenko',
        tenantId: tenant.id,
        tenantName: tenant.name,
        keep: ['2 (56а)'],
        actions,
      });
    } else {
      report.tenants.push({ key: 'vlasenko', error: 'tenant_not_found' });
    }
  }

  // ——— 5. БьютиСистем: keep 11(360107), 11а(360108), 5(360114) ———
  {
    const actions = [];
    const tenant = await db('tenants').where('name', 'like', '%БьютиСистем%').whereNull('deleted_at').first();
    if (tenant) {
      const keepRoomIds = new Set([360107, 360108, 360114]);
      const contractIds = await db('contracts').where({ tenant_id: tenant.id, property_id: pid }).pluck('id');
      const links = await db('contract_rooms').whereIn('contract_id', contractIds).select('id', 'room_id');
      for (const link of links) {
        if (!keepRoomIds.has(Number(link.room_id))) {
          await detachLink(link.id, dryRun, actions);
        }
      }
      // Cancel zero-amount junk and charges on rooms that are no longer linked after cleanup
      // Also cancel obvious duplicate 504 charges that flooded stub 270087 for months with many rows —
      // safer: cancel rent_charges on contracts that end up with zero rooms after merge step.
      report.tenants.push({
        key: 'beautysystem',
        tenantId: tenant.id,
        tenantName: tenant.name,
        keep: ['11', '11а', '5'],
        actions,
      });
    } else {
      report.tenants.push({ key: 'beautysystem', error: 'tenant_not_found' });
    }
  }

  // Merge duplicate contract numbers for these tenants
  const mergeNumbers = ['31/12-20', '80/07-23', '24/12-20', '55/02-26'];
  const merge = await repairDuplicateContractPayments({
    propertyId: pid,
    year: y,
    dryRun,
    contractNumbers: mergeNumbers,
  });
  report.duplicateMerge = {
    dryRun: merge.dryRun,
    groupsChanged: merge.groupsChanged,
    paymentsMoved: merge.paymentsMoved,
    chargesMoved: merge.chargesMoved,
    utilChargesMoved: merge.utilChargesMoved,
    planned: merge.planned,
  };

  // After merge: cancel rent charges on soft-deleted / empty stub contracts for Beauty if any remain live with no keep rooms
  {
    const tenant = await db('tenants').where('name', 'like', '%БьютиСистем%').whereNull('deleted_at').first();
    if (tenant) {
      const actions = [];
      const contracts = await db('contracts')
        .where({ tenant_id: tenant.id, property_id: pid })
        .whereNull('deleted_at')
        .select('id');
      for (const c of contracts) {
        const roomCount = await db('contract_rooms').where({ contract_id: c.id }).count('* as c').first();
        if (Number(roomCount?.c || 0) === 0) {
          const liveCharges = await db('rent_charges')
            .where({ contract_id: c.id, period_year: y })
            .whereNot('status', 'cancelled')
            .select('id', 'period_month', 'amount_with_vat');
          if (liveCharges.length) {
            actions.push({
              type: 'cancel_charges_on_empty_contract',
              contractId: c.id,
              count: liveCharges.length,
              sum: roundMoney(liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
            });
            if (!dryRun) {
              await db('rent_charges')
                .whereIn(
                  'id',
                  liveCharges.map((r) => r.id)
                )
                .update({
                  status: 'cancelled',
                  manual_adjustment: true,
                  adjustment_reason: 'paper_list_empty_contract_after_room_cleanup',
                  updated_at: db.fn.now(),
                });
            }
          }
          // Move payments to canonical with rooms if needed — merge already handled most.
          await softDeleteContract(c.id, dryRun, actions, 'empty_after_paper_room_cleanup');
        }
      }
      const bs = report.tenants.find((t) => t.key === 'beautysystem');
      if (bs) bs.actions.push(...actions);
    }
  }

  // Beauty: collapse duplicate identical charges per month (504×N junk from fake rooms).
  {
    const tenant = await db('tenants').where('name', 'like', '%БьютиСистем%').whereNull('deleted_at').first();
    if (tenant) {
      const actions = [];
      const liveContracts = await db('contracts')
        .where({ tenant_id: tenant.id, property_id: pid })
        .whereNull('deleted_at')
        .whereIn('status', ['active', 'expiring'])
        .select('id');
      for (const c of liveContracts) {
        const charges = await db('rent_charges')
          .where({ contract_id: c.id, period_year: y })
          .whereNot('status', 'cancelled')
          .select('id', 'period_month', 'amount_with_vat', 'area');
        const byMonth = new Map();
        for (const ch of charges) {
          const m = Number(ch.period_month);
          if (!byMonth.has(m)) byMonth.set(m, []);
          byMonth.get(m).push(ch);
        }
        const toCancel = [];
        for (const [, rows] of byMonth) {
          const seen = new Map();
          for (const row of rows) {
            const key = `${Number(row.area)}:${Number(row.amount_with_vat)}`;
            if (seen.has(key)) toCancel.push(row.id);
            else seen.set(key, row.id);
          }
        }
        if (toCancel.length) {
          actions.push({
            type: 'cancel_duplicate_identical_month_charges',
            contractId: c.id,
            count: toCancel.length,
          });
          if (!dryRun) {
            await db('rent_charges').whereIn('id', toCancel).update({
              status: 'cancelled',
              manual_adjustment: true,
              adjustment_reason: 'paper_list_dedupe_beauty_charges',
              updated_at: db.fn.now(),
            });
          }
        }
      }
      const bs = report.tenants.find((t) => t.key === 'beautysystem');
      if (bs) bs.actions.push(...actions);
    }
  }

  if (!dryRun) {
    invalidateRentRegisterCache(pid);
  }

  return report;
}

module.exports = {
  repairPaperLeaseCleanup,
};
