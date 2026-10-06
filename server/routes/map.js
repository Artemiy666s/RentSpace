const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { floorPlanUpload, propertyPlanUpload } = require('../middlewares/upload');
const { STATUS_COLORS } = require('../utils/roomStatus');
const { roomRentableArea, isOccupiedForArea } = require('../utils/rentableArea');
const { readImageDimensions } = require('../utils/imageDimensions');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');

const { MAP_EDIT_ROLES } = require('../constants/roles');

const router = express.Router();
const publicRouter = express.Router();

const PLAN_META_COLUMNS = [
  'id',
  'floor_id',
  'width',
  'height',
  'version',
  'is_active',
  'image_path',
  'image_mime',
  'original_file_name',
  'created_at',
  'updated_at',
];

/** In-memory blob cache so warm instances don't re-fetch ~1MB PNG from TiDB every time. */
const PLAN_BLOB_CACHE = new Map();
const PLAN_BLOB_CACHE_MAX = 24;
const PLAN_IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

router.use(authenticate, requireOrgAccess());

function planImageUrl(plan) {
  if (!plan?.image_path) return null;
  return `/uploads/${plan.image_path.replace(/^server\/uploads\/?/, '')}`;
}

function hmacPlanSig(typ, planId, version) {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`${typ}:${Number(planId)}:${Number(version) || 1}`)
    .digest('base64url');
}

function verifyHmacPlanSig(typ, planId, version, sig) {
  if (!sig) return false;
  const expected = hmacPlanSig(typ, planId, version);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stable signed URL (versioned) so browsers can cache plan images across reloads. */
function signPlanImageUrl(planId, version = 1) {
  const v = Number(version) || 1;
  const sig = hmacPlanSig('floor_plan_img', planId, v);
  return `/api/floor-plans/${planId}/image?v=${v}&sig=${encodeURIComponent(sig)}`;
}

function signPropertyPlanImageUrl(planId, version = 1) {
  const v = Number(version) || 1;
  const sig = hmacPlanSig('property_plan_img', planId, v);
  return `/api/property-plans/${planId}/image?v=${v}&sig=${encodeURIComponent(sig)}`;
}

function planBlobCacheGet(kind, planId, version) {
  const key = `${kind}:${planId}:${version}`;
  const hit = PLAN_BLOB_CACHE.get(key);
  if (!hit) return null;
  PLAN_BLOB_CACHE.delete(key);
  PLAN_BLOB_CACHE.set(key, hit);
  return hit;
}

function planBlobCacheSet(kind, planId, version, mime, buf) {
  const key = `${kind}:${planId}:${version}`;
  if (PLAN_BLOB_CACHE.has(key)) PLAN_BLOB_CACHE.delete(key);
  PLAN_BLOB_CACHE.set(key, { mime, buf });
  while (PLAN_BLOB_CACHE.size > PLAN_BLOB_CACHE_MAX) {
    const oldest = PLAN_BLOB_CACHE.keys().next().value;
    PLAN_BLOB_CACHE.delete(oldest);
  }
}

function sendPlanImage(res, mime, buf) {
  res.setHeader('Content-Type', mime || 'image/png');
  res.setHeader('Cache-Control', PLAN_IMAGE_CACHE_CONTROL);
  return res.end(buf);
}

const PROPERTY_PLAN_META_COLUMNS = [
  'id',
  'property_id',
  'width',
  'height',
  'version',
  'is_active',
  'image_path',
  'image_mime',
  'original_file_name',
  'created_at',
  'updated_at',
];

let propertyPlanTablesReady = null;

async function ensurePropertyPlanTables() {
  if (propertyPlanTablesReady) return propertyPlanTablesReady;
  propertyPlanTablesReady = (async () => {
    const hasPlans = await db.schema.hasTable('property_plans');
    if (!hasPlans) {
      await db.schema.createTable('property_plans', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('property_id').unsigned().notNullable();
        t.string('image_path', 512).nullable();
        t.string('original_file_name', 255).nullable();
        t.string('image_mime', 64).nullable();
        t.specificType('image_blob', 'LONGBLOB').nullable();
        t.integer('width').unsigned().nullable();
        t.integer('height').unsigned().nullable();
        t.integer('version').unsigned().notNullable().defaultTo(1);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.timestamp('updated_at').defaultTo(db.fn.now());
        t.index(['property_id', 'is_active'], 'idx_property_plans_active');
      });
    }
    const hasShapes = await db.schema.hasTable('building_shapes');
    if (!hasShapes) {
      await db.schema.createTable('building_shapes', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('building_id').unsigned().notNullable();
        t.bigInteger('property_plan_id').unsigned().notNullable();
        t.enum('shape_type', ['polygon', 'rect']).notNullable().defaultTo('polygon');
        t.json('points_json').notNullable();
        t.string('fill_color', 32).nullable();
        t.string('stroke_color', 32).nullable();
        t.integer('z_index').notNullable().defaultTo(1);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.timestamp('updated_at').defaultTo(db.fn.now());
        t.index(['property_plan_id', 'is_active'], 'idx_building_shapes_plan_active');
        t.index(['building_id', 'is_active'], 'idx_building_shapes_building_active');
      });
    }
  })().catch((err) => {
    propertyPlanTablesReady = null;
    throw err;
  });
  return propertyPlanTablesReady;
}

