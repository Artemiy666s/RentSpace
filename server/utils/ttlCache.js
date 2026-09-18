/**
 * Короткий in-memory TTL-кэш для тёплых инстансов Vercel.
 * Между страницами (дашборд → реестр) одни и те же данные не перечитываются из БД.
 */

const store = new Map();

function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs = 45_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function cacheDelPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

async function cacheWrap(key, ttlMs, loader) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  return cacheSet(key, value, ttlMs);
}

module.exports = { cacheGet, cacheSet, cacheDelPrefix, cacheWrap };
