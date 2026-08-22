---
layout: home

hero:
  name: ksef-client-ts
  text: TypeScript KSeF Client
  tagline: Full-featured client for the Polish National e-Invoice System (KSeF) API v2
  actions:
    - theme: brand
      text: Quick Start
      link: /quick-start
    - theme: alt
      text: API Reference
      link: /api-reference
    - theme: alt
      text: OpenAPI
      link: /openapi
    - theme: alt
      text: GitHub
      link: https://github.com/Flopsstuff/ksef-client-ts

features:
  - title: Full API Coverage
    details: Every KSeF API v2.7.0 endpoint — auth, sessions, invoices, permissions, tokens, certificates, collective identifiers, QR codes, and more. All types aligned with the official OpenAPI spec.
  - title: Collective Identifiers
    details: Group up to 500 invoices issued by one seller under a single settlement reference, so a buyer can settle the whole batch against one payment reference instead of paying invoice by invoice. Look identifiers up by KSeF number, list their member invoices, and handle withheld payment details explicitly.
  - title: Offline Invoice Mode
    details: Full lifecycle for all 4 KSeF offline modes (offline24, offline, awaryjny, awaria_calkowita). Generate invoices locally with QR KOD I + KOD II signing, store in ~/.ksef/offline/, track deadlines with business day calculation, submit when available, and handle technical corrections.
  - title: Full-Featured CLI
    details: 16 command groups, 60+ subcommands. Auth, sessions, invoices, offline, batch upload, incremental export, permissions, tokens, certificates, QR codes, health checks, and shell completion.
  - title: High-Level Workflows
    details: Orchestration functions for auth, online/batch sessions, and invoice export. Handle the full lifecycle — polling, encryption, UPO retrieval — in a single call.
  - title: Built-in Cryptography
    details: AES-256-CBC encryption/decryption, RSA-OAEP key wrapping, ECDH key agreement, XAdES-B envelope signatures, and self-signed certificate generation — all using Node.js native crypto.
  - title: External Signing
    details: Authenticate with externally-signed XAdES XML for HSM, EPUAP, and smart card integration. Callback-based API lets you plug in any signing backend without exposing private keys to the library.
  - title: Automatic Token Management
    details: AuthManager handles access/refresh token injection, automatic 401 refresh with request deduplication, and high-level loginWithToken() / loginWithCertificate() API.
  - title: Streaming Batch Uploads
    details: Stream-based batch upload with constant memory usage via Web Streams API. Built-in ZIP bomb protection with configurable limits on file count, total size, and compression ratio.
  - title: Incremental Export
    details: HWM-based paginated invoice export that handles truncated responses automatically. File-based state persistence lets you resume exports across process restarts without re-downloading.
  - title: Multiple Document Structures
    details: Support for all KSeF document types — FA (2)/(3), PEF (3), PEF_KOR (3), FA_RR (1). Typed FormCode constants, session-type validation, and structured UPO parsing with discriminated unions.
  - title: Invoice XML Serialization
    details: Build XSD-compliant FA2, FA3, PEF, and PEF_KOR XML from typed TypeScript objects. Correct element ordering (including the FA3 per-VAT-rate P_13/P_14/P_14W interleave), natural P_* sort, automatic namespace injection, and pass-through for pre-built XML strings and buffers. The `ksef invoice build` CLI wraps the same pipeline for JSON or YAML input with optional Zod and XSD validation.
  - title: Invoice XML Validation
    details: Three-level client-side validation against official KSeF XSD schemas — well-formedness, schema structure (via generated Zod validators), and business rules (NIP/PESEL checksums, future date rejection). Supports all 6 invoice types with auto-detection. CLI batch validation, programmatic API, and opt-in pre-send validation in workflows.
  - title: Typed Errors with RFC 7807 Problem Details
    details: KSeFError hierarchy with dedicated classes for 400, 401, 403, 410, and 429 carrying structured diagnostic context (trace IDs, required-vs-present permissions, validation error lists). Exhaustive dispatch via the KSeFApiProblem union and assertNever helper. Fluent request builders catch mistakes at compile time before they hit the network.
  - title: Comprehensive Test Coverage
    details: 1400+ Vitest unit and E2E tests across HTTP, crypto, services, workflows, builders, and CLI. CI runs the full suite on every change so regressions are caught early.
  - title: Interactive Setup Wizard
    details: Get started in one command — ksef setup walks you through environment selection, NIP configuration, external signature authentication, and API token generation. Credentials are securely stored in ~/.ksef/credentials.json.
  - title: Zero HTTP Dependencies
    details: Uses native fetch (Node 18+) with no external HTTP libraries. Dual ESM/CJS output via tsup. Resilient transport with exponential backoff retry, token bucket rate limiting, opt-in circuit breaker, and presigned URL validation.
  - title: fs-free Core
    details: The main entry point is free of filesystem access and runs on Node, Deno, and edge runtimes. Node.js-only features (filesystem access, XSD validation) are available via the `ksef-client-ts/node` export, keeping the core library small.
---