function propertyPlanImageHref(plan) {
  if (!plan) return null;
  if (plan.image_mime || plan.image_blob) {
    return signPropertyPlanImageUrl(plan.id, plan.version);
  }
  return planImageUrl(plan);
}

function toPublicPropertyPlan(plan) {
  if (!plan) return null;
  const meta = {};
  for (const key of PROPERTY_PLAN_META_COLUMNS) {
    if (plan[key] !== undefined) meta[key] = plan[key];
  }
  return { ...meta, imageUrl: propertyPlanImageHref(meta) };
}

function verifyPropertyPlanImageSig(sig, planId) {
  const payload = jwt.verify(String(sig), config.jwt.secret);
  if (payload.typ !== 'property_plan_img' || Number(payload.planId) !== Number(planId)) {
    throw new Error('invalid sig');
  }
}

async function verifyPropertyPlanImageBearer(req, plan) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  const payload = jwt.verify(token, config.jwt.secret);
  const user = await db('users').where({ id: payload.userId, status: 'active' }).first();
  if (!user) return false;
  const property = await db('properties').where({ id: plan.property_id }).first();
  if (!property || property.organization_id !== user.organization_id) return false;
  return true;
}

async function getActivePropertyPlan(propertyId) {
  await ensurePropertyPlanTables();
  return db('property_plans')
    .where({ property_id: propertyId, is_active: true })
    .orderBy('version', 'desc')
    .select(PROPERTY_PLAN_META_COLUMNS)
    .first();
}

