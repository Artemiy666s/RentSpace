/** i18n keys under common.* for rooms.room_type */
export const ROOM_TYPE_I18N: Record<string, string> = {
  retail: 'common.roomTypeRetail',
  office: 'common.roomTypeOffice',
  warehouse: 'common.roomTypeWarehouse',
  food: 'common.roomTypeFood',
  service: 'common.roomTypeService',
  island: 'common.roomTypeRetail',
  technical: 'common.roomTypeService',
  other: 'common.other',
  storage: 'common.roomTypeStorage',
};

export function getRoomTypeLabel(
  t: (key: string) => string,
  roomType?: string | null
): string {
  if (!roomType) return t('common.dash');
  const key = ROOM_TYPE_I18N[roomType];
  return key ? t(key) : roomType;
}
