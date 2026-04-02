import chalk from 'chalk';
import type { CoverageDiff, DiffEntry } from './diff.js';

function signNumber(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function statusIcon(diff: CoverageDiff): string {
  return diff.failed ? '⚠' : '✓';
}

function violationLabel(entry: DiffEntry): string {
  switch (entry.kind) {
    case 'as-any':
      return 'as any cast';
    case 'ts-ignore':
      return '@ts-ignore';
    case 'ts-expect-error':
      return '@ts-expect-error';
    default:
      return '`any`';
  }
}

function formatEntry(entry: DiffEntry): string {
  return `  ${entry.file}:${entry.line}:${entry.character}    ${entry.text} (${violationLabel(entry)})`;
}

function formatStrictSummary(label: string, percent: number, asAnyCount: number, suppressions: number): string {
  return `${label.padEnd(16)} ${percent.toFixed(1)}% coverage, ${asAnyCount} as-any casts, ${suppressions} ts-suppresses`;
}

export function formatDiff(diff: CoverageDiff, baseRef: string, currentRef: string): string {
  const lines: string[] = [];

  lines.push(`Comparing type coverage: ${baseRef} → ${currentRef}`);
  lines.push('');
  if (diff.after.strict) {
    lines.push('Strict mode: counting `as any` casts and TypeScript suppression comments');
    lines.push('');
    lines.push(
      formatStrictSummary(
        `Base (${baseRef}):`,
        diff.before.basePercent,
        diff.before.counts['as-any'],
        diff.before.counts['ts-ignore'] + diff.before.counts['ts-expect-error'],
      ),
    );
    lines.push(
      formatStrictSummary(
        'Current:',
        diff.after.basePercent,
        diff.after.counts['as-any'],
        diff.after.counts['ts-ignore'] + diff.after.counts['ts-expect-error'],
      ),
    );
    lines.push('');
    lines.push(
      `Strict score: ${diff.after.percent.toFixed(1)}% (${signNumber(diff.after.percent - diff.after.basePercent)}% with strict mode)`,
    );
    lines.push(
      `Strict change: ${signNumber(diff.change)}%  ${statusIcon(diff)} (threshold: -${diff.threshold.toFixed(1)}%)`,
    );
  } else {
    lines.push(`  Before: ${diff.before.percent.toFixed(1)}%  (${diff.before.correctCount} typed / ${diff.before.totalCount} total)`);
    lines.push(`  After:  ${diff.after.percent.toFixed(1)}%  (${diff.after.correctCount} typed / ${diff.after.totalCount} total)`);
    lines.push(
      `  Change: ${signNumber(diff.change)}%  ${statusIcon(diff)} (threshold: -${diff.threshold.toFixed(1)}%)`,
    );
  }

  if (diff.addedViolations.length > 0) {
    lines.push('');
    lines.push(chalk.yellow(diff.after.strict ? `New violations (${diff.addedViolations.length}):` : `New \`any\` introduced (${diff.addedViolations.length}):`));
    lines.push(...diff.addedViolations.map(formatEntry));
  }

  if (diff.removedViolations.length > 0) {
    lines.push('');
    lines.push(chalk.green(diff.after.strict ? `Resolved violations (${diff.removedViolations.length}):` : `\`any\` removed (${diff.removedViolations.length}):`));
    lines.push(...diff.removedViolations.map(formatEntry));
  }

  lines.push('');
  if (diff.failed) {
    lines.push(chalk.red('❌ Coverage dropped below threshold. Exit code 1.'));
  } else {
    lines.push(chalk.green('✓ Coverage is within threshold.'));
  }

  return lines.join('\n');
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
