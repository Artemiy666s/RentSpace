const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const config = require('../config');
const { db } = require('../db');
const { authenticate } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Неверные данные' });
    }

    const { email, password } = parsed.data;
    const user = await db('users').where({ email, status: 'active' }).first();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'Неверный email или пароль' });
    }

    await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });

    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organization_id,
        },
      },
    });
  })
);

router.post('/logout', authenticate, (_req, res) => {
  res.json({ success: true, message: 'Выход выполнен' });
});

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { user: req.user } });
  })
);

const profileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const emailSchema = z.object({
  email: z.string().email().max(255),
  currentPassword: z.string().min(1),
});

function formatAuthUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
  };
}

router.patch(
  '/me/email',
  authenticate,
  asyncHandler(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid_email' });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const { currentPassword } = parsed.data;

    const user = await db('users').where({ id: req.user.id, status: 'active' }).first();
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ success: false, error: 'wrong_current_password' });
    }

    if (user.email.toLowerCase() === email) {
      return res.status(400).json({ success: false, error: 'email_unchanged' });
    }

    const taken = await db('users')
      .whereRaw('LOWER(email) = ?', [email])
      .whereNot({ id: user.id })
      .first();
    if (taken) {
      return res.status(400).json({ success: false, error: 'email_taken' });
    }

    await db('users').where({ id: user.id }).update({
      email,
      updated_at: db.fn.now(),
    });

    const updated = await db('users').where({ id: user.id }).first();
    res.json({
      success: true,
      message: 'email_changed',
      data: { user: formatAuthUser(updated) },
    });
  })
);

router.patch(
  '/me/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid_password' });
    }

    const { currentPassword, newPassword } = parsed.data;

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, error: 'password_unchanged' });
    }

    const user = await db('users').where({ id: req.user.id, status: 'active' }).first();
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ success: false, error: 'wrong_current_password' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({
      password_hash,
      updated_at: db.fn.now(),
    });

    res.json({ success: true, message: 'password_changed' });
  })
);

router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Некорректные данные профиля' });
    }
    const upd = { updated_at: db.fn.now() };
    if (parsed.data.name) upd.name = parsed.data.name.trim();

    await db('users').where({ id: req.user.id }).update(upd);
    const user = await db('users').where({ id: req.user.id }).first();

    res.json({
      success: true,
      data: { user: formatAuthUser(user) },
    });
  })
);

module.exports = router;
