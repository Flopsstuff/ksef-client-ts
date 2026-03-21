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
    details: Authentication, sessions, invoices, permissions, tokens, certificates, QR codes, and more.
  - title: Full-Featured CLI
    details: 14 command groups, 60+ subcommands. Config, auth, sessions, invoices, permissions, tokens, certificates, limits, Peppol, QR codes, health checks, and shell completion.
  - title: Full Documentation
    details: VitePress site with Quick Start, interactive API reference, and the full OpenAPI spec—everything you need to integrate without guesswork.
  - title: OpenAPI Aligned
    details: All types verified against the official KSeF OpenAPI spec. Full spec and per-domain chunks included in docs/.
  - title: Comprehensive Test Coverage
    details: Vitest unit tests across HTTP, crypto, services, and builders; CI runs the suite on every change so regressions are caught early.
  - title: Zero HTTP Dependencies
    details: Uses native fetch (Node 18+) with no external HTTP libraries. Dual ESM/CJS output via tsup.
  - title: Built-in Cryptography
    details: AES-256-CBC, RSA-OAEP, ECDH, XAdES-B signatures, and self-signed certificate generation using Node.js native crypto.
  - title: Automatic Token Management
    details: AuthManager handles token injection, automatic 401 refresh with dedup, and high-level loginWithToken() loginWithCertificate() API.
  - title: Typed Errors & Fluent Builders
    details: KSeFError hierarchy (401, 403, 429, validation) plus request builders that catch mistakes before they hit the network.
---
