const { db } = require('../db');

const INDEX_SQL = [
  'CREATE INDEX idx_rent_charges_property_period ON rent_charges (property_id, period_year, period_month)',
  'CREATE INDEX idx_rent_charges_contract_year ON rent_charges (contract_id, period_year)',
  'CREATE INDEX idx_rent_charges_room_period ON rent_charges (room_id, period_year, period_month)',
  'CREATE INDEX idx_payments_property_period_type ON payments (property_id, period_year, payment_type)',
  'CREATE INDEX idx_payments_tenant_period ON payments (tenant_id, period_year, period_month)',
  'CREATE INDEX idx_payments_contract_year ON payments (contract_id, period_year)',
  'CREATE INDEX idx_utility_charges_property_period ON utility_charges (property_id, period_year, period_month)',
  'CREATE INDEX idx_utility_charges_contract_year ON utility_charges (contract_id, period_year)',
  'CREATE INDEX idx_utility_charges_room_period ON utility_charges (room_id, period_year, period_month)',
  'CREATE INDEX idx_rooms_property_deleted ON rooms (property_id, deleted_at)',
  'CREATE INDEX idx_rooms_floor_deleted ON rooms (floor_id, deleted_at)',
  'CREATE INDEX idx_rooms_status ON rooms (status)',
  'CREATE INDEX idx_contracts_property_status ON contracts (property_id, status)',
  'CREATE INDEX idx_contracts_tenant_status ON contracts (tenant_id, status)',
  'CREATE INDEX idx_contract_rooms_room ON contract_rooms (room_id)',
  'CREATE INDEX idx_contract_rooms_contract ON contract_rooms (contract_id)',
  'CREATE INDEX idx_expenses_property_year ON expenses (property_id, period_year)',
  'CREATE INDEX idx_activity_events_property_created ON activity_events (property_id, created_at)',
  'CREATE INDEX idx_room_shapes_plan_active ON room_shapes (floor_plan_id, is_active)',
  'CREATE INDEX idx_floor_plans_floor_active ON floor_plans (floor_id, is_active)',
];

let started = false;

/** Идемпотентно создаёт индексы производительности (ошибку «уже есть» игнорируем). */
async function ensurePerfIndexes() {
  if (started) return;
  started = true;
  for (const sql of INDEX_SQL) {
    try {
      await db.raw(sql);
    } catch {
      // duplicate / unsupported — ок
    }
  }
}

module.exports = { ensurePerfIndexes };
