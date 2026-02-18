# Africa Payments MCP - Test Suite

Comprehensive test suite for the Africa Payments MCP Server covering all payment providers, tools, webhooks, and end-to-end workflows.

## 📊 Test Coverage Status

| Category | Files | Test Cases | Status |
|----------|-------|------------|--------|
| Adapters | 5 | 100+ | ⚠️ Partial (needs axios mocks) |
| Tools | 1 | 50+ | ⚠️ Partial (needs adapter mocks) |
| Webhooks | 1 | 40+ | ✅ Passing |
| Integration | 1 | 20+ | ⚠️ Partial |
| Utils | 3 | 30+ | ✅ Passing |

**Current Status**: ~150+ tests passing out of 229 total

## 🚀 Quick Start

### Install Dependencies

```bash
npm install
```

### Run All Tests (with ESM support)

```bash
NODE_OPTIONS="--experimental-vm-modules" npm test
```

### Run Tests in Watch Mode

```bash
NODE_OPTIONS="--experimental-vm-modules" npm run test:watch
```

### Run Tests with Coverage

```bash
NODE_OPTIONS="--experimental-vm-modules" npm run test:coverage
```

### Run Unit Tests Only

```bash
NODE_OPTIONS="--experimental-vm-modules" npm run test:unit
```

### Run Integration Tests Only

```bash
NODE_OPTIONS="--experimental-vm-modules" npm run test:integration
```

## 📁 Test Structure

```
tests/
├── README.md                    # This file
├── jest.config.js               # Jest configuration
├── fixtures/                    # Mock data and responses
│   ├── mpesa-responses.json    # M-Pesa API mock responses
│   ├── paystack-responses.json # Paystack API mock responses
│   └── webhook-payloads.json   # Webhook payload samples
├── adapters/                    # Provider adapter tests
│   ├── mpesa.test.ts           # M-Pesa Daraja API tests
│   ├── paystack.test.ts        # Paystack API tests
│   ├── intasend.test.ts        # IntaSend API tests
│   ├── mtn-momo.test.ts        # MTN MoMo API tests
│   └── airtel-money.test.ts    # Airtel Money API tests
├── utils/                       # Utility tests
│   ├── registry.test.ts        # Provider registry tests
│   ├── logger.test.ts          # Logger tests
│   └── config.test.ts          # Config manager tests
├── tools.test.ts               # MCP tools tests
├── webhook.test.ts             # Webhook handling tests
└── integration.test.ts         # End-to-end tests
```

## 🔍 Test Categories

### 1. Adapter Tests (`adapters/`)

Tests for each payment provider adapter:

- **M-Pesa** (`mpesa.test.ts`):
  - Authentication (OAuth)
  - STK Push (request payment)
  - B2C Transfer (send money)
  - Transaction status query
  - Refund/reversal
  - Phone validation

- **Paystack** (`paystack.test.ts`):
  - Initialize transaction
  - Verify transaction
  - Refund processing
  - Transfer (payout)
  - Exchange rates

- **IntaSend** (`intasend.test.ts`):
  - Payout/collection
  - Transaction verification
  - Refund handling

- **MTN MoMo** (`mtn-momo.test.ts`):
  - Transfer (disbursement)
  - Request to Pay (collection)
  - Transaction verification

- **Airtel Money** (`airtel-money.test.ts`):
  - Disbursement
  - Collection
  - Multi-country support

### 2. Tools Tests (`tools.test.ts`)

Tests for all MCP tools:

**Universal Tools:**
- `unified_send_money` - Send money with auto-provider selection
- `unified_request_payment` - Request payment
- `unified_verify_transaction` - Verify transaction status
- `unified_refund` - Process refunds
- `unified_list_transactions` - List transactions
- `unified_get_rates` - Get exchange rates

**M-Pesa Tools:**
- `mpesa_stk_push` - STK Push payment
- `mpesa_b2c` - Business to customer transfer
- `mpesa_c2b` - Register C2B URLs
- `mpesa_transaction_status` - Query transaction status

**Paystack Tools:**
- `paystack_initialize` - Initialize transaction
- `paystack_verify` - Verify transaction
- `paystack_refund` - Process refund
- `paystack_transfer` - Transfer funds

**Info Tools:**
- `list_providers` - List configured providers
- `get_provider_info` - Get provider details

### 3. Webhook Tests (`webhook.test.ts`)

✅ **All passing**

Tests for webhook handling:

- **Signature Verification:**
  - Paystack HMAC-SHA512 verification
  - Invalid signature rejection
  - Payload tampering detection

- **M-Pesa Callbacks:**
  - STK Push success/cancelled/insufficient funds
  - B2C result callback
  - C2B validation/confirmation
  - Reversal notifications

