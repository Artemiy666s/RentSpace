/**
 * Подключает планы этажей здания 56Е (сканы) и создаёт помещения с SVG-контурами.
 * Запуск: node scripts/setup-building-56e.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { imageSize } = require('image-size');
const { db } = require('../server/db');

const PLAN_W = 1600;
const PLAN_H = 900;

function readPlanDimensions(uploadsDir, imageFile) {
  const buf = fs.readFileSync(path.join(uploadsDir, imageFile));
  const dim = imageSize(buf);
  return { width: dim.width, height: dim.height };
}

function poly(points) {
  return JSON.stringify({ type: 'polygon', points });
}

function rect(x, y, w, h) {
  return poly([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

/** Масштабирует контур из системы координат 1600×900 в размер подложки */
/** Тонкая подгонка 1 этажа (внутренние границы стен на скане) */
const FLOOR1_OFFSET = { x: 14, y: 16 };

function offsetShape(shape, dx, dy) {
  const data = JSON.parse(shape);
  data.points = data.points.map(([x, y]) => [x + dx, y + dy]);
  return JSON.stringify(data);
}

function shapeForPlan(shape, planW, planH, baseW = PLAN_W, baseH = PLAN_H) {
  if (planW === baseW && planH === baseH) return shape;
  const data = JSON.parse(shape);
  const sx = planW / baseW;
  const sy = planH / baseH;
  data.points = data.points.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]);
  return JSON.stringify(data);
}

const FLOOR_DATA = [
  {
    level: 1,
    name: '1 этаж',
    imageFile: '56e-floor-1.png',
    // Координаты в пикселях подложки (1024×630), по линиям стен на скане
    rooms: [
      {
        num: '101',
        name: 'Помещение 101',
        area: 98.6,
        type: 'office',
        status: 'occupied',
        shape: poly([
          [184, 336], [346, 336], [346, 582], [184, 582],
        ]),
      },
      {
        num: '102',
        name: 'Помещение 102',
        area: 75.4,
        type: 'office',
        status: 'ready_for_rent',
        shape: poly([
          [366, 336], [452, 336], [452, 582], [366, 582],
        ]),
      },
      {
        num: '103',
        name: 'Помещение 103',
        area: 91.2,
        type: 'office',
        status: 'occupied',
        shape: poly([
          [472, 336], [558, 336], [558, 582], [472, 582],
        ]),
      },
      {
        num: '104',
        name: 'Помещение 104',
        area: 58.3,
        type: 'office',
        status: 'occupied',
        shape: poly([
          [126, 54], [294, 54], [294, 220], [220, 220], [220, 246], [126, 246],
        ]),
      },
      {
        num: '105',
        name: 'Помещение 105',
        area: 83.7,
        type: 'office',
        status: 'free',
        shape: poly([
          [306, 54], [504, 54], [504, 246], [306, 246],
        ]),
      },
      {
        num: '106',
        name: 'Помещение 106',
        area: 21.2,
        type: 'office',
        status: 'negotiation',
        shape: poly([
          [522, 54], [558, 54], [558, 246], [522, 246],
        ]),
      },
      {
        num: 'ЛК',
        name: 'Лестничная клетка',
        area: 14,
        type: 'service',
        status: 'technical',
        shape: poly([
          [56, 54], [118, 54], [118, 168], [56, 168],
        ]),
      },
      {
        num: 'К1',
        name: 'Коридор',
        area: 42,
        type: 'service',
        status: 'technical',
        shape: poly([
          [126, 254], [558, 254], [558, 324], [126, 324],
        ]),
      },
      {
        num: 'СУ',
        name: 'Санузлы',
        area: 28,
        type: 'service',
        status: 'technical',
        shape: poly([
          [568, 54], [966, 54], [966, 582], [568, 582],
        ]),
      },
    ],
  },
  {
    level: 2,
    name: '2 этаж',
    imageFile: '56e-floor-2.png',
    rooms: [
      { num: '5', name: 'Кабинет нач. классов', area: 59.7, type: 'office', status: 'occupied', shape: rect(48, 565, 355, 295) },
      { num: '7', name: 'Кабинет нач. классов', area: 57.3, type: 'office', status: 'free', shape: rect(425, 565, 335, 295) },
      { num: '8', name: 'Кабинет нач. классов', area: 61.4, type: 'office', status: 'occupied', shape: rect(785, 565, 375, 295) },
      { num: '2', name: 'Рекреация', area: 48.2, type: 'office', status: 'occupied', shape: rect(205, 52, 475, 385) },
      { num: '10', name: 'Кабинет психолога', area: 33.4, type: 'office', status: 'occupied', shape: rect(705, 52, 385, 385) },
      { num: '9', name: 'Коридор', area: 38.4, type: 'service', status: 'technical', shape: rect(205, 448, 875, 105) },
      { num: '1', name: 'Коридор (пристройка)', area: 8.2, type: 'service', status: 'technical', shape: rect(1105, 52, 125, 500) },
      { num: '3', name: 'Санузел', area: 4.5, type: 'service', status: 'technical', shape: rect(1255, 415, 95, 115) },
      { num: '4', name: 'Санузел', area: 4.5, type: 'service', status: 'technical', shape: rect(1255, 555, 95, 115) },
    ],
  },
  {
    level: 3,
    name: '3 этаж',
    imageFile: '56e-floor-3.png',
    rooms: [
      { num: '9', name: 'Кабинет бел. языка', area: 59.4, type: 'office', status: 'ready_for_rent', shape: rect(40, 80, 300, 760) },
      { num: '10', name: 'Рекреация', area: 61.6, type: 'office', status: 'ready_for_rent', shape: rect(380, 80, 360, 360) },
      { num: '11', name: 'Кабинет', area: 18.3, type: 'office', status: 'occupied', shape: rect(760, 80, 200, 200) },
      { num: '12', name: 'Кабинет информатики', area: 51.1, type: 'office', status: 'occupied', shape: rect(980, 80, 300, 200) },
      { num: '13', name: 'Кабинет лингвистики', area: 41, type: 'office', status: 'occupied', shape: rect(1300, 80, 260, 200) },
      { num: '14', name: 'Лаборатория', area: 18.5, type: 'office', status: 'negotiation', shape: rect(760, 300, 200, 140) },
      { num: '5', name: 'Кабинет физики', area: 67.6, type: 'office', status: 'occupied', shape: rect(760, 480, 800, 360) },
      { num: '6', name: 'Кабинет', area: 33.2, type: 'office', status: 'free', shape: rect(380, 480, 360, 360) },
      { num: '7', name: 'Кабинет', area: 12.9, type: 'office', status: 'repair', shape: rect(380, 300, 180, 160) },
      { num: '8', name: 'Кладовая', area: 5.1, type: 'warehouse', status: 'technical', shape: rect(200, 300, 120, 100) },
      { num: '10к', name: 'Коридор', area: 35.1, type: 'service', status: 'technical', shape: rect(580, 460, 160, 80) },
      { num: '15', name: 'Санузел блок', area: 22, type: 'service', status: 'technical', shape: rect(1320, 300, 240, 540) },
    ],
  },
];

