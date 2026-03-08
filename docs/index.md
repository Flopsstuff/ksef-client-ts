---
layout: home

hero:
  name: ksef-client-ts
  text: TypeScript KSeF Client
  tagline: Full-featured client for the Polish National e-Invoice System (KSeF) API v2
  actions:
    - theme: brand
      text: Get Started
      link: /authentication
    - theme: alt
      text: API Reference
      link: /api-reference
    - theme: alt
      text: GitHub
      link: https://github.com/Flopsstuff/ksef-client-ts

features:
  - title: Complete API Coverage
    details: Authentication, sessions, invoices, permissions, tokens, certificates, QR codes, and more.
  - title: Built-in Cryptography
    details: AES-256-CBC, RSA-OAEP, ECDH, XAdES-B signatures, and self-signed certificate generation using Node.js native crypto.
  - title: Zero HTTP Dependencies
    details: Uses native fetch (Node 18+) with no external HTTP libraries. Dual ESM/CJS output via tsup.
---
