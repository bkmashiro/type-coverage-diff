import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface CoverageHistoryEntry {
  date: string;
  percentage: number;
  commit: string;
}

export interface TrendReportEntry extends CoverageHistoryEntry {
  label: string;
  delta: number | null;
}

export interface TrendReport {
  entries: TrendReportEntry[];
  overallChange: number;
  totalDays: number;
  direction: 'improving' | 'regressing' | 'flat';
}

const HISTORY_FILE = '.type-coverage-history.json';

function historyPath(cwd: string): string {
  return path.join(cwd, HISTORY_FILE);
}

function sortEntries(entries: CoverageHistoryEntry[]): CoverageHistoryEntry[] {
  return [...entries].sort((left, right) => left.date.localeCompare(right.date));
}

export function readCoverageHistory(cwd: string): CoverageHistoryEntry[] {
  const filePath = historyPath(cwd);

  if (!existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as CoverageHistoryEntry[];
  return sortEntries(parsed);
}

export function writeCoverageHistory(cwd: string, entries: CoverageHistoryEntry[]): void {
  writeFileSync(historyPath(cwd), `${JSON.stringify(sortEntries(entries), null, 2)}\n`);
}

export function updateCoverageHistory(cwd: string, entry: CoverageHistoryEntry): CoverageHistoryEntry[] {
  const existingEntries = readCoverageHistory(cwd);
  const nextEntries = existingEntries.filter((item) => !(item.commit === entry.commit && item.date === entry.date));

  nextEntries.push(entry);
  writeCoverageHistory(cwd, nextEntries);
  return sortEntries(nextEntries);
}

function differenceInDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function summarizeDirection(change: number): TrendReport['direction'] {
  if (change > 0) {
    return 'improving';
  }

  if (change < 0) {
    return 'regressing';
  }

  return 'flat';
}

export function createTrendReport(entries: CoverageHistoryEntry[], trendDays?: number): TrendReport {
  const sortedEntries = sortEntries(entries);
  const filteredEntries =
    typeof trendDays === 'number' && trendDays > 0 && sortedEntries.length > 0
      ? sortedEntries.filter((entry) => differenceInDays(entry.date, sortedEntries.at(-1)!.date) < trendDays)
      : sortedEntries;
  const reportEntries = filteredEntries.map((entry, index) => {
    const previousEntry = filteredEntries[index - 1];
    return {
      ...entry,
      label: index === filteredEntries.length - 1 ? 'today' : entry.date,
      delta: previousEntry ? Number((entry.percentage - previousEntry.percentage).toFixed(1)) : null,
    };
  });
  const firstEntry = filteredEntries[0];
  const lastEntry = filteredEntries.at(-1);
  const overallChange =
    firstEntry && lastEntry ? Number((lastEntry.percentage - firstEntry.percentage).toFixed(1)) : 0;
  const totalDays = firstEntry && lastEntry ? differenceInDays(firstEntry.date, lastEntry.date) : 0;

  return {
    entries: reportEntries,
    overallChange,
    totalDays,
    direction: summarizeDirection(overallChange),
  };
}

function formatDelta(delta: number | null): string {
  if (delta === null) {
    return 'baseline';
  }

  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function directionIcon(direction: TrendReport['direction']): string {
  switch (direction) {
    case 'improving':
      return '✅';
    case 'regressing':
      return '⚠';
    default:
      return '•';
  }
}

export function formatTrendReport(report: TrendReport): string {
  const lines = ['Type coverage history:'];

  for (const entry of report.entries) {
    const suffix = entry.delta !== null && entry.delta < 0 ? ' ⚠ regression' : '';
    lines.push(`  ${entry.label.padEnd(10)} ${entry.percentage.toFixed(1)}%  ${formatDelta(entry.delta)}${suffix}`);
  }

  lines.push('');
  lines.push(
    `Overall trend: ${report.overallChange > 0 ? '+' : ''}${report.overallChange.toFixed(1)}% in ${report.totalDays} days ${directionIcon(report.direction)} ${report.direction}`,
  );

  return lines.join('\n');
}
