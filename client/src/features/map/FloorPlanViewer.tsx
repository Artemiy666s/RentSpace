import { useEffect, useMemo, useState } from 'react';

import { Maximize2, Minus, Plus } from 'lucide-react';

import { useI18n } from '@/i18n/useI18n';

import { SvgRoomShape, type ShapePoints } from './SvgRoomShape';

import styles from './FloorPlanViewer.module.css';



export interface MapRoom {

  id: number;

  roomNumber: string;

  name?: string;

  area: number;

  status: string;

  fillColor?: string;

  shape: {

    id: number;

    shapeType: string;

    pointsJson: ShapePoints;

    zIndex: number;

  };

}



interface Props {

  rooms: MapRoom[];

  planWidth?: number;

  planHeight?: number;

  imageUrl?: string | null;

  selectedRoomId?: number | null;

  statusFilter?: string | null;

  search?: string;

  onSelectRoom: (room: MapRoom) => void;

}



export function FloorPlanViewer({

  rooms,

  planWidth = 1600,

  planHeight = 900,

  imageUrl,

  selectedRoomId,

  statusFilter,

  search,

  onSelectRoom,

}: Props) {

  const { t } = useI18n();

  const [scale, setScale] = useState(1);

  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const viewBox = { w: planWidth, h: planHeight };



  const filtered = useMemo(() => {

    const q = search?.toLowerCase().trim();

    return rooms.filter((r) => {

      if (statusFilter && r.status !== statusFilter) return false;

      if (q && !r.roomNumber.toLowerCase().includes(q) && !(r.name || '').toLowerCase().includes(q)) {

        return false;

      }

      return true;

    });

  }, [rooms, statusFilter, search]);



  const hasFilter = Boolean(statusFilter || search);



  const fitToScreen = () => {

    setScale(1);

    setPan({ x: 0, y: 0 });

  };



  return (

    <div className={styles.wrap}>

      <div className={styles.zoom}>

        <button type="button" title={t('common.zoomIn')} onClick={() => setScale((s) => Math.min(2.5, s + 0.12))}>

          <Plus size={18} />

        </button>

        <button type="button" title={t('common.zoomOut')} onClick={() => setScale((s) => Math.max(0.35, s - 0.12))}>

          <Minus size={18} />

        </button>

        <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>

        <button type="button" title={t('common.fitScreen')} onClick={fitToScreen}>

          <Maximize2 size={18} />

        </button>

      </div>

      <div

        className={styles.viewport}

        onMouseDown={(e) => {

          if ((e.target as HTMLElement).closest('.room-shape')) return;

          setDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y });

        }}

        onMouseMove={(e) => {

          if (drag) setPan({ x: e.clientX - drag.x, y: e.clientY - drag.y });

        }}

        onMouseUp={() => setDrag(null)}

        onMouseLeave={() => setDrag(null)}

      >

        <div

          className={styles.canvas}

          style={{

            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,

            transformOrigin: 'top left',

          }}

        >

          <svg

            viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}

            className={styles.svg}

            preserveAspectRatio="xMidYMid meet"

          >

            <rect x={0} y={0} width={viewBox.w} height={viewBox.h} fill="#F8FAFC" />

            {imageUrl && (

              <image

                href={imageUrl}

                x={0}

                y={0}

                width={viewBox.w}

                height={viewBox.h}

                opacity={1}

                preserveAspectRatio="none"

              />

            )}

            {[...filtered]

              .sort((a, b) => a.shape.zIndex - b.shape.zIndex)

              .map((room) => {

                const pointsJson = room.shape.pointsJson;

                return (

                  <SvgRoomShape

                    key={room.id}

                    roomId={room.id}

                    roomNumber={room.roomNumber}

                    area={room.area}

                    status={room.status}

                    shapeType={room.shape.shapeType}

                    pointsJson={pointsJson}

                    selected={selectedRoomId === room.id}

                    dimmed={hasFilter && selectedRoomId !== room.id}

                    onClick={() => onSelectRoom(room)}

                  />

                );

              })}

          </svg>

        </div>

      </div>

    </div>

  );

}

