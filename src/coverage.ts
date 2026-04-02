import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { lint } from 'type-coverage-core';

export type ViolationKind = 'any' | 'as-any' | 'ts-ignore' | 'ts-expect-error';

export interface CoverageViolation {
  file: string;
  line: number;
  character: number;
  text: string;
  kind: ViolationKind;
}

export interface CoverageResult {
  correctCount: number;
  totalCount: number;
  penaltyCount: number;
  violations: CoverageViolation[];
  counts: Record<ViolationKind, number>;
  strict: boolean;
}

export interface CoverageSummary extends CoverageResult {
  percent: number;
  basePercent: number;
}

export interface RunCoverageOptions {
  strict?: boolean;
}

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIPPED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules']);

function normalizeAnyLocation(
  entry: {
    file: string;
    line: number;
    character: number;
    text: string;
  },
  cwd: string,
): CoverageViolation {
  return {
    ...entry,
    file: path.relative(cwd, path.resolve(cwd, entry.file)) || entry.file,
    kind: 'any',
  };
}

export function calculateCoveragePercent(correctCount: number, totalCount: number): number {
  if (totalCount === 0) {
    return 100;
  }

  return Number(((correctCount / totalCount) * 100).toFixed(1));
}

function createEmptyCounts(): Record<ViolationKind, number> {
  return {
    any: 0,
    'as-any': 0,
    'ts-ignore': 0,
    'ts-expect-error': 0,
  };
}

function collectSourceFiles(cwd: string, directory = cwd): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...collectSourceFiles(cwd, path.join(directory, entry.name)));
      continue;
    }

    if (entry.isFile() && SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(cwd, path.join(directory, entry.name)));
    }
  }

  return files;
}

function getLineAndCharacter(sourceText: string, offset: number): { line: number; character: number } {
  const prefix = sourceText.slice(0, offset);
  const lines = prefix.split('\n');

  return {
    line: lines.length,
    character: lines.at(-1)?.length ?? 0,
  };
}

function getLineText(sourceText: string, line: number): string {
  return sourceText.split('\n')[line - 1]?.trim() ?? '';
}

function scanStrictViolations(cwd: string): CoverageViolation[] {
  const violations: CoverageViolation[] = [];

  for (const file of collectSourceFiles(cwd)) {
    const absolutePath = path.join(cwd, file);
    const sourceText = readFileSync(absolutePath, 'utf8');
    const scanners: Array<{ kind: Exclude<ViolationKind, 'any'>; expression: RegExp }> = [
      { kind: 'as-any', expression: /\bas\s+any\b/g },
      { kind: 'ts-ignore', expression: /@ts-ignore\b/g },
      { kind: 'ts-expect-error', expression: /@ts-expect-error\b/g },
    ];

    for (const scanner of scanners) {
      for (const match of sourceText.matchAll(scanner.expression)) {
        const index = match.index ?? 0;
        const location = getLineAndCharacter(sourceText, index);

        violations.push({
          file,
          line: location.line,
          character: location.character,
          text: scanner.kind === 'as-any' ? getLineText(sourceText, location.line) : match[0],
          kind: scanner.kind,
        });
      }
    }
  }

  return violations;
}

export async function runCoverage(cwd: string, options: RunCoverageOptions = {}): Promise<CoverageSummary> {
  const previousCwd = process.cwd();

  try {
    process.chdir(cwd);
    const result = await lint('.', {
      strict: false,
      enableCache: false,
      fileCounts: false,
    });
    const baseViolations = (result.anys ?? []).map((entry) => normalizeAnyLocation(entry, cwd));
    const strictViolations = options.strict ? scanStrictViolations(cwd) : [];
    const violations = [...baseViolations, ...strictViolations];
    const counts = createEmptyCounts();

    for (const violation of violations) {
      counts[violation.kind] += 1;
    }

    const penaltyCount = strictViolations.length;
    const effectiveTotalCount = result.totalCount + penaltyCount;

    return {
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      penaltyCount,
      violations,
      counts,
      strict: options.strict ?? false,
      basePercent: calculateCoveragePercent(result.correctCount, result.totalCount),
      percent: calculateCoveragePercent(result.correctCount, effectiveTotalCount),
    };
  } finally {
    process.chdir(previousCwd);
  }
}
