# Code Quality Standards

> **Version:** 1.0  
> **Last Updated:** 2026-02-16  
> **Enforcement:** CI/CD Pipeline

---

## Linting & Formatting

### ESLint Configuration

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["error"] }]
  }
}
```

### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Pre-commit Hooks

Using Husky + lint-staged:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

---

## Testing Requirements

### Coverage Thresholds

| Metric | Minimum | Target |
|--------|---------|--------|
| Statements | 80% | 90% |
| Branches | 75% | 85% |
| Functions | 80% | 90% |
| Lines | 80% | 90% |

### Test Types

```
tests/
├── unit/                   # Unit tests for isolated functions
│   ├── adapters/          # One test file per adapter
│   ├── utils/             # Utility function tests
│   └── types/             # Type validation tests
├── integration/           # Integration tests
│   ├── provider-flows/    # End-to-end provider flows
│   └── mcp-protocol/      # MCP protocol compliance
└── fixtures/              # Test data
    ├── transactions.json
    ├── config.json
    └── responses/         # Mock API responses
```

### Required Tests

1. **Unit Tests for All Adapters**
   - Configuration validation
   - Error handling paths
   - Response mapping
   - Authentication flow

2. **Integration Tests for Happy Paths**
   - Full transaction flow
   - Webhook handling
   - Provider selection logic

3. **E2E Tests for Critical Flows**
   - Send money end-to-end
   - Payment request flow
   - Refund processing

### Test Naming Convention

```typescript
// describe: Component being tested
describe('MpesaAdapter', () => {
  // describe: Method or scenario
  describe('sendMoney', () => {
    // it: Expected behavior
    it('should successfully send money with valid params', async () => {
      // test
    });
    
    it('should throw PaymentError when phone number is invalid', async () => {
      // test
    });
    
    it('should retry on network timeout', async () => {
      // test
    });
  });
});
```

---

## Code Review Checklist

### Before Submitting PR

- [ ] All tests pass (`npm test`)
- [ ] Code coverage meets thresholds
- [ ] No `console.log` statements (use `logger` instead)
- [ ] No `any` types without justification
- [ ] Error handling implemented for all async operations
- [ ] Type safety maintained (no `@ts-ignore`)
- [ ] Documentation updated (JSDoc for public APIs)
- [ ] CHANGELOG.md updated
- [ ] No sensitive data in code or tests

### Security Checklist

- [ ] API keys not hardcoded
- [ ] PII masked in logs
- [ ] Input validation implemented
- [ ] No SQL injection vulnerabilities (if applicable)
- [ ] Webhook signatures verified

### Performance Checklist

- [ ] No unnecessary API calls
- [ ] Async operations use Promise.all where applicable
- [ ] No memory leaks in event listeners
- [ ] Large datasets paginated

---

## Naming Conventions

### Classes

```typescript
// PascalCase
class MpesaAdapter implements PaymentProvider { }
class PaymentError extends Error { }
class ProviderRegistry { }
```

### Functions & Methods

```typescript
// camelCase
async function sendMoney(params: SendMoneyParams): Promise<Transaction> { }

class ToolManager {
  executeTool(name: string, args: any): Promise<ToolResult> { }
  formatTransactionResponse(tx: Transaction): string { }
}
```

### Constants

```typescript
// UPPER_SNAKE_CASE for true constants
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const COUNTRY_DEFAULT_PROVIDERS: Record<string, string[]> = {
  KE: ['mpesa', 'paystack'],
};

// camelCase for const objects that aren't frozen
const defaultConfig = { ... };
```

### Files

```
src/
├── adapters/
│   ├── mpesa/
│   │   └── index.ts          # kebab-case for directories
│   ├── paystack/
│   │   └── index.ts
│   └── index.ts
├── types/
│   └── index.ts              # index.ts for barrel exports
├── utils/
│   ├── config.ts             # kebab-case for files
│   ├── logger.ts
│   ├── registry.ts
│   └── tools.ts
└── index.ts
```

### Types & Interfaces

```typescript
// PascalCase with Type suffix for type aliases
type TransactionStatus = 'pending' | 'completed' | 'failed';
type PaymentMethodType = 'mobile_money' | 'card';

// PascalCase for interfaces
interface PaymentProvider {
  name: string;
}

interface SendMoneyParams {
  recipient: Customer;
  amount: Money;
}

// PascalCase with Config suffix for config types
interface MpesaConfig extends ProviderConfig { }
interface PaystackConfig extends ProviderConfig { }
```

### Variables

```typescript
// camelCase for variables
const providerRegistry = new ProviderRegistry();
let currentTransaction: Transaction | null = null;

// Descriptive names
const isRetryable = error.code === 'TIMEOUT';  // Good
const r = error.code === 'TIMEOUT';            // Bad

// Boolean prefixes: is, has, should, can
const isAuthenticated = !!accessToken;
const hasValidConfig = validateConfig(config);
const shouldRetry = retryCount < maxRetries;
```

---

## File Organization

### Directory Structure

```
africa-payments-mcp/
├── src/
│   ├── adapters/              # Provider implementations
│   │   ├── mpesa/
│   │   │   └── index.ts
│   │   ├── paystack/
│   │   │   └── index.ts
│   │   ├── mtn-momo/
│   │   │   └── index.ts
│   │   ├── airtel-money/
│   │   │   └── index.ts
│   │   ├── intasend/
│   │   │   └── index.ts
│   │   └── index.ts           # Barrel exports
│   │
│   ├── types/                 # TypeScript definitions
│   │   └── index.ts           # All types in one file (for now)
│   │
│   ├── utils/                 # Utilities
│   │   ├── config.ts          # Configuration management
│   │   ├── logger.ts          # Logging utility
│   │   ├── registry.ts        # Provider registry
│   │   └── tools.ts           # Tool definitions & execution
│   │
│   ├── webhook/               # Webhook handling
│   │   ├── events.ts          # Event emitter
│   │   └── handlers/          # Provider-specific handlers
│   │
│   └── index.ts               # Server entry point
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── docs/                      # Documentation
│   └── (future: VitePress site)
│
├── examples/                  # Usage examples
├── ARCHITECTURE.md
├── TECHNICAL_DECISIONS.md
├── CODE_QUALITY.md
├── README.md
├── package.json
└── tsconfig.json
```

### Import Order

```typescript
// 1. External dependencies
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import axios from 'axios';

