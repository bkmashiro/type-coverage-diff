import { type CoverageSummary, type CoverageViolation } from './coverage.js';

export interface DiffEntry extends CoverageViolation {
  key: string;
}

export interface CoverageDiff {
  before: CoverageSummary;
  after: CoverageSummary;
  addedViolations: DiffEntry[];
  removedViolations: DiffEntry[];
  change: number;
  threshold: number;
  failed: boolean;
}

function violationKey(entry: CoverageViolation): string {
  return `${entry.kind}:${entry.file}:${entry.line}:${entry.character}`;
}

export function diffCoverage(before: CoverageSummary, after: CoverageSummary, threshold: number): CoverageDiff {
  const beforeMap = new Map(before.violations.map((entry) => [violationKey(entry), entry]));
  const afterMap = new Map(after.violations.map((entry) => [violationKey(entry), entry]));

  const addedViolations = after.violations
    .filter((entry) => !beforeMap.has(violationKey(entry)))
    .map((entry) => ({ ...entry, key: violationKey(entry) }));
  const removedViolations = before.violations
    .filter((entry) => !afterMap.has(violationKey(entry)))
    .map((entry) => ({ ...entry, key: violationKey(entry) }));

  const change = Number((after.percent - before.percent).toFixed(1));
  const failed = change < 0 && Math.abs(change) > threshold;

  return {
    before,
    after,
    addedViolations,
    removedViolations,
    change,
    threshold,
    failed,
  };
}
