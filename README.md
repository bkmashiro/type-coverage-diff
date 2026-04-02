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
```

### Options

```text
type-coverage-diff [options]
  --base <ref>        Base branch/commit (default: main)
  --threshold <pct>   Max allowed coverage drop % (default: 1.0)
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
5. Diffs the detailed `any` locations and reports the coverage delta.
