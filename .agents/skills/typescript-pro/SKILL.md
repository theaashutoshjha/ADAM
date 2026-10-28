---
name: typescript-pro
description: >-
  Enforces strict enterprise TypeScript, domain-driven design, and type-level safety.
  Use when writing TypeScript code, defining types, handling API boundaries, or refactoring backend services.
---

# Enterprise TypeScript Standards

This skill enforces strict language standards, robust typing patterns, and defensive programming. It eliminates silent runtime failures, prevents `any` leaks, and ensures enterprise maintainability.

## Non-Negotiable Rules

1. **Strictly Ban `any`**:
   - Use `unknown` for unchecked external inputs, then parse through Zod schemas.
   - Use generics, union types, or discriminating unions instead of `any` or `object`.
2. **Explicit Return Types**:
   - Every exported function, method, and API handler must specify an explicit return type.
3. **Zod Validation at Boundaries**:
   - Validate all incoming network requests (body, query, headers) and external API responses (Deepgram, Tata, Gemini) with Zod.
   - Infer types using `z.infer<typeof Schema>` rather than duplicating interfaces.
4. **Typed Result Objects Over Raw Throwing**:
   - For predictable business logic failures (e.g. matching errors, validation failures), return typed Result objects:
     ```ts
     type Result<T, E = Error> =
       | { ok: true; value: T }
       | { ok: false; error: E };
     ```
5. **Immutability by Default**:
   - Use `readonly` arrays, `as const`, and `Readonly<T>` for reference datasets, status codes, and configuration parameters.
6. **Zero Type Assertion Escapes**:
   - Avoid `as any` or forceful non-null assertions (`!`) unless protected by a preceding type guard or invariant check.
   - Implement user-defined type predicates (`val is TargetType`) where appropriate.

## Architecture Patterns

- **Dependency Injection**: Accept database connections, API clients, and file system abstractions as function parameters or constructor arguments rather than accessing ambient globals.
- **Hexagonal Architecture (Ports & Adapters)**: Keep domain rules (e.g. SEBI 5-point evaluation) pure and decoupled from Express routing or SQLite drivers.