async function main() {
  const uploadsDir = path.join(process.cwd(), 'server', 'uploads', 'floor-plans');
  for (const floor of FLOOR_DATA) {
    const imgPath = path.join(uploadsDir, floor.imageFile);
    if (!fs.existsSync(imgPath)) {
      console.error(`Нет файла: ${imgPath}`);
      process.exit(1);
    }
  }

  const property = await db('properties').where({ name: 'ТРК «Квартал»' }).first();
  if (!property) {
    console.error('Объект «ТРК «Квартал»» не найден. Запустите npm run seed');
    process.exit(1);
  }

  const building = await db('buildings')
    .where({ property_id: property.id })
    .where(function () {
      this.where('code', '56е').orWhere('code', '56e').orWhere('name', 'like', '%56е%');
    })
    .first();

  if (!building) {
    console.error('Здание 56Е не найдено в БД');
    process.exit(1);
  }

  console.log(`Здание: ${building.name} (id=${building.id})`);

  for (const floorDef of FLOOR_DATA) {
    let floor = await db('floors')
      .where({ building_id: building.id, level_number: floorDef.level })
      .first();

    if (!floor) {
      const [floorId] = await db('floors').insert({
        building_id: building.id,
        name: floorDef.name,
        level_number: floorDef.level,
      });
      floor = await db('floors').where({ id: floorId }).first();
      console.log(`  Создан этаж: ${floorDef.name}`);
    }

    await db('floor_plans').where({ floor_id: floor.id }).update({ is_active: false });

    const imageRel = `floor-plans/${floorDef.imageFile}`;
    const imgDim = readPlanDimensions(uploadsDir, floorDef.imageFile);
    const planW = floorDef.planW || imgDim.width;
    const planH = floorDef.planH || imgDim.height;
    const [planId] = await db('floor_plans').insert({
      floor_id: floor.id,
      image_path: imageRel,
      original_file_name: floorDef.imageFile,
      width: planW,
      height: planH,
      version: (await db('floor_plans').where({ floor_id: floor.id }).count('id as c').first()).c + 1,
      is_active: true,
    });

    const existingRooms = await db('rooms').where({ floor_id: floor.id }).select('id');
    if (existingRooms.length) {
      const ids = existingRooms.map((r) => r.id);
      await db('room_shapes').whereIn('room_id', ids).del();
      await db('contract_rooms').whereIn('room_id', ids).del();
      await db('rent_charges').whereIn('room_id', ids).del();
      await db('utility_charges').whereIn('room_id', ids).del();
      await db('rooms').whereIn('id', ids).del();
    }

    let z = 1;
    for (const r of floorDef.rooms) {
      const [roomId] = await db('rooms').insert({
        property_id: property.id,
        building_id: building.id,
        floor_id: floor.id,
        room_number: r.num,
        name: r.name,
        area: r.area,
        rentable_area: r.type === 'service' || r.status === 'technical' ? 0 : r.area,
        room_type: r.type,
        status: r.status,
        recommended_rate_without_vat: r.type === 'office' ? 18 : null,
        current_rate_without_vat: r.status === 'occupied' || r.status === 'debt' ? 18 : null,
      });

      await db('room_shapes').insert({
        room_id: roomId,
        floor_plan_id: planId,
        shape_type: 'polygon',
        points_json:
          floorDef.level === 1
            ? offsetShape(r.shape, FLOOR1_OFFSET.x, FLOOR1_OFFSET.y)
            : shapeForPlan(r.shape, planW, planH),
        z_index: z++,
        is_active: true,
      });
    }

    console.log(`  ${floorDef.name}: план ${floorDef.imageFile}, помещений: ${floorDef.rooms.length}`);
  }

  console.log('Готово. Откройте Карта помещений → Здание 56е → нужный этаж.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
