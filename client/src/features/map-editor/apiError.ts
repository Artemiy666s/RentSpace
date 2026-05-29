import axios from 'axios';

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error;
    if (typeof msg === 'string' && msg.trim()) return msg;
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Нормализация типа помещения под enum БД */
export function normalizeRoomType(roomType: string): string {
  if (roomType === 'storage') return 'warehouse';
  return roomType;
}
