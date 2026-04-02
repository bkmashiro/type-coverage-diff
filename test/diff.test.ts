import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoveragePercent } from '../src/coverage.js';
import { diffCoverage } from '../src/diff.js';

test('calculates coverage and detects added any entries', () => {
  const before = {
    correctCount: 90,
    totalCount: 100,
    penaltyCount: 0,
    basePercent: 90,
    percent: 90,
    counts: { any: 1, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
    strict: false,
    violations: [{ file: 'a.ts', line: 1, character: 5, text: 'any', kind: 'any' as const }],
  };
  const after = {
    correctCount: 88,
    totalCount: 102,
    penaltyCount: 0,
    basePercent: 86.3,
    percent: 86.3,
    counts: { any: 2, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
    strict: false,
    violations: [
      { file: 'a.ts', line: 1, character: 5, text: 'any', kind: 'any' as const },
      { file: 'b.ts', line: 3, character: 1, text: 'any', kind: 'any' as const },
    ],
  };

  assert.equal(calculateCoveragePercent(before.correctCount, before.totalCount), 90.0);
  assert.equal(calculateCoveragePercent(after.correctCount, after.totalCount), 86.3);

  const diff = diffCoverage(before, after, 1.0);

  assert.equal(diff.addedViolations.length, 1);
  assert.equal(diff.addedViolations[0]?.file, 'b.ts');
  assert.equal(diff.addedViolations[0]?.line, 3);
  assert.equal(diff.addedViolations.some((entry) => entry.file === 'a.ts' && entry.line === 1), false);
  assert.equal(diff.failed, true);
});

test('passes threshold when drop is below configured limit', () => {
  const before = {
    correctCount: 90,
    totalCount: 100,
    penaltyCount: 0,
    basePercent: 90,
    percent: 90,
    counts: { any: 1, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
    strict: false,
    violations: [{ file: 'a.ts', line: 1, character: 5, text: 'any', kind: 'any' as const }],
  };
  const after = {
    correctCount: 89,
    totalCount: 100,
    penaltyCount: 0,
    basePercent: 89,
    percent: 89,
    counts: { any: 1, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
    strict: false,
    violations: [{ file: 'a.ts', line: 1, character: 5, text: 'any', kind: 'any' as const }],
  };

  const diff = diffCoverage(before, after, 1.1);

  assert.equal(diff.change, -1.0);
  assert.equal(diff.failed, false);
});
