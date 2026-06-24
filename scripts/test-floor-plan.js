/**
 * Floor plan upload + signed image URL smoke tests.
 * Requires running API server (default http://localhost:3000).
 */
const BASE = process.env.APP_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'director@rentspace.by';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'demo1234';

const MIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function login() {
  const { status, body } = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert(status === 200 && body?.data?.token, `login failed (${status})`);
  return body.data.token;
}

async function pickFloorId(token) {
  const h = { Authorization: `Bearer ${token}` };
  const props = await request('/api/properties', { headers: h });
  assert(props.status === 200 && props.body.data?.length, 'no properties');
  const propertyId = props.body.data[0].id;

  const buildings = await request(`/api/properties/${propertyId}/buildings`, { headers: h });
  assert(buildings.status === 200 && buildings.body.data?.length, 'no buildings');
  const buildingId = buildings.body.data[0].id;

  const floors = await request(`/api/buildings/${buildingId}/floors`, { headers: h });
  assert(floors.status === 200 && floors.body.data?.length, 'no floors');
  return floors.body.data[0].id;
}

async function uploadPlan(token, floorId, fileName = 'test-floor-plan.png') {
  const fd = new FormData();
  fd.append('image', new Blob([MIN_PNG], { type: 'image/png' }), fileName);
  fd.append('width', '10');
  fd.append('height', '10');
  const res = await request(`/api/floors/${floorId}/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  assert(res.status === 200 || res.status === 201, `upload failed (${res.status}): ${JSON.stringify(res.body)}`);
  assert(res.body?.data?.imageUrl, 'upload response missing imageUrl');
  assert(res.body?.data?.image_mime === 'image/png', 'upload response missing image_mime');
  return res.body.data;
}

async function fetchPlan(token, floorId) {
  const res = await request(`/api/floors/${floorId}/plan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(res.status === 200, `plan fetch failed (${res.status})`);
  return res.body.data;
}

async function fetchImage(url, headers = {}) {
  const res = await fetch(`${BASE}${url}`, { headers });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    size: buf.length,
    buf,
  };
}

async function run() {
  const results = [];

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

  let token;
  let floorId;
  let savedPlan;

  await test('login', async () => {
    token = await login();
  });

  await test('resolve floor id', async () => {
    assert(token, 'no token');
    floorId = await pickFloorId(token);
  });

  await test('POST /api/floors/:id/plan — upload image', async () => {
    savedPlan = await uploadPlan(token, floorId);
    assert(savedPlan.id, 'plan id missing');
  });

  await test('GET /api/floors/:id/plan — imageUrl persisted', async () => {
    const data = await fetchPlan(token, floorId);
    assert(data.plan?.imageUrl, 'plan.imageUrl missing after save');
    assert(data.plan?.image_mime === 'image/png', 'plan.image_mime missing after save');
    assert(String(data.plan.imageUrl).includes('/api/floor-plans/'), 'expected signed api image url');
    assert(String(data.plan.imageUrl).includes('sig='), 'expected sig query param');
    savedPlan = data.plan;
  });

  await test('GET signed image URL without Authorization', async () => {
    assert(savedPlan?.imageUrl, 'no imageUrl');
    const img = await fetchImage(savedPlan.imageUrl);
    assert(img.status === 200, `signed image status ${img.status}`);
    assert(String(img.contentType).startsWith('image/'), `unexpected content-type ${img.contentType}`);
    assert(img.size > 50, `image too small (${img.size} bytes)`);
  });

  await test('GET /api/floor-plans/:id/image with Bearer token', async () => {
    const planId = savedPlan.id;
    const img = await fetchImage(`/api/floor-plans/${planId}/image`, {
      Authorization: `Bearer ${token}`,
    });
    assert(img.status === 200, `bearer image status ${img.status}`);
    assert(img.size > 50, `image too small (${img.size} bytes)`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
