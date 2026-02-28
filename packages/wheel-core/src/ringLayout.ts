export interface RingInput {
  id: string;
  heightPct: number;
  active?: boolean;
}

export interface RingGeometry {
  id: string;
  innerRadius: number;
  outerRadius: number;
  height: number;
}

export interface RingLayoutInput {
  innerRadius: number;
  outerRadius: number;
  rings: RingInput[];
}

export function buildRingLayout(input: RingLayoutInput): RingGeometry[] {
  if (input.outerRadius <= input.innerRadius) {
    throw new Error("outerRadius must be greater than innerRadius");
  }

  const activeRings = input.rings.filter((ring) => ring.active !== false);

  if (activeRings.length === 0) {
    return [];
  }

  const sumPct = activeRings.reduce((sum, ring) => {
    if (ring.heightPct <= 0) {
      throw new Error(`Ring ${ring.id} has invalid heightPct`);
    }
    return sum + ring.heightPct;
  }, 0);

  const totalHeight = input.outerRadius - input.innerRadius;
  let cursor = input.innerRadius;

  return activeRings.map((ring) => {
    const normalizedShare = ring.heightPct / sumPct;
    const height = totalHeight * normalizedShare;
    const geom: RingGeometry = {
      id: ring.id,
      innerRadius: cursor,
      outerRadius: cursor + height,
      height
    };
    cursor += height;
    return geom;
  });
}
