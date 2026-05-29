import { getRoomStatusLabels } from '@/i18n/roomStatus';



/** @deprecated Use getRoomStatusLabels(locale) or useRoomStatusLabels hook */

export const ROOM_STATUS_LABELS: Record<string, string> = getRoomStatusLabels('ru');



export const ROOM_STATUS_STYLE: Record<string, { fill: string; stroke: string }> = {

  free: { fill: '#E8EDF3', stroke: '#8B9CB3' },

  ready_for_rent: { fill: '#B8E8C8', stroke: '#5BAF7A' },

  occupied: { fill: '#8FD4A8', stroke: '#3D8F5C' },

  negotiation: { fill: '#FFE08A', stroke: '#C9A227' },

  reserved: { fill: '#B8D9F5', stroke: '#5B8FC9' },

  debt: { fill: '#F5A0A0', stroke: '#C94C4C' },

  repair: { fill: '#E5E7EB', stroke: '#9CA3AF' },

  technical: { fill: '#EDF0F4', stroke: '#B0BAC8' },

  not_available: { fill: '#C5CBD3', stroke: '#6B7280' },

};



export const ROOM_STATUS_COLORS: Record<string, string> = Object.fromEntries(

  Object.entries(ROOM_STATUS_STYLE).map(([k, v]) => [k, v.fill])

);



export const ROOM_STATUS_ORDER = [

  'free',

  'ready_for_rent',

  'occupied',

  'negotiation',

  'reserved',

  'debt',

  'repair',

  'technical',

  'not_available',

];


