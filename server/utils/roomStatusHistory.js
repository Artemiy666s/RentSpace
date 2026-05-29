const { db } = require('../db');

async function recordRoomStatusChange({
  roomId,
  oldStatus,
  newStatus,
  reason,
  comment,
  userId,
}) {
  await db('room_status_history').insert({
    room_id: roomId,
    old_status: oldStatus,
    new_status: newStatus,
    reason: reason || null,
    comment: comment || null,
    changed_by: userId,
  });
}

module.exports = { recordRoomStatusChange };
