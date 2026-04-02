import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { calculateCoveragePercent, runCoverage } from '../src/coverage.js';

function createFixture(files: Record<string, string>): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'type-coverage-diff-'));

  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(path.join(cwd, file), contents);
  }

  return cwd;
}

test('calculateCoveragePercent returns 100 when there are no tracked nodes', () => {
  assert.equal(calculateCoveragePercent(0, 0), 100);
});

test('runCoverage reports relative any locations and restores cwd', async () => {
  const fixture = createFixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      include: ['**/*.ts'],
    }),
    'sample.ts': "const typed: string = 'ok';\nconst value: any = typed;\n",
  });
  const previousCwd = process.cwd();

  try {
    const result = await runCoverage(fixture);

    assert.equal(result.correctCount, 2);
    assert.equal(result.totalCount, 3);
    assert.equal(result.percent, 66.7);
    assert.equal(result.anys.length, 1);
    assert.deepEqual(result.anys[0], {
      file: 'sample.ts',
      line: 1,
      character: 6,
      text: 'value',
      kind: 1,
    });
    assert.equal(process.cwd(), previousCwd);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('runCoverage restores cwd when the target directory does not exist', async () => {
  const fixture = path.join(tmpdir(), `type-coverage-diff-missing-${Date.now()}`);
  const previousCwd = process.cwd();

  await assert.rejects(() => runCoverage(fixture));
  assert.equal(process.cwd(), previousCwd);
});
