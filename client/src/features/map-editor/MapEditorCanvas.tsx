import { useRef, useState, useCallback, useEffect } from 'react';
import {
  MousePointer2,
  Pentagon,
  Square,
  Hand,
  Plus,
  Minus,
  Maximize2,
  Undo2,
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { ROOM_STATUS_STYLE } from '@/constants/roomStatus';
import type { EditorMapRoom, EditorTool } from './types';
import {
  svgPoint,
  pointsToSvgString,
  shouldClosePolygon,
} from './svgUtils';
import styles from './MapEditorCanvas.module.css';

interface Props {
  planWidth: number;
  planHeight: number;
  imageUrl: string | null;
  rooms: EditorMapRoom[];
  tool: EditorTool;
  draftPoints: [number, number][];
  rectStart: [number, number] | null;
  selectedShapeId: number | null;
  selectedRoomId: number | null;
  onToolChange: (t: EditorTool) => void;
  onDraftPointsChange: (pts: [number, number][]) => void;
  onRectStartChange: (pt: [number, number] | null) => void;
  onSelectShape: (shapeId: number | null, roomId: number | null) => void;
  onPolygonComplete: (points: [number, number][]) => void;
  onRectComplete: (points: [number, number][]) => void;
  disabled?: boolean;
}

export function MapEditorCanvas({
  planWidth,
  planHeight,
  imageUrl,
  rooms,
  tool,
  draftPoints,
  rectStart,
  selectedShapeId,
  selectedRoomId,
  onToolChange,
  onDraftPointsChange,
  onRectStartChange,
  onSelectShape,
  onPolygonComplete,
  onRectComplete,
  disabled,
}: Props) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);

  const fit = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    fit();
  }, [planWidth, planHeight, imageUrl, fit]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || tool !== 'pan') return;
    if ((e.target as Element).closest('[data-shape]')) return;
    setDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag) {
      setPan({ x: e.clientX - drag.x, y: e.clientY - drag.y });
      return;
    }
    if (!svgRef.current || disabled) return;
    const { x, y } = svgPoint(svgRef.current, e.clientX, e.clientY);
    setCursor([x, y]);
  };

  const handleMouseUp = () => setDrag(null);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (disabled || !svgRef.current || drag) return;
    const { x, y } = svgPoint(svgRef.current, e.clientX, e.clientY);

    if (tool === 'select') return;

    if (tool === 'polygon') {
      if (shouldClosePolygon(draftPoints, [x, y])) {
        onPolygonComplete(draftPoints);
        onDraftPointsChange([]);
        return;
      }
      onDraftPointsChange([...draftPoints, [x, y]]);
      return;
    }

    if (tool === 'rect') {
      if (!rectStart) {
        onRectStartChange([x, y]);
      } else {
        const [x1, y1] = rectStart;
        const w = Math.abs(x - x1);
        const h = Math.abs(y - y1);
        if (w > 8 && h > 8) {
          const rx = Math.min(x, x1);
          const ry = Math.min(y, y1);
          onRectComplete([
            [rx, ry],
            [rx + w, ry],
            [rx + w, ry + h],
            [rx, ry + h],
          ]);
        }
        onRectStartChange(null);
      }
    }
  };

  const undoPoint = () => {
    if (draftPoints.length) onDraftPointsChange(draftPoints.slice(0, -1));
    else onRectStartChange(null);
  };

  const rectPreview =
    rectStart && cursor && tool === 'rect'
      ? (() => {
          const [x1, y1] = rectStart;
          const [x2, y2] = cursor;
          const rx = Math.min(x1, x2);
          const ry = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          return `${rx},${ry} ${rx + w},${ry} ${rx + w},${ry + h} ${rx},${ry + h}`;
        })()
      : null;

  const toolHint =
    tool === 'polygon'
      ? t('mapEditor.hintPolygon')
      : tool === 'rect'
        ? t('mapEditor.hintRect')
        : tool === 'pan'
          ? t('mapEditor.hintPan')
          : t('mapEditor.hintSelect');

  if (!imageUrl) {
    return (
      <div className={styles.wrap}>
        <div className={styles.emptyPlan}>{t('common.uploadPlanPrevStep')}</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button
          type="button"
          title={t('common.select')}
          className={tool === 'select' ? styles.toolActive : ''}
          onClick={() => onToolChange('select')}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          type="button"
          title={t('common.polygon')}
          className={tool === 'polygon' ? styles.toolActive : ''}
          onClick={() => onToolChange('polygon')}
        >
          <Pentagon size={18} />
        </button>
        <button
          type="button"
          title={t('common.rectangle')}
          className={tool === 'rect' ? styles.toolActive : ''}
          onClick={() => onToolChange('rect')}
        >
          <Square size={18} />
        </button>
        <button
          type="button"
          title={t('common.pan')}
          className={tool === 'pan' ? styles.toolActive : ''}
          onClick={() => onToolChange('pan')}
        >
          <Hand size={18} />
        </button>
        <button type="button" title={t('common.undoPoint')} onClick={undoPoint}>
          <Undo2 size={18} />
        </button>
        <button type="button" title={t('common.zoomIn')} onClick={() => setScale((s) => Math.min(3, s + 0.15))}>
          <Plus size={18} />
        </button>
        <button type="button" title={t('common.zoomOut')} onClick={() => setScale((s) => Math.max(0.25, s - 0.15))}>
          <Minus size={18} />
        </button>
        <button type="button" title={t('common.resetZoom')} onClick={fit}>
          <Maximize2 size={18} />
        </button>
      </div>

      <div
        className={`${styles.viewport} ${tool === 'pan' ? styles.viewportPan : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => {
          if (tool === 'pan' && drag) handleMouseMove(e as unknown as React.MouseEvent<SVGSVGElement>);
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className={styles.canvas}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${planWidth} ${planHeight}`}
            className={styles.svg}
            style={{ width: planWidth, height: planHeight, minWidth: planWidth }}
            onClick={handleSvgClick}
            onMouseMove={handleMouseMove}
          >
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={planWidth}
              height={planHeight}
              preserveAspectRatio="none"
            />
            {rooms.map((room) => {
              const st = ROOM_STATUS_STYLE[room.status] || ROOM_STATUS_STYLE.free;
              const selected = selectedShapeId === room.shape.id || selectedRoomId === room.id;
              return (
                <polygon
                  key={room.id}
                  data-shape
                  className={`${styles.shape} ${selected ? styles.shapeSelected : ''}`}
                  points={pointsToSvgString(room.shape.pointsJson.points)}
                  fill={st.fill}
                  fillOpacity={selected ? 0.55 : 0.4}
                  stroke={selected ? '#1267E8' : st.stroke}
                  strokeWidth={selected ? 2.5 : 1.2}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (tool === 'select' || tool === 'polygon' || tool === 'rect') {
                      onSelectShape(room.shape.id, room.id);
                      onToolChange('select');
                    }
                  }}
                />
              );
            })}
            {draftPoints.map((p, i) => (
              <circle key={i} className={styles.draftPoint} cx={p[0]} cy={p[1]} r={6} />
            ))}
            {draftPoints.length >= 2 && (
              <polyline className={styles.draftLine} points={pointsToSvgString(draftPoints)} />
            )}
            {draftPoints.length >= 3 && cursor && (
              <polyline
                className={styles.draftLine}
                points={pointsToSvgString([...draftPoints, cursor])}
                opacity={0.6}
              />
            )}
            {draftPoints.length >= 3 && (
              <polygon
                className={styles.draftPreview}
                points={pointsToSvgString(draftPoints)}
              />
            )}
            {rectPreview && <polygon className={styles.draftPreview} points={rectPreview} />}
            {rectStart && tool === 'rect' && (
              <circle className={styles.draftPoint} cx={rectStart[0]} cy={rectStart[1]} r={7} />
            )}
          </svg>
        </div>
      </div>
      <div className={styles.hintBar}>{toolHint}</div>
    </div>
  );
}
