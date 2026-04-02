[![npm](https://img.shields.io/npm/v/type-coverage-diff)](https://www.npmjs.com/package/type-coverage-diff) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# type-coverage-diff

`type-coverage-diff` is a CLI that compares TypeScript `any` coverage between two git refs and fails when coverage regresses beyond a configurable threshold.

## Install

```bash
pnpm add -D type-coverage-diff
```

## Usage

```bash
type-coverage-diff --base main
type-coverage-diff --base origin/main --threshold 0.5
type-coverage-diff --base main --json
type-coverage-diff --base main --no-fail
type-coverage-diff --base main --strict
type-coverage-diff --trend
type-coverage-diff --trend-days 30
```

### Options

```text
type-coverage-diff [options]
  --base <ref>        Base branch/commit (default: main)
  --threshold <pct>   Max allowed coverage drop % (default: 1.0)
  --trend             Show coverage history and overall trend
  --trend-days <n>    Only show the last N days of trend history
  --strict            Count `as any`, `@ts-ignore`, and `@ts-expect-error` as violations
  --json              JSON output
  --no-fail           Don't exit 1 on regression
  --cwd <path>        Project directory (default: cwd)
```

## Example Output

```text
Comparing type coverage: main → HEAD

  Before: 87.3%  (1204 typed / 1379 total)
  After:  86.1%  (1197 typed / 1390 total)
  Change: -1.2%  ⚠ (threshold: -1.0%)

New `any` introduced (8):
  src/api.ts:42:1    const res: any = await fetch(...)

`any` removed (3):
  src/utils.ts:12:1    data as any

❌ Coverage dropped below threshold. Exit code 1.
```

### Trend Mode

```text
Type coverage history:
  2024-03-01  82.1%  baseline
  2024-03-05  83.4%  +1.3%
  2024-03-10  86.7%  +3.3%
  today       87.3%  +0.6%

Overall trend: +5.2% in 9 days ✅ improving
```

Trend history is stored in `.type-coverage-history.json` in the project root.

### Strict Mode

```text
Comparing type coverage: main → HEAD

Strict mode: counting `as any` casts and TypeScript suppression comments

Base (main):     87.3% coverage, 3 as-any casts, 2 ts-suppresses
Current:         86.1% coverage, 5 as-any casts, 4 ts-suppresses

Strict score: 83.2% (-2.9% with strict mode)
Strict change: -1.4%  ⚠ (threshold: -1.0%)
```

## GitHub Actions

```yaml
name: type-coverage

on:
  pull_request:

jobs:
  coverage-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 25
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec type-coverage-diff --base origin/main
```

## How It Works

1. Runs `type-coverage-core` against the current checkout with `detail: true`.
2. Temporarily stashes local changes and checks out the base ref.
3. Runs the same analysis on the base ref.
4. Restores the original checkout and stashed changes.
5. In `--strict` mode, also scans source files for `as any`, `@ts-ignore`, and `@ts-expect-error`.
6. Diffs the detailed violations and reports the coverage delta.
