# Contributing

Thank you for your interest in contributing to Africa Payments MCP! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Git
- A code editor (VS Code recommended)

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/kenyaclaw/africa-payments-mcp.git
cd africa-payments-mcp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your test credentials
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linter
npm run lint

# Run type checker
npm run typecheck
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add support for new provider

- Added X provider adapter
- Implemented Y feature
- Updated documentation"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/config changes

### 5. Submit Pull Request

1. Push your branch: `git push origin feature/your-feature-name`
2. Open a Pull Request on GitHub
3. Fill out the PR template
4. Link related issues

## Project Structure

```
africa-payments-mcp/
├── src/
│   ├── providers/          # Payment provider adapters
│   │   ├── mpesa.ts
│   │   ├── paystack.ts
│   │   └── ...
│   ├── tools/              # Tool implementations
│   ├── utils/              # Utility functions
│   ├── types.ts            # TypeScript types
│   └── index.ts            # Main entry
├── tests/                  # Test files
├── docs/                   # Documentation
└── scripts/                # Build scripts
```

## Adding a New Provider

To add a new payment provider:

### 1. Create Provider Adapter

```typescript
// src/providers/new-provider.ts
import { BaseProvider, PaymentRequest, PaymentResponse } from '../types';

export class NewProvider implements BaseProvider {
  name = 'newprovider';
  
  constructor(private config: NewProviderConfig) {}
  
  async initialize(): Promise<void> {
    // Initialize provider connection
  }
  
  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Implement payment request
  }
  
  async sendMoney(request: SendMoneyRequest): Promise<PaymentResponse> {
    // Implement send money
  }
  
  async checkStatus(transactionId: string): Promise<StatusResponse> {
    // Implement status check
  }
  
  async getBalance(): Promise<BalanceResponse> {
    // Implement balance check
  }
}
```

### 2. Add Types

```typescript
// src/types.ts
export interface NewProviderConfig {
  apiKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}
```

### 3. Register Provider

```typescript
// src/providers/index.ts
export { NewProvider } from './new-provider';

// src/index.ts
import { NewProvider } from './providers';

export const providers = {
  // ... existing providers
  newprovider: NewProvider
};
```

### 4. Add Tests

```typescript
// tests/providers/new-provider.test.ts
import { describe, it, expect } from 'vitest';
import { NewProvider } from '../../src/providers/new-provider';

describe('NewProvider', () => {
  const provider = new NewProvider({
    apiKey: 'test_key',
    secretKey: 'test_secret',
    environment: 'sandbox'
  });
  
  it('should request payment', async () => {
    // Test implementation
  });
});
```

### 5. Add Documentation

Create `docs/providers/new-provider.md` with:
- Setup instructions
- Configuration options
- API operations
- Examples

## Adding New Tools

### Universal Tool

```typescript
// src/tools/unified/new-tool.ts
import { Tool } from '@modelcontextprotocol/sdk';

export const unifiedNewTool: Tool = {
  name: 'unified_new_tool',
  description: 'Description of what this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of param1'
      }
    },
    required: ['param1']
  }
};

export async function handleUnifiedNewTool(args: any) {
  // Implementation
}
```

### Provider-Specific Tool

```typescript
// src/providers/mpesa/tools.ts
export const mpesaNewTool: Tool = {
  name: 'mpesa_new_tool',
  description: 'M-Pesa specific tool',
  inputSchema: { /* ... */ }
};

export async function handleMpesaNewTool(args: any, config: MpesaConfig) {
  // Implementation
}
```

## Code Style

### TypeScript

- Use strict TypeScript
- Prefer `interface` over `type` for object shapes
- Use explicit return types
- Avoid `any`

```typescript
// Good
interface PaymentRequest {
  amount: number;
  currency: CurrencyCode;
}

async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  // Implementation
}

// Avoid
function processPayment(request: any): any {
  // Implementation
}
```

### Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

### Error Handling

```typescript
try {
  const result = await provider.requestPayment(request);
  return { success: true, data: result };
} catch (error) {
  logger.error('Payment failed', { error, request });
  
  return {
    success: false,
    error: {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      details: error.details
    }
  };
}
```

## Testing Guidelines

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('PaymentService', () => {
  it('should process payment successfully', async () => {
    // Arrange
    const mockProvider = {
      requestPayment: vi.fn().mockResolvedValue({ status: 'success' })
    };
    
    const service = new PaymentService(mockProvider);
    
    // Act
    const result = await service.processPayment({ amount: 100 });
    
    // Assert
    expect(result.status).toBe('success');
    expect(mockProvider.requestPayment).toHaveBeenCalledWith({ amount: 100 });
  });
  
  it('should handle provider errors', async () => {
    // Test error handling
  });
});
```

### Integration Tests

```typescript
describe('M-Pesa Integration', () => {
  it('should send STK push in sandbox', async () => {
    const result = await mpesaProvider.stkPush({
      phoneNumber: '254708374149',
      amount: 10
    });
    
    expect(result.ResponseCode).toBe('0');
  });
});
```

## Documentation

When adding features, update:

1. **API Reference** - `docs/api/reference.md`
2. **Provider Docs** - `docs/providers/[provider].md`
3. **Examples** - `docs/examples/`
4. **README** - If major feature

### Documentation Style

- Use clear, concise language
- Include code examples
- Document all parameters
- Note any limitations

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.0.0`
4. Push tags: `git push --tags`
5. GitHub Actions will publish to npm

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on what's best for the community

### Communication

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: General questions and ideas
- Discord: Real-time chat (link in README)

## Questions?

If you have questions:

1. Check existing documentation
2. Search closed issues
3. Ask in GitHub Discussions
4. Join Discord community

Thank you for contributing to Africa Payments MCP! 🌍