// 2. Internal absolute imports
import { Logger } from './utils/logger.js';
import { ConfigManager } from './utils/config.js';

// 3. Internal relative imports (same directory)
import { PaymentError } from './errors.js';

// 4. Type-only imports (grouped separately)
import type { ServerConfig } from './types/index.js';
```

---

## Code Style Guidelines

### Function Length

- **Target:** < 30 lines per function
- **Maximum:** 50 lines (with justification)
- **Exception:** Tool definition methods (JSON schema)

### Class Length

- **Target:** < 300 lines per class
- **Maximum:** 500 lines
- **Solution:** Extract private methods or helper classes

### File Length

- **Target:** < 500 lines
- **Maximum:** 1000 lines
- **Current exceptions:** `src/utils/tools.ts` (1066 lines) - needs refactoring

### Async/Await

```typescript
// ✅ Always use async/await
async function fetchData(): Promise<Data> {
  const response = await axios.get('/data');
  return response.data;
}

// ❌ Avoid raw promises
function fetchData(): Promise<Data> {
  return axios.get('/data').then(r => r.data);
}

// ✅ Parallel execution with Promise.all
const [users, orders] = await Promise.all([
  fetchUsers(),
  fetchOrders(),
]);
```

### Error Handling

```typescript
// ✅ Use custom PaymentError
throw new PaymentError(
  'Invalid phone number format',
  ErrorCodes.INVALID_PHONE,
  this.name
);

// ✅ Always handle errors in async functions
try {
  const result = await provider.sendMoney(params);
  return result;
} catch (error) {
  if (error instanceof PaymentError) {
    // Re-throw known errors
    throw error;
  }
  // Wrap unknown errors
  throw new PaymentError(
    `Unexpected error: ${error.message}`,
    ErrorCodes.UNKNOWN_ERROR,
    this.name
  );
}

// ❌ Never silently ignore errors
try {
  await riskyOperation();
} catch (e) {
  // BAD: No handling
}
```

### Type Safety

```typescript
// ✅ Explicit return types on public methods
async function sendMoney(params: SendMoneyParams): Promise<Transaction> { }

// ✅ Avoid any
function process(data: unknown): void { }

// ❌ No explicit any
function process(data: any): void { }

// ✅ Use type guards
function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}

// ✅ Null safety
const provider = registry.getProvider(name);
if (!provider) {
  throw new PaymentError('Provider not found', ErrorCodes.PROVIDER_NOT_AVAILABLE);
}
// TypeScript now knows provider is defined
await provider.sendMoney(params);
```

---

## Documentation Standards

### JSDoc Comments

```typescript
/**
 * Send money to a recipient via the provider.
 * 
 * @param params - Send money parameters including recipient and amount
 * @returns Promise resolving to the created Transaction
 * @throws {PaymentError} When validation fails or provider error occurs
 * @throws {Error} When unexpected error occurs
 * 
 * @example
 * ```typescript
 * const transaction = await adapter.sendMoney({
 *   recipient: { phone: { formatted: '+254712345678' } },
 *   amount: { amount: 1000, currency: 'KES' }
 * });
 * ```
 */
async function sendMoney(params: SendMoneyParams): Promise<Transaction> { }
```

### Inline Comments

```typescript
// Explain WHY, not WHAT
// ✅ Good: Token expires 5 minutes early to avoid edge cases
const tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);

// ❌ Bad: Redundant comment
// Set token expiry
const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
```

### README Updates

Update README.md when:
- Adding new providers
- Changing configuration format
- Adding new tools
- Changing installation steps

---

## Anti-Patterns to Avoid

### ❌ God Classes

```typescript
// BAD: ToolManager at 1000+ lines
class ToolManager {
  // 50+ methods
}

// GOOD: Split into specialized classes
class UniversalToolHandler { }
class MpesaToolHandler { }
class PaystackToolHandler { }
```

### ❌ Deep Nesting

```typescript
// BAD: Pyramid of doom
if (provider) {
  if (provider.enabled) {
    if (provider.hasValidConfig) {
      // finally do something
    }
  }
}

// GOOD: Early returns
if (!provider) throw new Error('No provider');
if (!provider.enabled) throw new Error('Disabled');
if (!provider.hasValidConfig) throw new Error('Invalid config');
// do something
```

### ❌ Magic Numbers

```typescript
// BAD
if (code === '0') return 'success';

// GOOD
const MPESA_SUCCESS_CODE = '0';
if (code === MPESA_SUCCESS_CODE) return 'success';
```

### ❌ String Concatenation for Errors

```typescript
// BAD
throw new Error('Failed to send ' + amount + ' to ' + phone);

// GOOD
throw new PaymentError(
  `Failed to send ${amount} to ${phone}`,
  ErrorCodes.TRANSACTION_FAILED
);
```

---

## Review Process

1. **Self-Review:** Run checklist before requesting review
2. **Automated Checks:** CI runs lint, test, coverage
3. **Peer Review:** At least one approval required
4. **Architecture Review:** For significant changes
5. **Merge:** Squash and merge with descriptive message

---

*Code quality standards maintained by Elder KenyaClaw*
