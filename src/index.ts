#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { runCoverage } from './coverage.js';
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

interface CliOptions {
  base: string;
  threshold: string;
  json?: boolean;
  fail: boolean;
  cwd: string;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('type-coverage-diff')
    .description('Show TypeScript any coverage changes between two git refs')
    .option('--base <ref>', 'Base branch/commit', 'main')
    .option('--threshold <pct>', 'Max allowed coverage drop %', '1.0')
    .option('--json', 'Output JSON')
    .option('--no-fail', "Don't exit 1 on regression")
    .option('--cwd <path>', 'Project directory', process.cwd())
    .parse(process.argv);

  const options = program.opts<CliOptions>();
  const cwd = path.resolve(options.cwd);
  const threshold = Number(options.threshold);

  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(`Invalid threshold: ${options.threshold}`);
  }

  ensureGitRepository(cwd);
  const baseRef = resolveRef(cwd, options.base);
  const currentRef = resolveRef(cwd, 'HEAD');
  const currentCheckoutTarget = getCurrentCheckoutTarget(cwd);
  const currentLabel = getCurrentRef(cwd);
  const stashMarker = stashPush(cwd);

  try {
    const after = await runCoverage(cwd);
    checkoutRef(cwd, baseRef);

    const before = await runCoverage(cwd);
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
