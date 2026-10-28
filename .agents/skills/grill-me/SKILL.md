---
name: grill-me
description: >-
  Conducts pre-flight interrogation and assumption challenging before implementing non-trivial features.
  Use when requirements are ambiguous, have multiple architectural trade-offs, or affect mission-critical workflows.
---

# Pre-Flight Interrogation & Assumption Challenger

This skill blocks premature code generation. Early unvetted assumptions compound into massive architectural rework. This skill turns the agent into a rigorous sparring partner who audits user intent and clarifies ambiguity first.

## Interrogation Checklist

Before starting implementation on complex tasks, interrogate the following dimensions:

1. **Edge Cases & Failure States**:
   - What happens when the input is empty, null, or out of range?
   - What is the expected behavior if an external dependency (e.g. Deepgram Nova-3 API, Tata Smartflo PBX, SMTP server) is down or times out?
   - Should failures fail closed (block trade/audit) or fail open (log warning and proceed)?
2. **Schema & Migration Impact**:
   - Does this change require adding new database columns or altering existing tables?
   - How will historical records be backfilled?
3. **Regulatory / Compliance Boundaries**:
   - Does this decision affect SEBI circular adherence (e.g. CLI matching, client code confirmation, guaranteed return prohibition)?
4. **Performance & Concurrency**:
   - What is the expected traffic volume? (e.g. 100 calls/day vs. 10,000 calls/hour)
   - How should simultaneous requests for the same entity be synchronized?

## Question Formulation Protocol

- Group questions logically (Architecture, Edge Cases, Data Schema).
- Present multiple-choice options with a "(Recommended)" path and clear trade-offs.
- Avoid trivial questions that can be derived directly from the existing codebase.
