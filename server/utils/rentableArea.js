/**
 * Торговая / сдаваемая площадь: без технических и «не сдаётся».
 * Статус/тип важнее поля rentable_area (у техпомещений оно часто = area).
 */

const NON_RENTABLE_STATUSES = new Set(['technical', 'not_available']);
const NON_RENTABLE_TYPES = new Set(['technical', 'service']);

function roomRentableArea(room) {
  if (!room) return 0;
  if (NON_RENTABLE_STATUSES.has(room.status)) return 0;
  if (NON_RENTABLE_TYPES.has(room.room_type)) return 0;
  if (room.rentable_area != null && room.rentable_area !== '') {
    return Math.max(0, Number(room.rentable_area) || 0);
  }
  return Math.max(0, Number(room.area) || 0);
}

function isOccupiedForArea(status) {
  return status === 'occupied' || status === 'debt';
}

function sumRentableArea(rooms, predicate) {
  return (rooms || []).reduce((sum, room) => {
    if (predicate && !predicate(room)) return sum;
    return sum + roomRentableArea(room);
  }, 0);
}

module.exports = {
  NON_RENTABLE_STATUSES,
  NON_RENTABLE_TYPES,
  roomRentableArea,
  isOccupiedForArea,
  sumRentableArea,
};
