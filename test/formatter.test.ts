import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDiff, formatJson } from '../src/formatter.js';

test('formatDiff includes added and removed any entries and success status', () => {
  const output = formatDiff(
    {
      before: {
        correctCount: 18,
        totalCount: 20,
        anys: [{ file: 'old.ts', line: 4, character: 2, text: 'legacyAny' }],
        percent: 90,
      },
      after: {
        correctCount: 19,
        totalCount: 20,
        anys: [{ file: 'new.ts', line: 2, character: 8, text: 'freshAny' }],
        percent: 95,
      },
      addedAnys: [{ file: 'new.ts', line: 2, character: 8, text: 'freshAny', key: 'new.ts:2:8' }],
      removedAnys: [{ file: 'old.ts', line: 4, character: 2, text: 'legacyAny', key: 'old.ts:4:2' }],
      change: 5,
      threshold: 1,
      failed: false,
    },
    'main',
    'feature',
  );

  assert.match(output, /Comparing type coverage: main → feature/);
  assert.match(output, /Change: \+5\.0%  ✓ \(threshold: -1\.0%\)/);
  assert.match(output, /New `any` introduced \(1\):/);
  assert.match(output, /any` removed \(1\):/);
  assert.match(output, /new\.ts:2:8    freshAny/);
  assert.match(output, /old\.ts:4:2    legacyAny/);
  assert.match(output, /Coverage is within threshold\./);
});

test('formatDiff renders the failure summary without any entry sections', () => {
  const output = formatDiff(
    {
      before: { correctCount: 10, totalCount: 10, anys: [], percent: 100 },
      after: { correctCount: 8, totalCount: 10, anys: [], percent: 80 },
      addedAnys: [],
      removedAnys: [],
      change: -20,
      threshold: 5,
      failed: true,
    },
    'origin/main',
    'HEAD',
  );

  assert.doesNotMatch(output, /New `any` introduced/);
  assert.doesNotMatch(output, /`any` removed/);
  assert.match(output, /Change: -20\.0%  ⚠ \(threshold: -5\.0%\)/);
  assert.match(output, /Coverage dropped below threshold\. Exit code 1\./);
});

test('formatJson pretty-prints values', () => {
  assert.equal(formatJson({ ok: true }), '{\n  "ok": true\n}');
});
