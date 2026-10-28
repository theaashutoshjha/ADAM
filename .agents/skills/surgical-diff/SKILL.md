---
name: surgical-diff
description: >-
  Enforces minimal mutation discipline and anti-thrash practices.
  Use when fixing bugs, debugging regressions, refactoring specific methods, or applying targeted patches.
---

# Surgical Change & Minimal Mutation Discipline

This skill prevents "drive-by refactoring," code thrash, and accidental regressions. When modifying existing systems, the agent must produce the smallest correct diff that resolves the issue.

## Surgical Protocol Rules

1. **Minimum Viable Diff**:
   - Only edit lines directly related to the fix or requested feature.
   - Never refactor surrounding functions, reorder methods, or rename variables unless explicitly instructed.
2. **Preserve Surrounding Integrity**:
   - Keep existing linting, comments, formatting, docstrings, and imports intact.
   - Do not perform mass formatting changes (e.g. Prettier/ESLint reformats on untouched code) in the same commit.
3. **Trace the Exact Execution Path**:
   - Identify the exact root cause line using breakpoints, logs, or failing test traces before changing code.
   - Avoid "shotgun debugging" (making speculative edits across multiple files in hopes of fixing an issue).
4. **Caller Module Verification**:
   - Before completing a task, check all references and run regression test suites on every caller module that consumes the edited file.