async function buildPropertyPlanPayload(plan, propertyId) {
  await ensurePropertyPlanTables();

  if (!plan) {
    const propertyBuildings = await db('buildings')
      .where({ property_id: propertyId })
      .orderBy('name')
      .select('id', 'name', 'code');
    return {
      plan: null,
      buildings: [],
      propertyBuildings: propertyBuildings.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        hasShape: false,
      })),
    };
  }

  const [propertyBuildings, shapes, rooms, floorCounts] = await Promise.all([
    db('buildings')
      .where({ property_id: propertyId })
      .orderBy('name')
      .select('id', 'name', 'code'),
    db('building_shapes as bs')
      .join('buildings as b', 'b.id', 'bs.building_id')
      .where({ 'bs.property_plan_id': plan.id, 'bs.is_active': true })
      .select(
        'bs.id',
        'bs.building_id',
        'bs.shape_type',
        'bs.points_json',
        'bs.fill_color',
        'bs.stroke_color',
        'bs.z_index',
        'b.name as building_name',
        'b.code as building_code'
      ),
    db('rooms')
      .where({ property_id: propertyId })
      .whereNull('deleted_at')
      .select('id', 'building_id', 'area', 'rentable_area', 'status', 'room_type'),
    db('floors as f')
      .join('buildings as b', 'b.id', 'f.building_id')
      .where('b.property_id', propertyId)
      .groupBy('f.building_id')
      .select('f.building_id')
      .count({ floorsCount: 'f.id' }),
  ]);

  const shapedBuildingIds = new Set(shapes.map((s) => Number(s.building_id)));
  const leaseByRoom = await loadActiveLeasesByRoomIds(rooms.map((r) => r.id));

  const statsByBuilding = {};
  for (const r of rooms) {
    const bid = Number(r.building_id);
    if (!statsByBuilding[bid]) {
      statsByBuilding[bid] = { totalArea: 0, rentedArea: 0, freeArea: 0, otherArea: 0 };
    }
    const lease = leaseByRoom.get(Number(r.id));
    const status = occupancyFromLease(r.status, lease);
    const area = roomRentableArea({ ...r, status });
    statsByBuilding[bid].totalArea += area;
    if (isOccupiedForArea(status)) statsByBuilding[bid].rentedArea += area;
    else if (['free', 'ready_for_rent'].includes(status)) statsByBuilding[bid].freeArea += area;
    else statsByBuilding[bid].otherArea += area;
  }

  const floorsByBuilding = Object.fromEntries(
    floorCounts.map((r) => [Number(r.building_id), Number(r.floorsCount) || 0])
  );

  const buildings = shapes.map((s) => {
    const bid = Number(s.building_id);
    const stats = statsByBuilding[bid] || {
      totalArea: 0,
      rentedArea: 0,
      freeArea: 0,
      otherArea: 0,
    };
    const total = stats.totalArea || 0;
    const freePct = total > 0 ? (stats.freeArea / total) * 100 : 0;
    const rentedPct = total > 0 ? (stats.rentedArea / total) * 100 : 0;
    const otherPct = total > 0 ? (stats.otherArea / total) * 100 : 0;
    const status = stats.freeArea >= stats.rentedArea ? 'free' : 'occupied';
    return {
      id: bid,
      name: s.building_name,
      code: s.building_code,
      totalArea: stats.totalArea,
      rentedArea: stats.rentedArea,
      freeArea: stats.freeArea,
      otherArea: stats.otherArea,
      freePct,
      rentedPct,
      otherPct,
      floorsCount: floorsByBuilding[bid] || 0,
      fillColor: STATUS_COLORS[status] || STATUS_COLORS.free,
      shape: {
        id: s.id,
        shapeType: s.shape_type,
        pointsJson: parsePointsJson(s.points_json),
        zIndex: s.z_index,
        fillColor: s.fill_color,
        strokeColor: s.stroke_color,
      },
    };
  });

  return {
    plan: toPublicPropertyPlan(plan),
    buildings,
    propertyBuildings: propertyBuildings.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      hasShape: shapedBuildingIds.has(Number(b.id)),
    })),
  };
}

async function servePropertyPlanImage(req, res) {
  const planId = Number(req.params.propertyPlanId);
  const sig = req.query.sig;
  const v = Number(req.query.v) || 0;

  // Fast path: stable HMAC + memory cache — no DB round-trip for warm instances.
  if (sig && v && verifyHmacPlanSig('property_plan_img', planId, v, sig)) {
    const cached = planBlobCacheGet('pp', planId, v);
    if (cached) return sendPlanImage(res, cached.mime, cached.buf);
  }

  await ensurePropertyPlanTables();
  const plan = await db('property_plans')
    .where({ id: planId, is_active: true })
    .select('id', 'property_id', 'version', 'image_mime', 'image_path', 'image_blob')
    .first();
  if (!plan) return fail(res, 'План не найден', 404);

  if (sig) {
    const okHmac = verifyHmacPlanSig('property_plan_img', planId, plan.version, sig);
    if (!okHmac) {
      try {
        verifyPropertyPlanImageSig(sig, planId);
      } catch {
        return fail(res, 'Недействительная ссылка на изображение', 401);
      }
    }
  } else {
    try {
      const allowed = await verifyPropertyPlanImageBearer(req, plan);
      if (!allowed) return fail(res, 'Требуется авторизация', 401);
    } catch {
      return fail(res, 'Требуется авторизация', 401);
    }
  }

  if (plan.image_blob) {
    const mime = plan.image_mime || 'image/png';
    planBlobCacheSet('pp', planId, plan.version || 1, mime, plan.image_blob);
    return sendPlanImage(res, mime, plan.image_blob);
  }

  if (!plan.image_path) return fail(res, 'Изображение плана отсутствует', 404);
  const uploadRoot = path.isAbsolute(config.upload.dir)
    ? config.upload.dir
    : path.join(process.cwd(), config.upload.dir);
  const abs = path.join(uploadRoot, plan.image_path);
  if (!fs.existsSync(abs)) return fail(res, 'Файл плана не найден', 404);
  res.setHeader('Cache-Control', PLAN_IMAGE_CACHE_CONTROL);
  return res.sendFile(abs);
}

