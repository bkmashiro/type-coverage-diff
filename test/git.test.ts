import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkoutRef,
  ensureGitRepository,
  getCurrentCheckoutTarget,
  getCurrentRef,
  hasWorkingTreeChanges,
  resolveRef,
  stashPopByMessage,
  stashPush,
} from '../src/git.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepository(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'type-coverage-diff-git-'));

  git(cwd, ['init', '--initial-branch=main']);
  git(cwd, ['config', 'user.name', 'Test User']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  writeFileSync(path.join(cwd, 'tracked.txt'), 'initial\n');
  git(cwd, ['add', 'tracked.txt']);
  git(cwd, ['commit', '-m', 'init']);

  return cwd;
}

test('git helpers resolve refs and detect detached HEAD checkouts', () => {
  const repo = createRepository();

  try {
    ensureGitRepository(repo);
    const head = resolveRef(repo, 'HEAD');

    assert.match(head, /^[0-9a-f]{40}$/);
    assert.equal(getCurrentRef(repo), 'main');
    assert.equal(getCurrentCheckoutTarget(repo), 'main');

    checkoutRef(repo, head);

    assert.equal(getCurrentRef(repo), 'HEAD');
    assert.equal(getCurrentCheckoutTarget(repo), head);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('stash helpers round-trip tracked and untracked changes', () => {
  const repo = createRepository();
  const trackedFile = path.join(repo, 'tracked.txt');
  const untrackedFile = path.join(repo, 'new.txt');

  try {
    assert.equal(hasWorkingTreeChanges(repo), false);
    assert.equal(stashPush(repo), null);

    writeFileSync(trackedFile, 'modified\n');
    writeFileSync(untrackedFile, 'created\n');

    assert.equal(hasWorkingTreeChanges(repo), true);

    const marker = stashPush(repo);

    assert.ok(marker);
    assert.equal(hasWorkingTreeChanges(repo), false);
    assert.equal(readFileSync(trackedFile, 'utf8'), 'initial\n');
    assert.equal(existsSync(untrackedFile), false);

    stashPopByMessage(repo, 'missing-marker');
    assert.equal(hasWorkingTreeChanges(repo), false);

    stashPopByMessage(repo, marker);
    assert.equal(hasWorkingTreeChanges(repo), true);
    assert.equal(readFileSync(trackedFile, 'utf8'), 'modified\n');
    assert.equal(readFileSync(untrackedFile, 'utf8'), 'created\n');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
