import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { lint } from 'type-coverage-core';
import { resolveCoverageFiles } from './coverage.js';

export interface HotspotDetail {
  file: string;
  line: number;
  text: string;
  suggestion?: string;
}

export interface HotspotFile {
  file: string;
  correctCount: number;
  totalCount: number;
  percent: number;
  anyCount: number;
  details: HotspotDetail[];
}

export interface HotspotReport {
  files: HotspotFile[];
  topOffenders: string[];
}

function calculatePercent(correctCount: number, totalCount: number): number {
  if (totalCount === 0) {
    return 100;
  }

  return Number(((correctCount / totalCount) * 100).toFixed(1));
}

function suggestType(identifier: string, lineText: string): string | undefined {
  const name = identifier.toLowerCase();

  if (name === 'params') {
    return 'Record<string, string>';
  }

  if (name === 'response' || name === 'result') {
    return 'ApiResponse';
  }

  if (name === 'handler') {
    return 'RequestHandler';
  }

  if (name === 'config' || name === 'options') {
    return 'Record<string, unknown>';
  }

  if (name === 'error' || name === 'err') {
    return 'Error';
  }

  if (name === 'data' || name === 'payload' || name === 'body') {
    return 'unknown';
  }

  if (/\(\s*.*\)\s*=>/.test(lineText)) {
    return '(...args: unknown[]) => unknown';
  }

  return undefined;
}

function buildDetail(file: string, line: number, text: string, sourceLine: string): HotspotDetail {
  const identifierMatch = sourceLine.match(/\b([A-Za-z_$][\w$]*)\s*:\s*any\b/);
  const identifier = identifierMatch?.[1] ?? text;
  const suggestion = suggestType(identifier, sourceLine);

  return {
    file,
    line,
    text: identifierMatch ? `${identifier}: any` : text,
    suggestion,
  };
}

export async function collectHotspots(cwd: string, targets: string[] = []): Promise<HotspotReport> {
  const previousCwd = process.cwd();
  const files = resolveCoverageFiles(cwd, targets);

  try {
    process.chdir(cwd);
    const result = await lint('.', {
      strict: false,
      enableCache: false,
      fileCounts: true,
      files,
    });
    const groupedAnys = new Map<string, Array<{ line: number; character: number; text: string }>>();

    for (const entry of result.anys ?? []) {
      const file = path.relative(cwd, path.resolve(cwd, entry.file)) || entry.file;
      const values = groupedAnys.get(file) ?? [];
      values.push({ line: entry.line + 1, character: entry.character, text: entry.text });
      groupedAnys.set(file, values);
    }

    const hotspotFiles = [...result.fileCounts.entries()]
      .map(([rawFile, counts]) => {
        const file = path.relative(cwd, path.resolve(cwd, rawFile)) || rawFile;
        const sourceText = readFileSync(path.join(cwd, file), 'utf8');
        const sourceLines = sourceText.split('\n');
        const details = (groupedAnys.get(file) ?? [])
          .sort((left, right) => left.line - right.line || left.character - right.character)
          .slice(0, 3)
          .map((entry) => {
            const sourceLine = sourceLines[entry.line - 1] ?? '';
            const matches = [...sourceLine.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*any\b/g)];
            const closest = matches
              .map((match) => ({
                identifier: match[1] ?? entry.text,
                distance: Math.abs((match.index ?? 0) - entry.character),
              }))
              .sort((left, right) => left.distance - right.distance)[0];

            return buildDetail(
              file,
              entry.line,
              closest?.identifier ?? entry.text,
              closest ? `${closest.identifier}: any` : sourceLine,
            );
          });

        return {
          file,
          correctCount: counts.correctCount,
          totalCount: counts.totalCount,
          percent: calculatePercent(counts.correctCount, counts.totalCount),
          anyCount: groupedAnys.get(file)?.length ?? 0,
          details,
        };
      })
      .filter((entry) => entry.anyCount > 0)
      .sort((left, right) => {
        if (right.anyCount !== left.anyCount) {
          return right.anyCount - left.anyCount;
        }

        if (left.percent !== right.percent) {
          return left.percent - right.percent;
        }

        return left.file.localeCompare(right.file);
      });

    return {
      files: hotspotFiles,
      topOffenders: hotspotFiles.slice(0, 2).map((entry) => path.basename(entry.file)),
    };
  } finally {
    process.chdir(previousCwd);
  }
}

function formatPercent(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

export function formatHotspotReport(report: HotspotReport): string {
  const lines = ['Type Coverage Hotspots:', ''];

  if (report.files.length === 0) {
    lines.push('  No `any` hotspots found.');
    return lines.join('\n');
  }

  report.files.forEach((entry, index) => {
    const summary = [
      `  ${entry.file.padEnd(20)} ${formatPercent(entry.percent)}% typed`,
      index === 0 ? ` (${formatPercent(100 - entry.percent)}% any)  ← worst file` : '',
    ].join('');
    lines.push(summary);

    if (index === 0) {
      for (const detail of entry.details) {
        const suggestion = detail.suggestion ? `  → suggest: ${detail.suggestion}` : '';
        lines.push(`    Line ${detail.line}: ${detail.text}${suggestion}`);
      }
      lines.push('');
    }
  });

  lines.push(`Top offenders: ${report.topOffenders.join(', ')}${report.topOffenders.length > 0 ? ' (focus here for biggest gain)' : ''}`);
  return lines.join('\n');
}
