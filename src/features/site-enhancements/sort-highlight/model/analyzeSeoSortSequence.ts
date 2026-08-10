export type SeoSortStatus = "normal" | "warning" | "error";

export type SeoSortReason =
  | "normal"
  | "missing"
  | "duplicate"
  | "skipped"
  | "range-change"
  | "irregular"
  | "outlier"
  | "order";

export type SeoSortAnalysis = {
  value: number | null;
  status: SeoSortStatus;
  reason: SeoSortReason;
  expectedStep?: number;
};

type SequencePoint = {
  rawIndex: number;
  value: number;
  breakBefore: boolean;
  segmentId: number;
};

type StableRun = {
  pointStart: number;
  pointEnd: number;
  step: number;
};

const MIN_STABLE_DELTAS = 2;
const EXTREME_GAP_MULTIPLIER = 5;

function countValues(values: readonly (number | null)[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function buildSequencePoints(values: readonly (number | null)[]): SequencePoint[] {
  const points: SequencePoint[] = [];
  let breakBefore = true;
  let segmentId = -1;

  values.forEach((value, rawIndex) => {
    if (value === null) {
      breakBefore = true;
      return;
    }

    const previousPoint = points.at(-1);
    if (!breakBefore && previousPoint?.value === value) {
      return;
    }

    if (breakBefore) segmentId += 1;
    points.push({ rawIndex, value, breakBefore, segmentId });
    breakBefore = false;
  });

  return points;
}

function getPositiveDelta(points: readonly SequencePoint[], edgeIndex: number): number | null {
  const current = points[edgeIndex];
  const next = points[edgeIndex + 1];
  if (!current || !next || next.breakBefore) return null;

  const delta = next.value - current.value;
  return delta > 0 ? delta : null;
}

function findStableRuns(points: readonly SequencePoint[]): StableRun[] {
  const runs: StableRun[] = [];
  let edgeIndex = 0;

  while (edgeIndex < points.length - 1) {
    const step = getPositiveDelta(points, edgeIndex);
    if (step === null) {
      edgeIndex += 1;
      continue;
    }

    let finalEdgeIndex = edgeIndex;
    while (getPositiveDelta(points, finalEdgeIndex + 1) === step) {
      finalEdgeIndex += 1;
    }

    const deltaCount = finalEdgeIndex - edgeIndex + 1;
    if (deltaCount >= MIN_STABLE_DELTAS) {
      runs.push({
        pointStart: edgeIndex,
        pointEnd: finalEdgeIndex + 1,
        step,
      });
    }

    edgeIndex = finalEdgeIndex + 1;
  }

  return runs;
}

function findTransitionMarkers(
  points: readonly SequencePoint[],
  runs: readonly StableRun[],
): Map<number, SeoSortReason> {
  const markers = new Map<number, SeoSortReason>();

  for (let runIndex = 1; runIndex < runs.length; runIndex += 1) {
    const previousRun = runs[runIndex - 1];
    const currentRun = runs[runIndex];
    if (!previousRun || !currentRun) continue;

    const runsTouch = currentRun.pointStart === previousRun.pointEnd;
    const runsAreAdjacent = currentRun.pointStart === previousRun.pointEnd + 1;
    if (!runsTouch && !runsAreAdjacent) continue;

    const markerPointIndex = runsTouch ? currentRun.pointStart + 1 : currentRun.pointStart;
    const markerPoint = points[markerPointIndex];
    const pointBeforeMarker = points[markerPointIndex - 1];
    if (!markerPoint || !pointBeforeMarker || markerPoint.breakBefore) continue;

    const boundaryDelta = markerPoint.value - pointBeforeMarker.value;
    const hasDifferentStep = currentRun.step !== previousRun.step;
    const hasLargeRangeChange =
      boundaryDelta > Math.max(previousRun.step, currentRun.step) * EXTREME_GAP_MULTIPLIER;

    if (boundaryDelta <= 0) {
      markers.set(markerPoint.rawIndex, "order");
    } else if (hasDifferentStep || hasLargeRangeChange) {
      markers.set(markerPoint.rawIndex, "range-change");
    } else if (boundaryDelta > currentRun.step && boundaryDelta % currentRun.step === 0) {
      markers.set(markerPoint.rawIndex, "skipped");
    } else if (boundaryDelta !== currentRun.step) {
      markers.set(markerPoint.rawIndex, "irregular");
    }
  }

  return markers;
}

function findPreviousRun(
  points: readonly SequencePoint[],
  runs: readonly StableRun[],
  pointIndex: number,
): StableRun | null {
  const currentPoint = points[pointIndex];
  if (!currentPoint) return null;

  for (let runIndex = runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const run = runs[runIndex];
    const runEndPoint = run ? points[run.pointEnd] : undefined;
    if (
      run &&
      runEndPoint?.segmentId === currentPoint.segmentId &&
      run.pointEnd < pointIndex
    ) {
      return run;
    }
  }

  return null;
}

export function analyzeSeoSortSequence(
  values: readonly (number | null)[],
): SeoSortAnalysis[] {
  const counts = countValues(values);
  const points = buildSequencePoints(values);
  const runs = findStableRuns(points);
  const transitionMarkers = findTransitionMarkers(points, runs);
  const pointIndexByRawIndex = new Map(points.map((point, pointIndex) => [point.rawIndex, pointIndex]));
  const segmentSizes = new Map<number, number>();
  const stableStepByRawIndex = new Map<number, number>();

  for (const point of points) {
    segmentSizes.set(point.segmentId, (segmentSizes.get(point.segmentId) ?? 0) + 1);
  }

  for (const run of runs) {
    for (let pointIndex = run.pointStart; pointIndex <= run.pointEnd; pointIndex += 1) {
      const point = points[pointIndex];
      if (point && !stableStepByRawIndex.has(point.rawIndex)) {
        stableStepByRawIndex.set(point.rawIndex, run.step);
      }
    }
  }

  return values.map((value, rawIndex): SeoSortAnalysis => {
    if (value === null) {
      return { value, status: "error", reason: "missing" };
    }

    if ((counts.get(value) ?? 0) > 1) {
      return { value, status: "warning", reason: "duplicate" };
    }

    const transitionReason = transitionMarkers.get(rawIndex);
    if (transitionReason) {
      return {
        value,
        status: transitionReason === "order" ? "error" : "warning",
        reason: transitionReason,
        expectedStep: stableStepByRawIndex.get(rawIndex),
      };
    }

    const stableStep = stableStepByRawIndex.get(rawIndex);
    if (stableStep !== undefined) {
      return { value, status: "normal", reason: "normal", expectedStep: stableStep };
    }

    const pointIndex = pointIndexByRawIndex.get(rawIndex);
    if (pointIndex === undefined) {
      return { value, status: "warning", reason: "duplicate" };
    }

    const point = points[pointIndex];
    const previousPoint = points[pointIndex - 1];
    if (!point || !previousPoint || point.breakBefore) {
      return { value, status: "normal", reason: "normal" };
    }

    const delta = point.value - previousPoint.value;
    if (delta < 0) {
      return { value, status: "error", reason: "order" };
    }

    const previousRun = findPreviousRun(points, runs, pointIndex);
    if (previousRun) {
      if (delta === previousRun.step) {
        return {
          value,
          status: "normal",
          reason: "normal",
          expectedStep: previousRun.step,
        };
      }

      if (delta > previousRun.step * EXTREME_GAP_MULTIPLIER) {
        return {
          value,
          status: "error",
          reason: "outlier",
          expectedStep: previousRun.step,
        };
      }

      if (delta > previousRun.step && delta % previousRun.step === 0) {
        return {
          value,
          status: "warning",
          reason: "skipped",
          expectedStep: previousRun.step,
        };
      }

      return {
        value,
        status: "warning",
        reason: "irregular",
        expectedStep: previousRun.step,
      };
    }

    if ((segmentSizes.get(point.segmentId) ?? 0) <= 2) {
      return { value, status: "normal", reason: "normal" };
    }

    return { value, status: "warning", reason: "irregular" };
  });
}
