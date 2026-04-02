#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { applySimpleFixes, formatAutoFixReport } from './auto-fix.js';
import { resolveCoverageFiles, runCoverage } from './coverage.js';
import { diffCoverage } from './diff.js';
import { formatDiff, formatJson } from './formatter.js';
import {
  checkoutRef,
  ensureGitRepository,
  getCurrentCheckoutTarget,
  getCurrentRef,
  resolveRef,
  stashPopByMessage,
  stashPush,
} from './git.js';
import { collectHotspots, formatHotspotReport } from './hotspots.js';
import { createTrendReport, formatTrendReport, updateCoverageHistory } from './trend.js';

interface CliOptions {
  base: string;
  threshold: string;
  trend?: boolean;
  trendDays?: string;
  strict?: boolean;
  json?: boolean;
  hotspots?: boolean;
  fixSimple?: boolean;
  fail: boolean;
  cwd: string;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('type-coverage-diff')
    .description('Show TypeScript any coverage changes between two git refs')
    .argument('[paths...]', 'Optional file or directory filters')
    .option('--base <ref>', 'Base branch/commit', 'main')
    .option('--threshold <pct>', 'Max allowed coverage drop %', '1.0')
    .option('--trend', 'Show coverage history and overall trend')
    .option('--trend-days <n>', 'Only show the last N days of trend history')
    .option('--hotspots', 'Show files with the highest concentration of `any` types')
    .option('--fix-simple', 'Auto-fix obvious `any` annotations using safe inference')
    .option('--strict', 'Count `as any`, `@ts-ignore`, and `@ts-expect-error` as violations')
    .option('--json', 'Output JSON')
    .option('--no-fail', "Don't exit 1 on regression")
    .option('--cwd <path>', 'Project directory', process.cwd())
    .parse(process.argv);

  const options = program.opts<CliOptions>();
  const paths = program.args;
  const cwd = path.resolve(options.cwd);
  const files = resolveCoverageFiles(cwd, paths);
  const threshold = Number(options.threshold);
  const trendDays =
    typeof options.trendDays === 'string' && options.trendDays.length > 0 ? Number(options.trendDays) : undefined;

  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(`Invalid threshold: ${options.threshold}`);
  }

  if (trendDays !== undefined && (!Number.isInteger(trendDays) || trendDays <= 0)) {
    throw new Error(`Invalid trend days: ${options.trendDays}`);
  }

  if (options.hotspots && options.fixSimple) {
    throw new Error('Choose either --hotspots or --fix-simple, not both');
  }

  if (options.hotspots) {
    const report = await collectHotspots(cwd, paths);
    process.stdout.write(`${options.json ? formatJson(report) : formatHotspotReport(report)}\n`);
    return;
  }

  if (options.fixSimple) {
    const report = await applySimpleFixes(cwd, paths);
    process.stdout.write(`${options.json ? formatJson(report) : formatAutoFixReport(report)}\n`);
    return;
  }

  ensureGitRepository(cwd);

  if (options.trend) {
    const summary = await runCoverage(cwd, { files });
    const history = updateCoverageHistory(cwd, {
      date: new Date().toISOString().slice(0, 10),
      percentage: summary.percent,
      commit: resolveRef(cwd, 'HEAD'),
    });
    const report = createTrendReport(history, trendDays);

    process.stdout.write(`${options.json ? formatJson(report) : formatTrendReport(report)}\n`);
    return;
  }

  const baseRef = resolveRef(cwd, options.base);
  const currentRef = resolveRef(cwd, 'HEAD');
  const currentCheckoutTarget = getCurrentCheckoutTarget(cwd);
  const currentLabel = getCurrentRef(cwd);
  const stashMarker = stashPush(cwd);

  try {
    const after = await runCoverage(cwd, { strict: options.strict, files });
    checkoutRef(cwd, baseRef);

    const before = await runCoverage(cwd, { strict: options.strict, files });
    const diff = diffCoverage(before, after, threshold);

    if (options.json) {
      process.stdout.write(
        `${formatJson({
          base: options.base,
          head: currentRef,
          cwd,
          ...diff,
        })}\n`,
      );
    } else {
      process.stdout.write(`${formatDiff(diff, options.base, currentLabel)}\n`);
    }

    if (options.fail && diff.failed) {
      process.exitCode = 1;
    }
  } finally {
    checkoutRef(cwd, currentCheckoutTarget);
    if (stashMarker) {
      stashPopByMessage(cwd, stashMarker);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