function planImageHref(plan) {
  if (!plan) return null;
  // Blob is stored in DB (Vercel-safe). Signed URL works in <img>/<svg> without Bearer header.
  if (plan.image_mime) return signPlanImageUrl(plan.id, plan.version);
  return planImageUrl(plan);
}

function toPublicPlan(plan) {
  if (!plan) return null;
  const meta = {};
  for (const key of PLAN_META_COLUMNS) {
    if (plan[key] !== undefined) meta[key] = plan[key];
  }
  return { ...meta, imageUrl: planImageHref(meta) };
}

function verifyPlanImageSig(sig, planId) {
  const payload = jwt.verify(String(sig), config.jwt.secret);
  if (payload.typ !== 'floor_plan_img' || Number(payload.planId) !== Number(planId)) {
    throw new Error('invalid sig');
  }
}

async function verifyPlanImageBearer(req, plan) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  const payload = jwt.verify(token, config.jwt.secret);
  const user = await db('users').where({ id: payload.userId, status: 'active' }).first();
  if (!user) return false;
  const floor = await db('floors').where({ id: plan.floor_id }).first();
  if (!floor) return false;
  const building = await db('buildings').where({ id: floor.building_id }).first();
  if (!building) return false;
  const property = await db('properties').where({ id: building.property_id }).first();
  if (!property || property.organization_id !== user.organization_id) return false;
  return true;
}

function hasMissingColumnError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === 'ER_BAD_FIELD_ERROR' || msg.includes('Unknown column');
}

