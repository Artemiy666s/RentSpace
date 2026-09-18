/** Допустимые значения tenants.legal_type в БД */
const DB_LEGAL_TYPES = new Set(['ip', 'ooo', 'chp', 'zao', 'oao', 'physical', 'other']);

/** Значения с фронта → БД */
const UI_TO_DB = {
  individual: 'physical',
  llc: 'ooo',
  pe: 'chp',
  ip: 'ip',
  ooo: 'ooo',
  chp: 'chp',
  zao: 'zao',
  oao: 'oao',
  physical: 'physical',
  other: 'other',
};

/** БД → значения, которые понимает форма на фронте */
const DB_TO_UI = {
  physical: 'individual',
  ooo: 'ooo',
  chp: 'chp',
  ip: 'ip',
  zao: 'zao',
  oao: 'oao',
  other: 'other',
};

function normalizeLegalTypeForDb(value) {
  if (value == null || value === '') return 'other';
  const key = String(value).trim().toLowerCase();
  const mapped = UI_TO_DB[key] || key;
  return DB_LEGAL_TYPES.has(mapped) ? mapped : 'other';
}

function legalTypeForUi(value) {
  if (value == null || value === '') return 'other';
  const key = String(value).trim().toLowerCase();
  return DB_TO_UI[key] || key;
}

module.exports = {
  DB_LEGAL_TYPES,
  normalizeLegalTypeForDb,
  legalTypeForUi,
};
