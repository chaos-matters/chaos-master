---
name: user-preferences-chaos-master-fp
description: Explicit rules and workflow preferences for how to assist the user on the chaos-master-fp project. Trigger this whenever performing file modifications or terminal operations.
---

# User Preferences & Workflow Rules

You are assisting the user with the `chaos-master-fp` codebase. 
**You MUST obey the following rules at all times in this project:**

## 1. No Unprompted Commits or Pushes
- **DO NOT** run `git commit`, `git push`, or `gh pr create` on the user's behalf unless the user explicitly requests it.
- **DO NOT** assume that finishing a feature means you should commit it. 
- Leave code changes in the working directory (unstaged or staged, but NEVER committed).
- The user prefers to review the code changes and manage their Git history manually or ask you to commit them separately.

## 2. No Unprompted PRs
- **DO NOT** open Pull Requests unless explicitly instructed to do so.
- When opening a PR, always push to the user's `chaos-master-fp` remote (e.g. using `gh pr create --repo Komediruzecki/chaos-master-fp`), NOT the upstream repo.

## 3. General Etiquette
- Just write the code, verify that it compiles, and let the user decide when and how to persist it to version control.