function parsePointsJson(raw) {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function loadActiveLeasesByRoomIds(roomIds) {
  const ids = [...new Set((roomIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const asOf = require('dayjs')().format('YYYY-MM-DD');
  const rows = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .whereIn('cr.room_id', ids)
    .whereIn('c.status', ['active', 'expiring'])
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
    })
    .select(
      'cr.room_id',
      't.id as tenant_id',
      't.name as tenant_name',
      'c.id as contract_id',
      'c.status as contract_status'
    )
    .orderBy('cr.id', 'asc');
  const map = new Map();
  for (const row of rows) {
    const rid = Number(row.room_id);
    if (!map.has(rid)) map.set(rid, row);
  }
  return map;
}

function occupancyFromLease(roomStatus, lease) {
  if (!lease) return roomStatus;
  if (roomStatus === 'debt') return 'debt';
  if (['occupied', 'debt'].includes(roomStatus)) return roomStatus;
  return 'occupied';
}

async function getActivePlan(floorId) {
  return db('floor_plans')
    .where({ floor_id: floorId, is_active: true })
    .orderBy('version', 'desc')
    .select(PLAN_META_COLUMNS)
    .first();
}

async function buildPlanPayload(plan, floorId) {
  if (!plan) {
    return { plan: null, shapes: [], rooms: [], floorRooms: [] };
  }

  const [shapes, floorRooms] = await Promise.all([
    db('room_shapes as rs')
      .join('rooms as r', 'r.id', 'rs.room_id')
      .where({ 'rs.floor_plan_id': plan.id, 'rs.is_active': true })
      .whereNull('r.deleted_at')
      .select('rs.*', 'r.room_number', 'r.name as room_name', 'r.area', 'r.status', 'r.room_type'),
    db('rooms')
      .where({ floor_id: floorId })
      .whereNull('deleted_at')
      .orderBy('room_number')
      .select('id', 'room_number', 'name', 'area', 'status', 'room_type'),
  ]);

  const leaseByRoom = await loadActiveLeasesByRoomIds([
    ...shapes.map((s) => s.room_id),
    ...floorRooms.map((r) => r.id),
  ]);

  const rooms = shapes.map((s) => {
    const pointsJson = parsePointsJson(s.points_json);
    const lease = leaseByRoom.get(Number(s.room_id));
    const status = occupancyFromLease(s.status, lease);
    return {
      id: s.room_id,
      roomNumber: s.room_number,
      name: s.room_name,
      area: Number(s.area),
      status,
      roomType: s.room_type,
      tenantName: lease?.tenant_name || null,
      tenantId: lease?.tenant_id || null,
      fillColor: s.fill_color || STATUS_COLORS[status] || STATUS_COLORS.free,
      shape: {
        id: s.id,
        shapeType: s.shape_type,
        pointsJson,
        zIndex: s.z_index,
      },
    };
  });

  const shapedIds = new Set(rooms.map((r) => r.id));
  const floorRoomsMeta = floorRooms.map((r) => {
    const lease = leaseByRoom.get(Number(r.id));
    const status = occupancyFromLease(r.status, lease);
    return {
      id: r.id,
      roomNumber: r.room_number,
      name: r.name,
      area: Number(r.area),
      status,
      roomType: r.room_type,
      tenantName: lease?.tenant_name || null,
      tenantId: lease?.tenant_id || null,
      hasShape: shapedIds.has(r.id),
    };
  });

  return {
    plan: toPublicPlan(plan),
    shapes,
    rooms,
    floorRooms: floorRoomsMeta,
  };
}

async function serveFloorPlanImage(req, res) {
  const planId = Number(req.params.floorPlanId);
  const sig = req.query.sig;
  const v = Number(req.query.v) || 0;

  if (sig && v && verifyHmacPlanSig('floor_plan_img', planId, v, sig)) {
    const cached = planBlobCacheGet('fp', planId, v);
    if (cached) return sendPlanImage(res, cached.mime, cached.buf);
  }

  const plan = await db('floor_plans')
    .where({ id: planId, is_active: true })
    .select('id', 'floor_id', 'version', 'image_mime', 'image_path', 'image_blob')
    .first();
  if (!plan) return fail(res, 'План не найден', 404);

  if (sig) {
    const okHmac = verifyHmacPlanSig('floor_plan_img', planId, plan.version, sig);
    if (!okHmac) {
      try {
        verifyPlanImageSig(sig, planId);
      } catch {
        return fail(res, 'Недействительная ссылка на изображение', 401);
      }
    }
  } else {
    try {
      const allowed = await verifyPlanImageBearer(req, plan);
      if (!allowed) return fail(res, 'Требуется авторизация', 401);
    } catch {
      return fail(res, 'Требуется авторизация', 401);
    }
  }

  // Prefer DB blob (works on Vercel where uploads dir is ephemeral)
  if (plan.image_blob) {
    const mime = plan.image_mime || 'image/png';
    planBlobCacheSet('fp', planId, plan.version || 1, mime, plan.image_blob);
    return sendPlanImage(res, mime, plan.image_blob);
  }

  // Fallback to file on disk (self-hosted / dev)
  if (!plan.image_path) return fail(res, 'Изображение плана отсутствует', 404);
  const uploadRoot = path.isAbsolute(config.upload.dir)
    ? config.upload.dir
    : path.join(process.cwd(), config.upload.dir);
  const abs = path.join(uploadRoot, plan.image_path);
  if (!fs.existsSync(abs)) return fail(res, 'Файл плана не найден', 404);
  res.setHeader('Cache-Control', PLAN_IMAGE_CACHE_CONTROL);
  return res.sendFile(abs);
}

publicRouter.get('/floor-plans/:floorPlanId/image', asyncHandler(serveFloorPlanImage));
publicRouter.get('/property-plans/:propertyPlanId/image', asyncHandler(servePropertyPlanImage));

router.get(
  '/properties/:propertyId/plan',
  asyncHandler(async (req, res) => {
    const propertyId = Number(req.params.propertyId);
    const property = await db('properties').where({ id: propertyId }).first();
    if (!property) return fail(res, 'Объект не найден', 404);
    const plan = await getActivePropertyPlan(propertyId);
    ok(res, await buildPropertyPlanPayload(plan, propertyId));
  })
);

router.post(
  '/properties/:propertyId/plan',
  requireRoles(...MAP_EDIT_ROLES),
  propertyPlanUpload.single('image'),
  asyncHandler(async (req, res) => {
    await ensurePropertyPlanTables();
    const propertyId = Number(req.params.propertyId);
    const property = await db('properties').where({ id: propertyId }).first();
    if (!property) return fail(res, 'Объект не найден', 404);

    let width = Number(req.body.width) || 1200;
    let height = Number(req.body.height) || 800;

    if (req.file?.path) {
      const dim = readImageDimensions(req.file.path);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
    }

    const existing = await getActivePropertyPlan(propertyId);

    if (existing) {
      const upd = {
        width,
        height,
        updated_at: db.fn.now(),
      };
      if (req.file) {
        upd.image_path = path.join('property-plans', req.file.filename).replace(/\\/g, '/');
        upd.original_file_name = req.file.originalname;
        try {
          upd.image_mime = req.file.mimetype || null;
          upd.image_blob = fs.readFileSync(req.file.path);
        } catch {
          // ignore
        }
      } else {
        return fail(res, 'Загрузите изображение плана', 400);
      }
      try {
        await db('property_plans').where({ id: existing.id }).update(upd);
      } catch (err) {
        if (!hasMissingColumnError(err)) throw err;
        const fallbackUpd = { ...upd };
        delete fallbackUpd.image_blob;
        delete fallbackUpd.image_mime;
        await db('property_plans').where({ id: existing.id }).update(fallbackUpd);
      }
      const plan = await db('property_plans')
        .where({ id: existing.id })
        .select(PROPERTY_PLAN_META_COLUMNS)
        .first();
      return ok(res, toPublicPropertyPlan(plan));
    }

    const prevCount = await db('property_plans').where({ property_id: propertyId }).count('id as c').first();
    const version = Number(prevCount?.c || 0) + 1;
    const payload = {
      property_id: propertyId,
      width,
      height,
      version,
      is_active: true,
    };
    if (!req.file) return fail(res, 'Загрузите изображение плана', 400);
    payload.image_path = path.join('property-plans', req.file.filename).replace(/\\/g, '/');
    payload.original_file_name = req.file.originalname;
    try {
      payload.image_mime = req.file.mimetype || null;
      payload.image_blob = fs.readFileSync(req.file.path);
    } catch {
      // ignore
    }

    let id;
    try {
      [id] = await db('property_plans').insert(payload);
    } catch (err) {
      if (!hasMissingColumnError(err)) throw err;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.image_blob;
      delete fallbackPayload.image_mime;
      [id] = await db('property_plans').insert(fallbackPayload);
    }
    const plan = await db('property_plans').where({ id }).select(PROPERTY_PLAN_META_COLUMNS).first();
    ok(res, toPublicPropertyPlan(plan), 201);
  })
);

router.post(
  '/building-shapes',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    await ensurePropertyPlanTables();
    const { buildingId, propertyPlanId, shapeType, pointsJson, fillColor, strokeColor, zIndex } =
      req.body;
    if (!buildingId || !propertyPlanId || !pointsJson?.points?.length) {
      return fail(res, 'Укажите здание, план и контур', 400);
    }

    const building = await db('buildings').where({ id: buildingId }).first();
    const plan = await db('property_plans').where({ id: propertyPlanId, is_active: true }).first();
    if (!building || !plan) return fail(res, 'Здание или план не найдены', 404);
    if (Number(building.property_id) !== Number(plan.property_id)) {
      return fail(res, 'Здание не относится к этому объекту', 400);
    }

    await db('building_shapes')
      .where({ building_id: buildingId, is_active: true })
      .update({ is_active: false, updated_at: db.fn.now() });

    const maxZ = await db('building_shapes')
      .where({ property_plan_id: propertyPlanId, is_active: true })
      .max('z_index as z')
      .first();

    const [id] = await db('building_shapes').insert({
      building_id: buildingId,
      property_plan_id: propertyPlanId,
      shape_type: shapeType || 'polygon',
      points_json: JSON.stringify(pointsJson),
      fill_color: fillColor || null,
      stroke_color: strokeColor || null,
      z_index: zIndex ?? (Number(maxZ?.z) || 0) + 1,
      is_active: true,
    });

    ok(res, { id }, 201);
  })
);

