import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectHotspots, formatHotspotReport } from '../src/hotspots.js';

function createFixture(files: Record<string, string>): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'type-coverage-diff-hotspots-'));

  for (const [file, contents] of Object.entries(files)) {
    const filePath = path.join(cwd, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, 'utf8');
  }

  return cwd;
}

test('collectHotspots ranks files by any count and includes suggestions for the worst file', async () => {
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
    'src/api.ts': [
      'export const typed: string = "ok";',
      'export function load(params: any, response: any): any {',
      '  const handler: any = response;',
      '  return handler;',
      '}',
      '',
    ].join('\n'),
    'src/utils.ts': [
      'export const version: string = "1";',
      'export const value: any = 42;',
      '',
    ].join('\n'),
    'src/auth.ts': 'export const enabled: boolean = true;\n',
  });

  try {
    const report = await collectHotspots(fixture, ['src']);

    assert.equal(report.files[0]?.file, 'src/api.ts');
    assert.equal(report.files[0]?.anyCount, 5);
    assert.deepEqual(report.topOffenders, ['api.ts', 'utils.ts']);
    assert.deepEqual(
      report.files[0]?.details.map((detail) => `${detail.line}:${detail.text}:${detail.suggestion}`),
      [
        '2:params: any:Record<string, string>',
        '2:response: any:ApiResponse',
        '3:handler: any:RequestHandler',
      ],
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('formatHotspotReport renders the summary and top offenders', () => {
  const output = formatHotspotReport({
    files: [
      {
        file: 'src/api.ts',
        correctCount: 12,
        totalCount: 25,
        percent: 48,
        anyCount: 3,
        details: [
          { file: 'src/api.ts', line: 23, text: 'params: any', suggestion: 'Record<string, string>' },
          { file: 'src/api.ts', line: 45, text: 'response: any', suggestion: 'ApiResponse' },
        ],
      },
      {
        file: 'src/utils.ts',
        correctCount: 5,
        totalCount: 7,
        percent: 71,
        anyCount: 1,
        details: [],
      },
    ],
    topOffenders: ['api.ts', 'utils.ts'],
  });

  assert.match(output, /Type Coverage Hotspots:/);
  assert.match(output, /src\/api\.ts\s+48% typed \(52% any\)  ← worst file/);
  assert.match(output, /Line 23: params: any  → suggest: Record<string, string>/);
  assert.match(output, /Top offenders: api\.ts, utils\.ts \(focus here for biggest gain\)/);
});
