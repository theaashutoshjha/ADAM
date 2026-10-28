---
name: c4-architecture
description: >-
  Enforces principal-level systems design and C4-model architectural planning before writing code.
  Use when designing new modules, services, API boundaries, database models, or major architectural refactors.
---

# C4 Architecture & System Design Protocol

This skill enforces structured, principal-architect-grade system design before writing implementation code.
It prevents hasty, unstructured code generation by establishing service boundaries, data models, and API contracts first.

## Core Rules

1. **Never write implementation code without an approved architectural specification artifact.**
2. **Context & Boundaries First**: Clearly define System Context (Level 1) and Container Boundaries (Level 2) before diving into Components (Level 3) or Code (Level 4).
3. **Data Schemas & Contracts Before Logic**: Define database schemas, DTOs, and REST/WebSocket/gRPC payload contracts with strict Zod validation before creating routes or services.
4. **Failure Modes by Design**: Every design must document at least 3 failure states:
   - Network / timeout drops
   - Data corruption / schema evolution mismatches
   - Concurrency / resource exhaustion vectors

## Architectural Workflow

### Phase 1: Context & Container Map (C4 Level 1 & Level 2)
When tasked with building or refactoring a subsystem:
- Identify primary Actors (e.g. Compliance Dealer, Trading Desk Admin, PBX Ingestion Worker).
- Map System Boundaries: Document external systems (e.g. Tata Smartflo CDR, Deepgram Nova-3, SQLite WAL / PostgreSQL).
- Draw a Mermaid diagram depicting data flow and network protocols.

### Phase 2: Component Breakdown (C4 Level 3)
- Decompose the container into discrete single-responsibility components (e.g. `AudioDSPPreprocessor`, `AuthoritativeUccResolver`, `ScorecardDispatcher`).
- Define explicit interface contracts between components using TypeScript interfaces or types.
- Disallow circular dependencies between domain services.

### Phase 3: Contract Specification & Verification
- Document request/response contracts using OpenAPI or typed Zod schemas.
- Specify HTTP status codes, error models, and retry semantics.
- Verify backward compatibility with existing clients.
