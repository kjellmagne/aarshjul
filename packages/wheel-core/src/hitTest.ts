import type { RingGeometry } from "./ringLayout";

export interface Point {
  x: number;
  y: number;
}

export interface PolarPoint {
  angle: number;
  radius: number;
}

const FULL_CIRCLE = Math.PI * 2;

function normalizeAngle(angle: number): number {
  const normalized = angle % FULL_CIRCLE;
  return normalized < 0 ? normalized + FULL_CIRCLE : normalized;
}

export function cartesianToPolar(point: Point, center: Point): PolarPoint {
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  const raw = Math.atan2(dy, dx);
  // Shift so 0 rad starts at 12 o'clock like the renderer.
  const angle = normalizeAngle(raw + Math.PI / 2);
  const radius = Math.hypot(dx, dy);

  return { angle, radius };
}

export function hitTestRing(point: Point, center: Point, rings: RingGeometry[]): RingGeometry | null {
  const polar = cartesianToPolar(point, center);
  return rings.find((ring) => polar.radius >= ring.innerRadius && polar.radius <= ring.outerRadius) ?? null;
}

export interface ArcHitTestInput {
  point: Point;
  center: Point;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}

export function hitTestArcSegment(input: ArcHitTestInput): boolean {
  const polar = cartesianToPolar(input.point, input.center);

  if (polar.radius < input.innerRadius || polar.radius > input.outerRadius) {
    return false;
  }

  const start = normalizeAngle(input.startAngle);
  const end = normalizeAngle(input.endAngle);
  const angle = normalizeAngle(polar.angle);

  if (end >= start) {
    return angle >= start && angle <= end;
  }

  // Wrapped interval crossing 2π -> 0.
  return angle >= start || angle <= end;
}
