import { ROOM_STATUS_STYLE } from '@/constants/roomStatus';
import styles from './SvgRoomShape.module.css';

export interface ShapePoints {
  type: string;
  points: [number, number][];
  pathD?: string;
}

interface Props {
  roomId: number;
  roomNumber: string;
  area?: number;
  status: string;
  shapeType?: string;
  pointsJson: ShapePoints;
  selected?: boolean;
  dimmed?: boolean;
  onClick: () => void;
}

function shapeCenter(points: [number, number][]) {
  if (!points.length) return { cx: 0, cy: 0 };
  return {
    cx: points.reduce((s, p) => s + p[0], 0) / points.length,
    cy: points.reduce((s, p) => s + p[1], 0) / points.length,
  };
}

function formatArea(area: number) {
  return `${area.toFixed(1).replace('.', ',')} м²`;
}

export function SvgRoomShape({
  roomId,
  roomNumber,
  area,
  status,
  shapeType,
  pointsJson,
  selected,
  dimmed,
  onClick,
}: Props) {
  const style = ROOM_STATUS_STYLE[status] || ROOM_STATUS_STYLE.free;
  const { cx, cy } = shapeCenter(pointsJson.points);
  const isRepair = status === 'repair';
  const isTechnical = status === 'technical';
  const points = pointsJson.points.map((p) => p.join(',')).join(' ');
  const isPath = shapeType === 'path' && pointsJson.pathD;
  const stroke = selected ? '#1267E8' : style.stroke;
  const strokeWidth = selected ? 2.5 : 1.2;
  const fill = isRepair ? `url(#hatch-${roomId})` : style.fill;

  const fillOpacity = isTechnical ? 0.35 : dimmed ? 0.4 : 0.72;
  const shapeProps = {
    fill,
    stroke,
    strokeWidth,
    fillOpacity,
    strokeOpacity: dimmed ? 0.4 : 1,
    className: styles.shape,
  };

  return (
    <g
      className={`${styles.group} room-shape ${selected ? styles.selected : ''} ${dimmed ? styles.dimmed : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-room-id={roomId}
    >
      {isRepair && (
        <defs>
          <pattern
            id={`hatch-${roomId}`}
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#9CA3AF" strokeWidth="1.5" />
          </pattern>
        </defs>
      )}
      {isPath ? (
        <path d={pointsJson.pathD} {...shapeProps} />
      ) : shapeType === 'rect' && pointsJson.points.length === 4 ? (
        <rect
          x={Math.min(...pointsJson.points.map((p) => p[0]))}
          y={Math.min(...pointsJson.points.map((p) => p[1]))}
          width={Math.abs(pointsJson.points[1][0] - pointsJson.points[0][0])}
          height={Math.abs(pointsJson.points[2][1] - pointsJson.points[0][1])}
          {...shapeProps}
        />
      ) : (
        <polygon points={points} {...shapeProps} />
      )}
      {!isTechnical && (pointsJson.points.length >= 1 || isPath) && (
        <g className={styles.label} pointerEvents="none">
          <text x={cx} y={cy - 5} textAnchor="middle" className={styles.number}>
            {roomNumber}
          </text>
          {area != null && area > 0 && (
            <text x={cx} y={cy + 12} textAnchor="middle" className={styles.area}>
              {formatArea(area)}
            </text>
          )}
        </g>
      )}
      {isTechnical && pointsJson.points.length >= 1 && (
        <text x={cx} y={cy} textAnchor="middle" className={styles.techLabel} pointerEvents="none">
          {roomNumber}
        </text>
      )}
    </g>
  );
}
