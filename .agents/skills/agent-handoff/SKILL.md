---
name: agent-handoff
description: >-
  Preserves session state, tracks active blockers, and produces structured handoff artifacts to prevent context rot.
  Use during long-running sessions, before swapping contexts, or when completing major development milestones.
---

# Session State & Handoff Preserver

During long development sessions, large token volumes cause context saturation ("context rot"). This skill cleanly packages progress, architectural state, modified files, and pending items into a structured handoff artifact.

## Handoff Artifact Structure

When performing a handoff or concluding a multi-step milestone, generate a handoff artifact with the following schema:

```markdown
# Session Handoff & State Summary

## 1. Executive Summary
- Brief statement of the problem addressed and current outcome.

## 2. Completed Milestones
- [x] Feature / fix A (verified with test suite)
- [x] Schema migration B applied

## 3. Active Work in Progress & Blockers
- [ ] Task C (current line of execution)
- Blocker / Pending decision: <details>

## 4. Modified Files & Impact Matrix
| File Path | Description of Change | Caller Modules Verified |
|---|---|---|
| `server/pipeline/audit.ts` | Strict Q2 UCC prefix enforcement | `compliance-strictness-suite.ts` |

## 5. Verification Commands
- Commands to immediately verify system state:
  ```bash
  npm run lint
  npx tsx tests/<suite>.ts
  ```
```

## Anti-Rot Guidelines

- Never assume the next agent session will remember unwritten decisions.
- Record exact git branch, commit hash, and database state.
- Keep notes concise, factual, and backed by verifiable test commands.
