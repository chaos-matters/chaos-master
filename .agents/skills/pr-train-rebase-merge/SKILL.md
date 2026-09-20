---
name: pr-train-rebase-merge
description: 'Workflow and lessons learned for reviewing, rebasing, verifying, and rebase-merging stacked PR trains (PR A -> main, PR B -> PR A, PR C -> PR B, etc.) sequentially using git and the gh CLI without duplicate commit replays or false conflicts.'
---

# PR Train Rebase-Merge Workflow

This skill documents the step-by-step workflow and hard-won lessons for merging stacked PR trains into `main` using a strict rebase-merge strategy.

## Context: The Stacked PR Problem

When multiple PRs are developed as a dependent stack:

- PR 1 targets `main`
- PR 2 targets PR 1's branch
- PR 3 targets PR 2's branch

When PR 1 is rebase-merged into `main` on GitHub:

1. GitHub cherry-picks/rebases PR 1's commits onto `main`, assigning them **new commit SHAs**.
2. PR 2's branch still contains PR 1's **old commit SHAs**.
3. If you run a naive `git rebase main` on PR 2, git attempts to re-apply PR 1's old commits on top of PR 1's new commits already in `main`, causing false merge conflicts and duplicate commit history.
4. Furthermore, PR 2 on GitHub is marked as `CONFLICTING` because its target base was PR 1's branch or has mismatched commit ancestry.

---

## The Sequential Rebase-Merge Protocol

Always process the train strictly from bottom to top (PR 1 -> PR 2 -> ... -> PR N).

### Step 1: Review & Audit

1. Inspect the PR diff, commit history, and test coverage:
   ```bash
   gh pr diff <PR_NUMBER>
   gh pr view <PR_NUMBER> --json commits,baseRefName,headRefName
   ```
2. Verify code quality, reactivity caveats (e.g. SolidJS reactive tracking, unkeyed vs keyed mounts), accessibility, and design guidelines.
3. If fixes are needed, apply them, test locally, and push before merging.

### Step 2: Merge the Root PR (if already up-to-date)

For PR 1 (targeting `main`):

```bash
gh pr merge <PR_NUMBER> --rebase
```

### Step 3: Advance to the Next Stacked PR

For each subsequent PR (PR 2, PR 3, etc.):

#### A. Retarget Base Branch to `main`

Retarget the PR's destination base on GitHub:

```bash
gh pr edit <PR_NUMBER> --base main
```

#### B. Fetch Updated Remote State

```bash
git fetch origin
```

#### C. Checkout the PR Branch

```bash
git checkout <BRANCH_NAME>
```

#### D. Surgical Rebase using `--onto`

Identify the commit SHA representing the tip of the **previous base** before it was rebased into `main` (the last commit of the parent PR before your current PR's commits):

```bash
git log -n 10 --oneline
```

Execute the rebase onto `origin/main` skipping the parent commits:

```bash
git rebase --onto origin/main <OLD_PARENT_TIP_SHA> <BRANCH_NAME>
```

#### E. Verify Local Build, Types, and Tests

Always run local validation to catch any integration breakage caused by changes in `main`:

```bash
pnpm typecheck
pnpm test # or targeted vitest runs
```

#### F. Ensure Commit Authorship Rules

Verify commit author and ensure no unauthorized trailers (`Co-Authored-By`) exist:

```bash
git log -n 5 --pretty=fuller
```

#### G. Force Push with Lease

Update the remote branch:

```bash
git push origin <BRANCH_NAME> --force-with-lease
```

#### H. Verify GitHub PR Mergeability

Confirm GitHub has refreshed the PR status to `MERGEABLE`:

```bash
gh pr view <PR_NUMBER> --json state,mergeable,baseRefName,headRefName
```

#### I. Rebase Merge into Main

```bash
gh pr merge <PR_NUMBER> --rebase
```

#### J. Update Local `main`

```bash
git checkout main && git pull origin main
```

#### K. Repeat

Repeat Steps 3.A through 3.J for the next PR in the stack.

---

## Lessons Learned & Best Practices

1. **Explicit Commit Bounds with `--onto`**:
   Never rely on automatic git rebase resolution when branches were stacked. Always find `<OLD_PARENT_TIP_SHA>` and use `git rebase --onto origin/main <OLD_PARENT_TIP_SHA> <BRANCH_NAME>`.

2. **Wait for GitHub Mergeability Cache**:
   After force-pushing with lease, GitHub may take 2-5 seconds to recalculate mergeability. Always check `gh pr view <PR_NUMBER> --json mergeable` before executing `gh pr merge --rebase` to avoid race conditions.

3. **Pre-push Hooks Awareness**:
   If the repository has husky or git pre-push hooks running linters or typechecks, running `pnpm typecheck` before `git push` ensures you don't encounter sudden push rejections.

4. **Preserve Sole Authorship**:
   Never append `Co-Authored-By` trailers. Ensure `git config user.name` and `git config user.email` match user preferences before creating or amending commits.

5. **No Emojis**:
   Ensure commit messages and PR merge descriptions remain clean and professional with zero emojis.
