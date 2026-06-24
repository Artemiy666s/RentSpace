/**
 * Интеграционные smoke-тесты API (требует запущенный сервер на PORT)
 */
const BASE = process.env.APP_URL || 'http://localhost:3000';
const TEST_USERS = [
  { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD },
  { email: 'manager@rentspace.by', password: 'demo1234' },
  { email: 'director@rentspace.by', password: 'demo1234' },
  { email: 'accountant@rentspace.by', password: 'demo1234' },
  { email: 'admin@rentspace.by', password: 'demo1234' },
].filter((u) => u.email && u.password);

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const results = [];
  let token = null;
  let userRole = null;

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
      console.error(`✗ ${name}: ${e.message}`);
    }
  }

  await test('GET /api/health — db connected', async () => {
    const { status, body } = await request('/api/health');
    assert(status === 200, `status ${status}`);
    assert(body.status === 'ok', 'status not ok');
    assert(body.db === 'connected', `db is ${body.db}`);
  });

  await test('POST /api/auth/login — smoke user', async () => {
    let lastError = 'no users configured';
    for (const credentials of TEST_USERS) {
      const { status, body } = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      if (status === 200 && body?.success && body?.data?.token) {
        token = body.data.token;
        userRole = body?.data?.user?.role || null;
        return;
      }
      lastError = `status ${status} for ${credentials.email}`;
    }
    throw new Error(lastError);
  });

  await test('GET /api/auth/me', async () => {
    assert(token, 'no auth token');
    const { status, body } = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(status === 200, `status ${status}`);
    assert(body?.data?.user?.role != null, 'no user role');
  });

  await test('GET /api/properties', async () => {
    assert(token, 'no auth token');
    const { status, body } = await request('/api/properties', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(status === 200, `status ${status}`);
    assert(body.data.length >= 1, 'no properties');
    global.propertyId = body.data[0].id;
  });

  await test('GET /api/rooms', async () => {
    assert(token, 'no auth token');
    const { status, body } = await request(`/api/rooms?propertyId=${global.propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(status === 200, `status ${status}`);
    assert(Array.isArray(body.data), 'not array');
  });

  await test('GET /api/dashboard/director', async () => {
    assert(token, 'no auth token');
    const { status, body } = await request(`/api/dashboard/director?propertyId=${global.propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (status === 403) {
      console.log(`  note: dashboard/director denied for role "${userRole}"`);
      return;
    }
    assert(status === 200, `status ${status}`);
    assert(body?.data?.kpis != null, 'no kpis');
  });

  await test('GET /api/manager/rent-register', async () => {
    assert(token, 'no auth token');
    const year = new Date().getFullYear();
    const { status, body } = await request(
      `/api/manager/rent-register?propertyId=${global.propertyId}&year=${year}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert(status === 200, `status ${status}`);
    assert(Array.isArray(body?.data?.rows), 'rows not array');
    if (body.data.rows.length > 0) {
      const row = body.data.rows[0];
      assert(row.tenantName != null, 'missing tenantName');
      assert(row.months != null, 'missing months map');
    }
  });

  await test('GET / — frontend index', async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, `status ${res.status}`);
    const html = await res.text();
    assert(html.includes('root') || html.includes('RentSpace'), 'no html');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