router.put(
  '/building-shapes/:id',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    await ensurePropertyPlanTables();
    const shape = await db('building_shapes').where({ id: req.params.id, is_active: true }).first();
    if (!shape) return fail(res, 'Контур не найден', 404);

    const upd = { updated_at: db.fn.now() };
    if (req.body.pointsJson) upd.points_json = JSON.stringify(req.body.pointsJson);
    if (req.body.fillColor != null) upd.fill_color = req.body.fillColor;
    if (req.body.strokeColor != null) upd.stroke_color = req.body.strokeColor;
    if (req.body.zIndex != null) upd.z_index = req.body.zIndex;
    if (req.body.shapeType) upd.shape_type = req.body.shapeType;

    await db('building_shapes').where({ id: req.params.id }).update(upd);
    ok(res, { id: Number(req.params.id) });
  })
);

router.delete(
  '/building-shapes/:id',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    await ensurePropertyPlanTables();
    await db('building_shapes').where({ id: req.params.id }).update({
      is_active: false,
      updated_at: db.fn.now(),
    });
    ok(res, { deleted: true });
  })
);

router.get(
  '/floors/:floorId/plan',
  asyncHandler(async (req, res) => {
    const plan = await getActivePlan(req.params.floorId);
    ok(res, await buildPlanPayload(plan, req.params.floorId));
  })
);

