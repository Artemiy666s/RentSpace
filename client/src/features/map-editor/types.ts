export type EditorStep = 'location' | 'plan' | 'draw';

export type EditorTool = 'select' | 'polygon' | 'rect' | 'pan';

export interface FloorRoomMeta {
  id: number;
  roomNumber: string;
  name?: string | null;
  area: number;
  status: string;
  roomType: string;
  hasShape: boolean;
}

export interface EditorMapRoom {
  id: number;
  roomNumber: string;
  name?: string;
  area: number;
  status: string;
  roomType?: string;
  shape: {
    id: number;
    shapeType: string;
    pointsJson: { type: string; points: [number, number][] };
    zIndex: number;
  };
}

export interface FloorPlanData {
  plan: {
    id: number;
    width: number;
    height: number;
    imageUrl: string | null;
    image_path?: string;
  } | null;
  rooms: EditorMapRoom[];
  floorRooms: FloorRoomMeta[];
}

export interface RoomDraft {
  roomNumber: string;
  name: string;
  area: string;
  roomType: string;
  status: string;
  /** Существующее помещение без контура */
  existingRoomId: number | null;
}

export type ShapePoints = { type: string; points: [number, number][] };