- **Paystack Webhooks:**
  - `charge.success` events
  - `transfer.success` events
  - `transfer.failed` events
  - `refund.processed` events
  - `subscription.create` events

- **Event Handling:**
  - Event parsing
  - Duplicate detection
  - Deduplication storage

### 4. Integration Tests (`integration.test.ts`)

End-to-end workflow tests:

- **Full Payment Flows:**
  - Request → Verify → Refund
  - Initialize → Verify → Refund

- **Cross-Provider Operations:**
  - Auto-provider selection by country
  - Multi-provider transaction listing
  - Cross-provider transaction search

- **Multi-Step Flows:**
  - Merchant collection flow
  - Bulk disbursement
  - Payment with retry

- **Error Recovery:**
  - Failed payment retry
  - Partial refund after full refund failure
  - Provider failover

- **Real-World Scenarios:**
  - E-commerce checkout (multiple countries)
  - Salary disbursement
  - Invoice payment with reminders
  - Subscription payments

### 5. Utility Tests (`utils/`)

✅ **All passing**

- **Registry** (`registry.test.ts`):
  - Provider registration
  - Provider retrieval
  - Initialize all providers
  - Failed provider removal

- **Logger** (`logger.test.ts`):
  - Log levels (debug, info, warn, error)
  - Timestamp inclusion
  - Level filtering

- **Config** (`config.test.ts`):
  - Configuration loading
  - Default values
  - Validation
  - Error handling

## 🛠️ Configuration

### Jest Configuration (`jest.config.js`)

```javascript
{
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  injectGlobals: false, // Use @jest/globals imports
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

### Running Tests with ESM

This project uses ES Modules (ESM). To run tests:

```bash
NODE_OPTIONS="--experimental-vm-modules" npm test
```

Or set the environment variable in your shell:

```bash
export NODE_OPTIONS="--experimental-vm-modules"
npm test
```

## 📝 Writing Tests

### Import Pattern for ESM

```typescript
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
```

### Mocking Axios

```typescript
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    })),
  },
}));
```

### Basic Test Structure

```typescript
describe('Feature Name', () => {
  let adapter: PaymentAdapter;

  beforeEach(() => {
    adapter = new PaymentAdapter(mockConfig);
    mockGet.mockReset();
    mockPost.mockReset();
  });

  describe('methodName', () => {
    it('should do something expected', async () => {
      mockPost.mockResolvedValueOnce({ data: mockResponse });
      const result = await adapter.methodName(params);
      expect(result).toBeDefined();
    });

    it('should handle errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('API Error'));
      await expect(adapter.methodName(invalidParams))
        .rejects.toThrow('Error message');
    });
  });
});
```

### Using Fixtures

```typescript
import responses from '../fixtures/provider-responses.json';

// In test
mockPost.mockResolvedValueOnce({ data: responses.oauth.success });
```

## 📈 Coverage Report

After running `npm run test:coverage`, view the detailed report:

```
coverage/
├── lcov-report/
│   └── index.html      # Open in browser for detailed view
├── lcov.info           # LCOV format for CI/CD
└── coverage-summary.json
```

## 🔧 Troubleshooting

### Common Issues

1. **ESM Module Errors:**
   ```bash
   # Always use NODE_OPTIONS
   NODE_OPTIONS="--experimental-vm-modules" npm test
   ```

2. **"jest is not defined" Errors:**
   ```typescript
   // Import jest from @jest/globals
   import { jest, describe, it, expect } from '@jest/globals';
   ```

3. **Import Path Errors:**
   ```typescript
   // Use .js extension for ESM imports
   import { Something } from '../path/to/file.js';
   ```

4. **Test Timeouts:**
   ```typescript
   // Increase timeout for slow tests
   jest.setTimeout(10000);
   ```

### Debug Mode

```bash
# Run single test file with verbose output
NODE_OPTIONS="--experimental-vm-modules" npx jest tests/adapters/mpesa.test.ts --verbose

# Run with Node debugger
NODE_OPTIONS="--experimental-vm-modules --inspect-brk" npx jest --runInBand
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: NODE_OPTIONS="--experimental-vm-modules" npm test
      - run: NODE_OPTIONS="--experimental-vm-modules" npm run test:coverage
```

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Jest ESM Guide](https://jestjs.io/docs/ecmascript-modules)
- [M-Pesa Daraja API Docs](https://developer.safaricom.co.ke/)
- [Paystack API Docs](https://paystack.com/docs/api/)

---

**Maintained by:** KenyaClaw Team <team@kenyaclaw.com>

**License:** MIT