router.post(
  '/floors/:floorId/plan',
  requireRoles(...MAP_EDIT_ROLES),
  floorPlanUpload.single('image'),
  asyncHandler(async (req, res) => {
    const floorId = Number(req.params.floorId);
    const floor = await db('floors').where({ id: floorId }).first();
    if (!floor) return fail(res, 'Этаж не найден', 404);

    let width = Number(req.body.width) || 1200;
    let height = Number(req.body.height) || 800;

    if (req.file?.path) {
      const dim = readImageDimensions(req.file.path);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
    }

    const existing = await getActivePlan(floorId);

    if (existing) {
      const upd = {
        width,
        height,
        updated_at: db.fn.now(),
      };
      if (req.file) {
        upd.image_path = path.join('floor-plans', req.file.filename).replace(/\\/g, '/');
        upd.original_file_name = req.file.originalname;
        try {
          upd.image_mime = req.file.mimetype || null;
          upd.image_blob = fs.readFileSync(req.file.path);
        } catch {
          // ignore: we'll still have image_path for self-hosted environments
        }
      } else if (!req.body.keepPlan) {
        return fail(res, 'Загрузите изображение плана', 400);
      }
      try {
        await db('floor_plans').where({ id: existing.id }).update(upd);
      } catch (err) {
        if (!hasMissingColumnError(err)) throw err;
        // DB migration may lag behind deployment: retry without blob columns.
        const fallbackUpd = { ...upd };
        delete fallbackUpd.image_blob;
        delete fallbackUpd.image_mime;
        await db('floor_plans').where({ id: existing.id }).update(fallbackUpd);
      }
      const plan = await db('floor_plans').where({ id: existing.id }).select(PLAN_META_COLUMNS).first();
      return ok(res, toPublicPlan(plan));
    }

    const prevCount = await db('floor_plans').where({ floor_id: floorId }).count('id as c').first();
    const version = Number(prevCount?.c || 0) + 1;

    const payload = {
      floor_id: floorId,
      width,
      height,
      version,
      is_active: true,
    };

    if (req.file) {
      payload.image_path = path.join('floor-plans', req.file.filename).replace(/\\/g, '/');
      payload.original_file_name = req.file.originalname;
      try {
        payload.image_mime = req.file.mimetype || null;
        payload.image_blob = fs.readFileSync(req.file.path);
      } catch {
        // ignore
      }
    } else {
      return fail(res, 'Загрузите изображение плана', 400);
    }

    let id;
    try {
      [id] = await db('floor_plans').insert(payload);
    } catch (err) {
      if (!hasMissingColumnError(err)) throw err;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.image_blob;
      delete fallbackPayload.image_mime;
      [id] = await db('floor_plans').insert(fallbackPayload);
    }
    const plan = await db('floor_plans').where({ id }).select(PLAN_META_COLUMNS).first();
    ok(res, toPublicPlan(plan), 201);
  })
);

