import { execFileSync } from 'node:child_process';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function ensureGitRepository(cwd: string): void {
  git(cwd, ['rev-parse', '--is-inside-work-tree']);
}

export function resolveRef(cwd: string, ref: string): string {
  return git(cwd, ['rev-parse', '--verify', ref]);
}

export function getCurrentRef(cwd: string): string {
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export function getCurrentCheckoutTarget(cwd: string): string {
  try {
    return git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    return git(cwd, ['rev-parse', 'HEAD']);
  }
}

export function hasWorkingTreeChanges(cwd: string): boolean {
  return git(cwd, ['status', '--porcelain']).length > 0;
}

export function stashPush(cwd: string): string | null {
  if (!hasWorkingTreeChanges(cwd)) {
    return null;
  }

  const marker = `type-coverage-diff-${Date.now()}`;
  git(cwd, ['stash', 'push', '--include-untracked', '--message', marker]);
  return marker;
}

export function stashPopByMessage(cwd: string, marker: string): void {
  const stashList = git(cwd, ['stash', 'list']);
  const stashRef = stashList
    .split('\n')
    .find((line) => line.includes(marker))
    ?.split(':', 1)[0];

  if (stashRef) {
    git(cwd, ['stash', 'pop', '--index', stashRef]);
  }
}

export function checkoutRef(cwd: string, ref: string): void {
  git(cwd, ['checkout', '--quiet', ref]);
}
