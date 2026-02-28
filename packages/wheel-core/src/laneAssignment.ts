export interface ArcInterval {
  id: string;
  startAngle: number;
  endAngle: number;
}

export interface LaneAssignment extends ArcInterval {
  laneIndex: number;
}

export interface LaneAssignmentResult {
  laneCount: number;
  assignments: LaneAssignment[];
}

const FULL_CIRCLE = Math.PI * 2;

function normalizeInterval(interval: ArcInterval): ArcInterval {
  const start = interval.startAngle;
  let end = interval.endAngle;

  if (end < start) {
    end += FULL_CIRCLE;
  }

  return {
    ...interval,
    startAngle: start,
    endAngle: end
  };
}

export function assignActivityLanes(intervals: ArcInterval[]): LaneAssignmentResult {
  if (intervals.length === 0) {
    return { laneCount: 0, assignments: [] };
  }

  const sorted = intervals
    .map(normalizeInterval)
    .sort((a, b) => a.startAngle - b.startAngle || a.endAngle - b.endAngle);

  const laneEndAngles: number[] = [];
  const assignments: LaneAssignment[] = [];

  for (const interval of sorted) {
    let laneIndex = -1;

    for (let i = 0; i < laneEndAngles.length; i += 1) {
      if (laneEndAngles[i] <= interval.startAngle) {
        laneIndex = i;
        break;
      }
    }

    if (laneIndex === -1) {
      laneIndex = laneEndAngles.length;
      laneEndAngles.push(interval.endAngle);
    } else {
      laneEndAngles[laneIndex] = interval.endAngle;
    }

    assignments.push({
      ...interval,
      laneIndex
    });
  }

  return {
    laneCount: laneEndAngles.length,
    assignments
  };
}
