import path from 'node:path';
import process from 'node:process';
import { lint } from 'type-coverage-core';

export interface AnyLocation {
  file: string;
  line: number;
  character: number;
  text: string;
}

export interface CoverageResult {
  correctCount: number;
  totalCount: number;
  anys: AnyLocation[];
}

export interface CoverageSummary extends CoverageResult {
  percent: number;
}

function normalizeAnyLocation(entry: AnyLocation, cwd: string): AnyLocation {
  return {
    ...entry,
    file: path.relative(cwd, path.resolve(cwd, entry.file)) || entry.file,
  };
}

export function calculateCoveragePercent(correctCount: number, totalCount: number): number {
  if (totalCount === 0) {
    return 100;
  }

  return Number(((correctCount / totalCount) * 100).toFixed(1));
}

export async function runCoverage(cwd: string): Promise<CoverageSummary> {
  const previousCwd = process.cwd();

  try {
    process.chdir(cwd);
    const result = await lint('.', {
      strict: false,
      enableCache: false,
      fileCounts: false,
    });
    const anys = (result.anys ?? []).map((entry) => normalizeAnyLocation(entry, cwd));

    return {
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      anys,
      percent: calculateCoveragePercent(result.correctCount, result.totalCount),
    };
  } finally {
    process.chdir(previousCwd);
  }
}
