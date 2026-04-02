import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createTrendReport,
  formatTrendReport,
  readCoverageHistory,
  updateCoverageHistory,
} from '../src/trend.js';

test('updateCoverageHistory writes and replaces entries by commit', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'type-coverage-diff-trend-'));

  try {
    updateCoverageHistory(cwd, { date: '2024-03-01', percentage: 82.1, commit: 'aaa' });
    updateCoverageHistory(cwd, { date: '2024-03-05', percentage: 83.4, commit: 'bbb' });
    updateCoverageHistory(cwd, { date: '2024-03-06', percentage: 84.0, commit: 'bbb' });
    updateCoverageHistory(cwd, { date: '2024-03-06', percentage: 84.2, commit: 'bbb' });

    assert.deepEqual(readCoverageHistory(cwd), [
      { date: '2024-03-01', percentage: 82.1, commit: 'aaa' },
      { date: '2024-03-05', percentage: 83.4, commit: 'bbb' },
      { date: '2024-03-06', percentage: 84.2, commit: 'bbb' },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('createTrendReport filters by days and formats deltas', () => {
  const report = createTrendReport(
    [
      { date: '2024-03-01', percentage: 82.1, commit: 'a1' },
      { date: '2024-03-05', percentage: 83.4, commit: 'b2' },
      { date: '2024-03-10', percentage: 86.7, commit: 'c3' },
      { date: '2024-03-15', percentage: 85.2, commit: 'd4' },
      { date: '2024-03-16', percentage: 87.3, commit: 'e5' },
    ],
    14,
  );

  assert.equal(report.entries.length, 4);
  assert.equal(report.entries[0]?.delta, null);
  assert.equal(report.entries[2]?.delta, -1.5);
  assert.equal(report.entries.at(-1)?.label, 'today');
  assert.equal(report.overallChange, 3.9);

  const output = formatTrendReport(report);
  assert.match(output, /Type coverage history:/);
  assert.match(output, /2024-03-05\s+83\.4%  baseline/);
  assert.match(output, /2024-03-15\s+85\.2%  -1\.5% ⚠ regression/);
  assert.match(output, /today\s+87\.3%  \+2\.1%/);
  assert.match(output, /Overall trend: \+3\.9% in 11 days ✅ improving/);
});
