# Contributing to Africa Payments MCP

Thank you for your interest in contributing to Africa Payments MCP! 🌍 We welcome contributions from developers across Africa and beyond.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/africa-payments-mcp.git
   cd africa-payments-mcp
   ```

3. **Install dependencies**:
   ```bash
   npm ci
   ```

4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📝 Code Style Guidelines

### TypeScript

- Use **strict TypeScript** settings
- Enable all strict flags in `tsconfig.json`
- Use explicit return types for public functions
- Avoid `any` type - use `unknown` with type guards instead

### Naming Conventions

- **Files**: kebab-case (`mpesa-adapter.ts`)
- **Classes**: PascalCase (`MpesaAdapter`)
- **Interfaces**: PascalCase with `I` prefix (`ITransaction`)
- **Functions/Variables**: camelCase (`processPayment`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Enums**: PascalCase for name, PascalCase for members

### Code Formatting

We use **ESLint** and **Prettier** for code formatting:

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint -- --fix

# Format code
npm run format
```

## 💬 Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Changes that don't affect code meaning (formatting) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Code change that improves performance |
| `test` | Adding or correcting tests |
| `chore` | Changes to build process or auxiliary tools |
| `ci` | Changes to CI configuration |

### Scopes

Common scopes for this project:

- `mpesa` - M-Pesa provider changes
- `paystack` - Paystack provider changes
- `momo` - MTN MoMo provider changes
- `intasend` - IntaSend provider changes
- `core` - Core functionality
- `webhook` - Webhook handling
- `docs` - Documentation
- `deps` - Dependencies

### Examples

```bash
# Feature
feat(mpesa): add STK push support

# Bug fix
fix(paystack): handle timeout errors correctly

# Documentation
docs(readme): update installation instructions

# Breaking change
feat(core)!: change config file format

BREAKING CHANGE: Config file now uses JSON schema v2
```

## 🧪 Testing Requirements

### Writing Tests

All new features must include tests:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPattern=mpesa
```

### Test Coverage

- Minimum coverage: **80%** for new code
- Critical paths (payment processing): **90%**

### Test Structure

```typescript
// tests/adapters/mpesa.test.ts
describe('MpesaAdapter', () => {
  describe('stkPush', () => {
    it('should initiate STK push successfully', async () => {
      // Arrange
      const adapter = new MpesaAdapter(config);
      
      // Act
      const result = await adapter.stkPush(params);
      
      // Assert
      expect(result.success).toBe(true);
    });
    
    it('should throw error for invalid phone number', async () => {
      // Test error cases
    });
  });
});
```

## 🔒 Security Guidelines

When contributing payment-related code:

- **Never** commit API keys, secrets, or credentials
- Use environment variables for sensitive configuration
- Validate all user inputs
- Implement proper error handling without exposing sensitive data
- Follow PCI DSS guidelines for card data (if applicable)

## 🌍 Adding a New Payment Provider

To add support for a new African payment provider:

1. Create a new directory in `src/adapters/<provider-name>/`
2. Implement the `PaymentAdapter` interface
3. Add provider configuration types
4. Write comprehensive tests
5. Update documentation

### Provider Checklist

- [ ] Adapter implementation
- [ ] Type definitions
- [ ] Unit tests (90%+ coverage)
- [ ] Integration tests
- [ ] README documentation
- [ ] Example usage

## 📋 Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Ensure CI passes** (lint, build, tests)
4. **Fill out the PR template** completely
5. **Request review** from maintainers
6. **Address review comments**
7. **Squash commits** if requested

## 🐛 Reporting Bugs

Use the [Bug Report Template](./ISSUE_TEMPLATE/bug_report.md) and include:

- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Payment provider involved
- Error messages/logs

## 💡 Requesting Features

Use the [Feature Request Template](./ISSUE_TEMPLATE/feature_request.md) and include:

- Clear description of the feature
- Use case and motivation
- Proposed API/interface
- Potential provider support

## 📜 Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect differing viewpoints

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Personal attacks
- Publishing others' private information

## 📞 Getting Help

- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests
- **Email**: team@kenyaclaw.com (for security issues)

## 🏆 Recognition

Contributors will be:
- Listed in the README
- Mentioned in release notes
- Added to our contributors page

---

**Thank you for helping democratize African fintech!** 🌍💳
