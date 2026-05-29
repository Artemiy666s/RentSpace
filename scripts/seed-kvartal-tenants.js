/**
 * Загрузка реестра арендаторов ТРК «Квартал» в БД (без удаления существующих данных).
 * Usage: npm run seed:tenants
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { db, checkConnection } = require('../server/db');
const TENANTS = require('../server/data/kvartal-tenants-register');

function detectLegalType(name) {
  const s = String(name).toUpperCase();
  if (/\bИП\b/.test(s) || s.startsWith('ИП ')) return 'ip';
  if (/\bЧП\b/.test(s) || /\bЧУП\b/.test(s) || /\bЧТУП\b/.test(s)) return 'chp';
  if (/\bООО\b/.test(s) || s.includes('«')) return 'ooo';
  if (/\bОАО\b/.test(s)) return 'oao';
  if (/\bЗАО\b/.test(s)) return 'zao';
  if (/\bРУП\b/.test(s) || /\bФ-Л\b/.test(s)) return 'other';
  if (/^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\./.test(name.trim())) return 'physical';
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
  return sum > 0 ? sum : 1;
}

function primaryRate(rates) {
  const r = rates.find((x) => Number(x) > 0);
  return r != null ? Number(r) : Number(rates[0]) || 0;
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

async function main() {
  if (!(await checkConnection())) {
    console.error('MySQL не подключена. Проверьте .env');
    process.exit(1);
  }

  const org = await db('organizations').where({ status: 'active' }).first();
  if (!org) {
    console.error('Нет организации. Выполните: npm run seed');
    process.exit(1);
  }

  const property = await db('properties')
    .where({ organization_id: org.id, status: 'active' })
    .where('name', 'like', '%Квартал%')
    .first();

  if (!property) {
    console.error('Объект ТРК «Квартал» не найден. Выполните: npm run seed');
    process.exit(1);
  }

  const { buildingId, floorId } = await ensureRegistryFloor(property.id);

  const summary = { tenants: 0, contracts: 0, rooms: 0, contractRooms: 0, skipped: 0 };

  for (const row of TENANTS) {
    const name = row.name.trim();
    const { contractNumber, startDate, contractDate } = parseContract(row.contract, row.seq);
    const areaTotal = totalArea(row.areas);
    const rate = primaryRate(row.rates);

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
        status: rate > 0 ? 'active' : 'archived',
        comment: row.areas.length > 1 ? `Площади: ${row.areas.join(' + ')} м²` : null,
      });
      contract = { id: cid };
      summary.contracts++;
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
        area: areaTotal,
        rentable_area: areaTotal,
        room_type: 'retail',
        status: 'occupied',
        current_rate_without_vat: rate > 0 ? rate : null,
      });
      room = { id: rid };
      summary.rooms++;
    } else {
      await db('rooms').where({ id: room.id }).update({
        name: name.slice(0, 120),
        area: areaTotal,
        rentable_area: areaTotal,
        status: 'occupied',
        current_rate_without_vat: rate > 0 ? rate : null,
        updated_at: db.fn.now(),
      });
    }

    const segments = row.areas.length ? row.areas : [areaTotal];
    const rates = row.rates.length ? row.rates : [rate];

    for (let i = 0; i < segments.length; i++) {
      const segArea = Number(segments[i]) || areaTotal;
      const segRate = Number(rates[i] ?? rates[0]) || rate;
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
            status: 'occupied',
            current_rate_without_vat: segRate > 0 ? segRate : null,
          });
          segRoom = { id: srid };
          summary.rooms++;
        }
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
        summary.skipped++;
      }
    }
  }

  const tenantCount = await db('tenants').where({ organization_id: org.id }).whereNull('deleted_at').count('* as c');
  const contractCount = await db('contracts').where({ property_id: property.id }).whereNull('deleted_at').count('* as c');

  console.log('Реестр арендаторов загружен.');
  console.log('Добавлено:', summary);
  console.log(`Всего в БД: арендаторов ${tenantCount[0].c}, договоров ${contractCount[0].c}`);
  console.log('Проверьте: Арендаторы, Аренда по счетам, Все данные → Арендаторы');

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
