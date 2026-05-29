import type { ShapePoints } from './types';

export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: Math.round(loc.x), y: Math.round(loc.y) };
}

export function rectToPoints(x: number, y: number, w: number, h: number): ShapePoints {
  return {
    type: 'polygon',
    points: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  };
}

export function pointsToSvgString(points: [number, number][]) {
  return points.map((p) => p.join(',')).join(' ');
}

export function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Замыкание полигона при клике рядом с первой точкой */
export function shouldClosePolygon(
  points: [number, number][],
  next: [number, number],
  threshold = 14
) {
  if (points.length < 3) return false;
  return distance(points[0], next) <= threshold;
}

export function readImageFileDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать размер изображения'));
    };
    img.src = url;
  });
}
