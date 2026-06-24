const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { floorPlanUpload } = require('../middlewares/upload');
const { STATUS_COLORS } = require('../utils/roomStatus');
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

router.use(authenticate, requireOrgAccess());

function planImageUrl(plan) {
  if (!plan?.image_path) return null;
  return `/uploads/${plan.image_path.replace(/^server\/uploads\/?/, '')}`;
}

function signPlanImageUrl(planId) {
  const sig = jwt.sign(
    { typ: 'floor_plan_img', planId: Number(planId) },
    config.jwt.secret,
    { expiresIn: '90d' }
  );
  return `/api/floor-plans/${planId}/image?sig=${encodeURIComponent(sig)}`;
}

function planImageHref(plan) {
  if (!plan) return null;
  // Blob is stored in DB (Vercel-safe). Signed URL works in <img>/<svg> without Bearer header.
  if (plan.image_mime) return signPlanImageUrl(plan.id);
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

  const shapes = await db('room_shapes as rs')
    .join('rooms as r', 'r.id', 'rs.room_id')
    .where({ 'rs.floor_plan_id': plan.id, 'rs.is_active': true })
    .whereNull('r.deleted_at')
    .select('rs.*', 'r.room_number', 'r.name as room_name', 'r.area', 'r.status', 'r.room_type');

  const rooms = shapes.map((s) => {
    const pointsJson = parsePointsJson(s.points_json);
    return {
      id: s.room_id,
      roomNumber: s.room_number,
      name: s.room_name,
      area: Number(s.area),
      status: s.status,
      roomType: s.room_type,
      fillColor: s.fill_color || STATUS_COLORS[s.status] || STATUS_COLORS.free,
      shape: {
        id: s.id,
        shapeType: s.shape_type,
        pointsJson,
        zIndex: s.z_index,
      },
    };
  });

  const shapedIds = new Set(rooms.map((r) => r.id));
  const floorRooms = await db('rooms')
    .where({ floor_id: floorId })
    .whereNull('deleted_at')
    .orderBy('room_number')
    .select('id', 'room_number', 'name', 'area', 'status', 'room_type');

  const floorRoomsMeta = floorRooms.map((r) => ({
    id: r.id,
    roomNumber: r.room_number,
    name: r.name,
    area: Number(r.area),
    status: r.status,
    roomType: r.room_type,
    hasShape: shapedIds.has(r.id),
  }));

  return {
    plan: toPublicPlan(plan),
    shapes,
    rooms,
    floorRooms: floorRoomsMeta,
  };
}

async function serveFloorPlanImage(req, res) {
  const planId = Number(req.params.floorPlanId);
  const plan = await db('floor_plans').where({ id: planId, is_active: true }).first();
  if (!plan) return fail(res, 'План не найден', 404);

  const sig = req.query.sig;
  if (sig) {
    try {
      verifyPlanImageSig(sig, planId);
    } catch {
      return fail(res, 'Недействительная ссылка на изображение', 401);
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
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(plan.image_blob);
  }

  // Fallback to file on disk (self-hosted / dev)
  if (!plan.image_path) return fail(res, 'Изображение плана отсутствует', 404);
  const uploadRoot = path.isAbsolute(config.upload.dir)
    ? config.upload.dir
    : path.join(process.cwd(), config.upload.dir);
  const abs = path.join(uploadRoot, plan.image_path);
  if (!fs.existsSync(abs)) return fail(res, 'Файл плана не найден', 404);
  return res.sendFile(abs);
}

publicRouter.get('/floor-plans/:floorPlanId/image', asyncHandler(serveFloorPlanImage));

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
