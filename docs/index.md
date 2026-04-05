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
  - title: Complete API Coverage
    details: KSeF API v2.3.0 — auth, sessions, invoices, permissions, tokens, certificates, QR codes, and more. All types aligned with the official OpenAPI spec.
  - title: Offline Invoice Mode
    details: Full lifecycle for all 4 KSeF offline modes (offline24, offline, awaryjny, awaria_calkowita). Generate invoices locally with QR KOD I + KOD II signing, store in ~/.ksef/offline/, track deadlines with business day calculation, submit when available, and handle technical corrections.
  - title: Full-Featured CLI
    details: 15 command groups, 60+ subcommands. Auth, sessions, invoices, offline, batch upload, incremental export, permissions, tokens, certificates, QR codes, health checks, and shell completion.
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
  - title: Invoice XML Validation
    details: Three-level client-side validation against official KSeF XSD schemas — well-formedness, schema structure (via generated Zod validators), and business rules (NIP/PESEL checksums, future date rejection). Supports all 6 invoice types with auto-detection. CLI batch validation, programmatic API, and opt-in pre-send validation in workflows.
  - title: Typed Errors & Fluent Builders
    details: KSeFError hierarchy with specific classes for 401, 403, 429, and validation errors. Fluent request builders catch mistakes at compile time before they hit the network.
  - title: Comprehensive Test Coverage
    details: 1400+ Vitest unit and E2E tests across HTTP, crypto, services, workflows, builders, and CLI. CI runs the full suite on every change so regressions are caught early.
  - title: Interactive Setup Wizard
    details: Get started in one command — ksef setup walks you through environment selection, NIP configuration, external signature authentication, and API token generation. Credentials are securely stored in ~/.ksef/credentials.json.
  - title: Zero HTTP Dependencies
    details: Uses native fetch (Node 18+) with no external HTTP libraries. Dual ESM/CJS output via tsup. Resilient transport with exponential backoff retry, token bucket rate limiting, and presigned URL validation.
---
