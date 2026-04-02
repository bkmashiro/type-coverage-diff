import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDiff, formatJson } from '../src/formatter.js';

test('formatDiff includes added and removed any entries and success status', () => {
  const output = formatDiff(
    {
      before: {
        correctCount: 18,
        totalCount: 20,
        penaltyCount: 0,
        basePercent: 90,
        counts: { any: 1, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
        strict: false,
        violations: [{ file: 'old.ts', line: 4, character: 2, text: 'legacyAny', kind: 'any' }],
        percent: 90,
      },
      after: {
        correctCount: 19,
        totalCount: 20,
        penaltyCount: 0,
        basePercent: 95,
        counts: { any: 1, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
        strict: false,
        violations: [{ file: 'new.ts', line: 2, character: 8, text: 'freshAny', kind: 'any' }],
        percent: 95,
      },
      addedViolations: [{ file: 'new.ts', line: 2, character: 8, text: 'freshAny', kind: 'any', key: 'any:new.ts:2:8' }],
      removedViolations: [{ file: 'old.ts', line: 4, character: 2, text: 'legacyAny', kind: 'any', key: 'any:old.ts:4:2' }],
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
  assert.match(output, /new\.ts:2:8    freshAny \(`any`\)/);
  assert.match(output, /old\.ts:4:2    legacyAny \(`any`\)/);
  assert.match(output, /Coverage is within threshold\./);
});

test('formatDiff renders the failure summary without any entry sections', () => {
  const output = formatDiff(
    {
      before: {
        correctCount: 10,
        totalCount: 10,
        penaltyCount: 0,
        basePercent: 100,
        counts: { any: 0, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
        strict: false,
        violations: [],
        percent: 100,
      },
      after: {
        correctCount: 8,
        totalCount: 10,
        penaltyCount: 0,
        basePercent: 80,
        counts: { any: 0, 'as-any': 0, 'ts-ignore': 0, 'ts-expect-error': 0 },
        strict: false,
        violations: [],
        percent: 80,
      },
      addedViolations: [],
      removedViolations: [],
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

test('formatDiff renders strict-mode summaries and violations', () => {
  const output = formatDiff(
    {
      before: {
        correctCount: 90,
        totalCount: 100,
        penaltyCount: 2,
        basePercent: 90,
        counts: { any: 1, 'as-any': 1, 'ts-ignore': 1, 'ts-expect-error': 0 },
        strict: true,
        violations: [],
        percent: 88.2,
      },
      after: {
        correctCount: 88,
        totalCount: 100,
        penaltyCount: 4,
        basePercent: 88,
        counts: { any: 1, 'as-any': 2, 'ts-ignore': 1, 'ts-expect-error': 1 },
        strict: true,
        violations: [],
        percent: 84.6,
      },
      addedViolations: [
        { file: 'src/api.ts', line: 42, character: 9, text: 'result as any', kind: 'as-any', key: 'as-any:src/api.ts:42:9' },
      ],
      removedViolations: [],
      change: -3.6,
      threshold: 1,
      failed: true,
    },
    'main',
    'HEAD',
  );

  assert.match(output, /Strict mode: counting `as any` casts and TypeScript suppression comments/);
  assert.match(output, /Base \(main\):\s+90\.0% coverage, 1 as-any casts, 1 ts-suppresses/);
  assert.match(output, /Current:\s+88\.0% coverage, 2 as-any casts, 2 ts-suppresses/);
  assert.match(output, /Strict score: 84\.6% \(-3\.4% with strict mode\)/);
  assert.match(output, /New violations \(1\):/);
});

test('formatJson pretty-prints values', () => {
  assert.equal(formatJson({ ok: true }), '{\n  "ok": true\n}');
});
