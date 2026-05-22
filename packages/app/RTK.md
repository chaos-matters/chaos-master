# RTK - Developer Workflow Guidelines

## ⚠️ CRITICAL RULES

### 1. NEVER Remove Code to Pass Linters

**You must NEVER** modify or remove code just to fix linting errors. If code is well-written but doesn't pass linters:

1. **Option A: Fix the actual issue**
   - Find and fix the root cause of the lint error
   - Example: use better variable naming instead of `e` catch clause
   - Example: use proper typing instead of `any` type assertions

2. **Option B: Add explicit eslint-disable comments**
   - Only use `eslint-disable-next-line` or `eslint-disable`
   - Must include the specific rule name (e.g., `@typescript-eslint/no-explicit-any`)
   - Include a brief comment explaining WHY this is necessary
   - Example:
     ```typescript
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const data = someExternalLibrary() // Third-party lib doesn't export typed interfaces
     ```

3. **Option C: Add FIXME comment with detailed explanation**
   - Use `// FIXME:` prefix
   - Include:
     - The problem description
     - Why it can't be fixed yet (constraint, complexity, temporary workaround)
     - Expected fix in future (if known)
   - Example:
     ```typescript
     // FIXME: TypeScript strict mode issues - valibot union types with brand types
     // Currently need to use type assertions to bridge FlameSchemaDescriptor and timeline types
     // Expected fix: Create proper type adapters once valibot supports brand unions better
     const flame = someFunction() // Type assertion needed for now
     ```

**NEVER** do any of these:

- ❌ Comment out valid code to make linter happy
- ❌ Delete carefully written logic
- ❌ Change working code to pass linters
- ❌ Remove error handling just to avoid warnings

### 2. GitHub CLI Usage

All GitHub operations MUST use `gh` CLI:

```bash
gh pr create ...
gh pr list ...
gh pr view ...
gh pr close ...
gh pr review ...
```

### 3. Testing Requirements

Before marking any task complete:

1. **Run all linters**

   ```bash
   npm run lint
   npm run typecheck
   npm run format:check  # if available
   ```

2. **Run tests**

   ```bash
   npm test
   npm run test:ui
   ```

3. **Check for runtime errors**
   - No console errors in tests
   - No unexpected behavior
   - Test edge cases

4. **Only push when** all checks pass

### 4. Push to Remote

**ALWAYS** push your work to remote before finishing:

```bash
git add -A
git commit -m "Commit message"
git push origin <branch-name>
```

### 5. Always Check Linting/Formatting/TypeChecking

Before pushing:

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm run format:check  # Code formatting
npm test              # Run tests
```

All checks must pass before committing or pushing.

## Meta Commands

All other standard git/development commands can use `rtk` prefix for token savings:

- `rtk git status`
- `rtk git add`
- `rtk git commit`
- `rtk npm test`

## Workflow Summary

1. ✅ Write code
2. ✅ Run linters → if errors, FIX THEM properly (not by removing code)
3. ✅ Run typecheck → if errors, fix properly or add FIXME
4. ✅ Run tests → ensure all pass
5. ✅ Commit and push to remote
6. ✅ Create PR with `gh pr create`

## Documentation

This file documents critical workflow rules that must be followed. All team members should understand and follow these guidelines.
