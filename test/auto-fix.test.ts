import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applySimpleFixes, formatAutoFixReport } from '../src/auto-fix.js';

function createFixture(files: Record<string, string>): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'type-coverage-diff-auto-fix-'));

  for (const [file, contents] of Object.entries(files)) {
    const filePath = path.join(cwd, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return cwd;
}

test('applySimpleFixes removes obvious any annotations and infers simple function signatures', async () => {
  const fixture = createFixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      include: ['src/**/*.ts'],
    }),
    'src/utils.ts': [
      'const name: any = "Alice";',
      'let port: any = 3000;',
      '',
    ].join('\n'),
    'src/fn.ts': [
      'export function echo(value: any): any {',
      '  return value;',
      '}',
      '',
      'const greeting = echo("hello");',
      '',
    ].join('\n'),
    'src/skip.ts': [
      'let later: any;',
      'later = "x";',
      '',
    ].join('\n'),
  });

  try {
    const report = await applySimpleFixes(fixture, ['src']);

    assert.equal(report.fixes.length, 3);
    assert.deepEqual(
      report.fixes.map((fix) => `${fix.file}:${fix.reason}`),
      ['src/fn.ts:call-site inference', 'src/utils.ts:inferred', 'src/utils.ts:inferred'],
    );
    assert.match(readFileSync(path.join(fixture, 'src/utils.ts'), 'utf8'), /const name = "Alice";/);
    assert.match(readFileSync(path.join(fixture, 'src/utils.ts'), 'utf8'), /let port = 3000;/);
    assert.match(readFileSync(path.join(fixture, 'src/fn.ts'), 'utf8'), /export function echo\(value: string\): string {/);
    assert.match(readFileSync(path.join(fixture, 'src/skip.ts'), 'utf8'), /let later: any;/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('formatAutoFixReport prints the applied fixes', () => {
  const output = formatAutoFixReport({
    fixes: [
      {
        file: 'src/utils.ts',
        line: 12,
        before: 'const name: any = "Alice"',
        after: 'const name = "Alice"',
        reason: 'inferred',
      },
    ],
  });

  assert.match(output, /Auto-fixing obvious any types/);
  assert.match(output, /src\/utils\.ts:12  const name: any = "Alice"  → const name = "Alice"  \(inferred\)/);
  assert.match(output, /1 fixes applied\. Run tsc to verify\./);
});
