# Quick Start

Get up and running with `ksef-client-ts` in minutes.

## Installation

```bash
yarn add ksef-client-ts
# or
npm install ksef-client-ts
```

## Basic usage (library)

```typescript
import { KSeFClient } from 'ksef-client-ts';

// 1. Create a client for the TEST environment
const client = new KSeFClient({ environment: 'TEST' });

// 2. Authenticate with an authorization token
await client.loginWithToken('AAAA-BBBB-CCCC-DDDD', '1234567890');

// 3. Use any service — auth headers are injected automatically
const grants = await client.permissions.queryPersonalGrants();
console.log('Permissions:', grants.permissions.length);

// 4. Logout when done
await client.logout();
```

## Basic usage (CLI)

```bash
# Install globally
yarn global add ksef-client-ts

# Configure default NIP
ksef config set --nip 1234567890

# Login
ksef auth login --token "AAAA-BBBB-CCCC-DDDD"

# Check session
ksef auth whoami

# Query invoices
ksef invoices query --date-from 2025-01-01

# Logout
ksef auth logout
```

## Environments

| Environment | When to use |
|---|---|
| `TEST` | Development and integration testing |
| `DEMO` | Pre-production validation |
| `PROD` | Production |

```typescript
const client = new KSeFClient({ environment: 'TEST' });  // or 'DEMO', 'PROD'
```

## Where to get a token

1. Open the KSeF web portal for your environment:
   - TEST: `https://ap-test.ksef.mf.gov.pl`
   - DEMO: `https://ap-demo.ksef.mf.gov.pl`
   - PROD: `https://ap.ksef.mf.gov.pl`
2. Log in with Trusted Profile or qualified signature
3. Navigate to token management and generate an authorization token

## Next steps

- [Authentication](/authentication) — detailed guide on all auth methods
- [Examples](/examples) — complete code examples for common workflows
- [CLI](/cli) — full CLI command reference
- [API Reference](/api-reference) — library API docs
