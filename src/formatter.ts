import chalk from 'chalk';
import type { CoverageDiff, DiffEntry } from './diff.js';

function signNumber(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function statusIcon(diff: CoverageDiff): string {
  return diff.failed ? '⚠' : '✓';
}

function formatEntry(entry: DiffEntry): string {
  return `  ${entry.file}:${entry.line}:${entry.character}    ${entry.text}`;
}

export function formatDiff(diff: CoverageDiff, baseRef: string, currentRef: string): string {
  const lines: string[] = [];

  lines.push(`Comparing type coverage: ${baseRef} → ${currentRef}`);
  lines.push('');
  lines.push(`  Before: ${diff.before.percent.toFixed(1)}%  (${diff.before.correctCount} typed / ${diff.before.totalCount} total)`);
  lines.push(`  After:  ${diff.after.percent.toFixed(1)}%  (${diff.after.correctCount} typed / ${diff.after.totalCount} total)`);
  lines.push(
    `  Change: ${signNumber(diff.change)}%  ${statusIcon(diff)} (threshold: -${diff.threshold.toFixed(1)}%)`,
  );

  if (diff.addedAnys.length > 0) {
    lines.push('');
    lines.push(chalk.yellow(`New \`any\` introduced (${diff.addedAnys.length}):`));
    lines.push(...diff.addedAnys.map(formatEntry));
  }

  if (diff.removedAnys.length > 0) {
    lines.push('');
    lines.push(chalk.green(`\`any\` removed (${diff.removedAnys.length}):`));
    lines.push(...diff.removedAnys.map(formatEntry));
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
