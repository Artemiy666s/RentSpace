const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Требуется авторизация' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await db('users')
      .where({ id: payload.userId, status: 'active' })
      .first();

    if (!user) {
      return res.status(401).json({ success: false, error: 'Пользователь не найден' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization_id,
    };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Недействительный токен' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Требуется авторизация' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }
    next();
  };
}

module.exports = { authenticate, requireRoles };
