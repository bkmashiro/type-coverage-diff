import { calculateCoveragePercent, type AnyLocation, type CoverageResult } from './coverage.js';

export interface DiffEntry extends AnyLocation {
  key: string;
}

export interface CoverageDiff {
  before: CoverageResult & { percent: number };
  after: CoverageResult & { percent: number };
  addedAnys: DiffEntry[];
  removedAnys: DiffEntry[];
  change: number;
  threshold: number;
  failed: boolean;
}

function anyKey(entry: AnyLocation): string {
  return `${entry.file}:${entry.line}:${entry.character}`;
}

function withPercent(result: CoverageResult): CoverageResult & { percent: number } {
  return {
    ...result,
    percent: calculateCoveragePercent(result.correctCount, result.totalCount),
  };
}

export function diffCoverage(before: CoverageResult, after: CoverageResult, threshold: number): CoverageDiff {
  const beforeWithPercent = withPercent(before);
  const afterWithPercent = withPercent(after);
  const beforeMap = new Map(before.anys.map((entry) => [anyKey(entry), entry]));
  const afterMap = new Map(after.anys.map((entry) => [anyKey(entry), entry]));

  const addedAnys = after.anys
    .filter((entry) => !beforeMap.has(anyKey(entry)))
    .map((entry) => ({ ...entry, key: anyKey(entry) }));
  const removedAnys = before.anys
    .filter((entry) => !afterMap.has(anyKey(entry)))
    .map((entry) => ({ ...entry, key: anyKey(entry) }));

  const change = Number((afterWithPercent.percent - beforeWithPercent.percent).toFixed(1));
  const failed = change < 0 && Math.abs(change) > threshold;

  return {
    before: beforeWithPercent,
    after: afterWithPercent,
    addedAnys,
    removedAnys,
    change,
    threshold,
    failed,
  };
}
