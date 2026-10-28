---
name: tdd-workflows
description: >-
  Enforces a strict Test-Driven Development (Red-Green-Refactor) loop.
  Use when writing new business logic, fixing bugs, refactoring core engines, or verifying regulatory scoring rules.
---

# Test-Driven Development (TDD) Protocol

This skill enforces verification before implementation. Autonomous agents hallucinate and drift when they lack an automated source of truth. With this skill, test suites serve as the non-negotiable contract.

## The Red-Green-Refactor Lifecycle

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 1. RED          │ ───►  │ 2. GREEN        │ ───►  │ 3. REFACTOR     │
│ Write failing   │       │ Write minimal   │       │ Clean up debt   │
│ test contract   │       │ code to pass    │       │ Keep green      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Phase 1: RED (Failing Test First)
1. Before modifying production code, write a unit or integration test reproducing the bug or defining the required capability.
2. Run the test runner (e.g. `npx tsx tests/<test-name>.ts` or `npm test`).
3. Confirm that the test **fails for the expected reason** (not a syntax error or missing import).
4. Do not proceed to implementation until the failure is established.

### Phase 2: GREEN (Minimal Implementation)
1. Write the minimum amount of production code needed to make the failing test pass.
2. Avoid premature optimization or implementing speculative features ("YAGNI").
3. Re-run the test runner until the suite passes cleanly with exit code 0.

### Phase 3: REFACTOR (Surgical Clean-up)
1. Review the passing code for readability, type safety, and architectural boundaries.
2. Remove duplication and improve performance without altering the external contract.
3. Re-run all existing test suites to ensure zero regressions in caller modules.

## Testing Standards for This Codebase

- **Deterministic Invariants**: Every regulatory compliance test (e.g. Q1-Q5 scoring) must use deterministic fixtures.
- **Fail-Closed Assertions**: Tests must verify that missing data, malformed inputs, and unauthorized tokens fail closed (`FAIL` or `FATAL`), never defaulting to `PASS`.
- **Zero Mock Overuse**: Prefer fast in-memory SQLite fixtures (`new DatabaseSync(':memory:')`) over deeply nested synthetic mocks.