router.patch(
  '/floors/:floorId/plan',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const plan = await getActivePlan(req.params.floorId);
    if (!plan) return fail(res, 'Активный план не найден', 404);

    const upd = { updated_at: db.fn.now() };
    if (req.body.width != null) upd.width = Number(req.body.width);
    if (req.body.height != null) upd.height = Number(req.body.height);

    await db('floor_plans').where({ id: plan.id }).update(upd);
    const updated = await db('floor_plans').where({ id: plan.id }).select(PLAN_META_COLUMNS).first();
    ok(res, toPublicPlan(updated));
  })
);

router.get(
  '/floor-plans/:floorPlanId/shapes',
  asyncHandler(async (req, res) => {
    const shapes = await db('room_shapes').where({
      floor_plan_id: req.params.floorPlanId,
      is_active: true,
    });
    ok(res, shapes);
  })
);

router.post(
  '/room-shapes',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const { roomId, floorPlanId, shapeType, pointsJson, fillColor, strokeColor, zIndex } = req.body;
    if (!roomId || !floorPlanId || !pointsJson?.points?.length) {
      return fail(res, 'Укажите помещение, план и контур', 400);
    }

    const room = await db('rooms').where({ id: roomId }).whereNull('deleted_at').first();
    const plan = await db('floor_plans').where({ id: floorPlanId, is_active: true }).first();
    if (!room || !plan) return fail(res, 'Помещение или план не найдены', 404);
    if (room.floor_id !== plan.floor_id) {
      return fail(res, 'Помещение не относится к этому этажу', 400);
    }

    await db('room_shapes')
      .where({ room_id: roomId, is_active: true })
      .update({ is_active: false, updated_at: db.fn.now() });

    const maxZ = await db('room_shapes')
      .where({ floor_plan_id: floorPlanId, is_active: true })
      .max('z_index as z')
      .first();

    const [id] = await db('room_shapes').insert({
      room_id: roomId,
      floor_plan_id: floorPlanId,
      shape_type: shapeType || 'polygon',
      points_json: JSON.stringify(pointsJson),
      fill_color: fillColor,
      stroke_color: strokeColor,
      z_index: zIndex ?? (Number(maxZ?.z) || 0) + 1,
      is_active: true,
    });

    ok(res, { id }, 201);
  })
);

router.put(
  '/room-shapes/:id',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const shape = await db('room_shapes').where({ id: req.params.id, is_active: true }).first();
    if (!shape) return fail(res, 'Контур не найден', 404);

    const upd = { updated_at: db.fn.now() };
    if (req.body.pointsJson) upd.points_json = JSON.stringify(req.body.pointsJson);
    if (req.body.fillColor != null) upd.fill_color = req.body.fillColor;
    if (req.body.strokeColor != null) upd.stroke_color = req.body.strokeColor;
    if (req.body.zIndex != null) upd.z_index = req.body.zIndex;
    if (req.body.shapeType) upd.shape_type = req.body.shapeType;

    await db('room_shapes').where({ id: req.params.id }).update(upd);
    ok(res, { id: req.params.id });
  })
);

router.delete(
  '/room-shapes/:id',
  requireRoles(...MAP_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    await db('room_shapes').where({ id: req.params.id }).update({
      is_active: false,
      updated_at: db.fn.now(),
    });
    ok(res, { deleted: true });
  })
);

module.exports = router;
module.exports.publicRouter = publicRouter;
