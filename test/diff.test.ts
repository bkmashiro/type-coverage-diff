import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoveragePercent } from '../src/coverage.js';
import { diffCoverage } from '../src/diff.js';

test('calculates coverage and detects added any entries', () => {
  const before = {
    correctCount: 90,
    totalCount: 100,
    anys: [{ file: 'a.ts', line: 1, character: 5, text: 'any' }],
  };
  const after = {
    correctCount: 88,
    totalCount: 102,
    anys: [
      { file: 'a.ts', line: 1, character: 5, text: 'any' },
      { file: 'b.ts', line: 3, character: 1, text: 'any' },
    ],
  };

  assert.equal(calculateCoveragePercent(before.correctCount, before.totalCount), 90.0);
  assert.equal(calculateCoveragePercent(after.correctCount, after.totalCount), 86.3);

  const diff = diffCoverage(before, after, 1.0);

  assert.equal(diff.addedAnys.length, 1);
  assert.equal(diff.addedAnys[0]?.file, 'b.ts');
  assert.equal(diff.addedAnys[0]?.line, 3);
  assert.equal(diff.addedAnys.some((entry) => entry.file === 'a.ts' && entry.line === 1), false);
  assert.equal(diff.failed, true);
});

test('passes threshold when drop is below configured limit', () => {
  const before = {
    correctCount: 90,
    totalCount: 100,
    anys: [{ file: 'a.ts', line: 1, character: 5, text: 'any' }],
  };
  const after = {
    correctCount: 89,
    totalCount: 100,
    anys: [{ file: 'a.ts', line: 1, character: 5, text: 'any' }],
  };

  const diff = diffCoverage(before, after, 1.1);

  assert.equal(diff.change, -1.0);
  assert.equal(diff.failed, false);
});
