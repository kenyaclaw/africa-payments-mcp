# Security Checklist for Contributors

This checklist must be completed for all pull requests that modify code handling payments, webhooks, or sensitive data.

## Pre-Submission Checklist

### API Keys and Secrets
- [ ] **No API keys in code**
  - [ ] No hardcoded `sk_live_`, `sk_test_`, `pk_live_`, `pk_test_` keys
  - [ ] No hardcoded M-Pesa credentials (consumer key, consumer secret, passkey)
  - [ ] No hardcoded webhook secrets
  - [ ] No hardcoded database passwords or connection strings
  - [ ] No hardcoded JWT secrets or signing keys

### Logging and Debugging
- [ ] **No passwords in logs**
  - [ ] Sensitive data is masked before logging (use `maskSensitiveData()`)
  - [ ] Phone numbers are masked (use `maskPhoneNumber()`)
  - [ ] Email addresses are masked (use `maskEmail()`)
  - [ ] API keys are never logged in full
  - [ ] No `console.log(req.headers)` without filtering
  - [ ] No `console.log(process.env)` in production code

### Input Validation
- [ ] **Input validation on all endpoints**
  - [ ] All user inputs are validated
  - [ ] Phone numbers sanitized with `sanitizePhoneNumber()`
  - [ ] Amounts validated with `isValidAmount()`
  - [ ] Currency codes validated with `isValidCurrency()`
  - [ ] Email addresses validated with `isValidEmail()`
  - [ ] String inputs sanitized with `sanitizeString()`
  - [ ] Request size limits enforced

### Webhook Security
- [ ] **Webhook signatures verified**
  - [ ] All webhooks verify signatures using `verifyWebhookSignature()`
  - [ ] Paystack webhooks use `verifyPaystackSignature()`
  - [ ] Signature verification happens before processing
  - [ ] Failed signature verification returns 401 (not 403)

### Rate Limiting
- [ ] **Rate limiting implemented**
  - [ ] API endpoints have rate limiting
  - [ ] Webhook endpoints have appropriate rate limiting
  - [ ] Different tiers for different endpoint types
  - [ ] Rate limit headers included in responses

### Error Handling
- [ ] **Error messages don't leak sensitive info**
  - [ ] Error messages are generic in production
  - [ ] No stack traces returned to client in production
  - [ ] No database errors exposed to client
  - [ ] No file paths exposed in errors
  - [ ] Full errors logged internally only

### Dependencies
- [ ] **Dependencies are up to date**
  - [ ] `npm audit` passes with no high/critical vulnerabilities
  - [ ] No unused dependencies
  - [ ] New dependencies reviewed for security
  - [ ] Lock file (`package-lock.json`) is updated and committed

## Testing Checklist

- [ ] Unit tests added for security utilities
- [ ] Signature verification tested with valid and invalid signatures
- [ ] Rate limiting tested
- [ ] Input validation edge cases tested
- [ ] Error handling tested

## Code Review Focus Areas

### For Reviewers

1. **Check for hardcoded secrets**
   ```bash
   grep -r "sk_live_\|sk_test_\|password\|secret" --include="*.ts" --include="*.js" src/
   ```

2. **Check for unsafe logging**
   ```bash
   grep -r "console.log.*req\|console.log.*headers\|console.log.*body" --include="*.ts" src/
   ```

3. **Verify signature verification**
   - All webhook handlers must call signature verification
   - No bypassing signature verification in any code path

4. **Check rate limiting**
   - All public endpoints must have rate limiting
   - Webhooks should have reasonable limits

## Security-Related Files

When modifying these files, extra scrutiny is required:

- `src/utils/security.ts` - Security utilities
- `src/middleware/security.ts` - Security middleware
- `src/webhooks/*.ts` - Webhook handlers
- `.env.example` - Environment variable examples
- Any file handling authentication or authorization

## Common Security Anti-Patterns to Avoid

### ❌ Don't
```typescript
// Don't log sensitive data
console.log('Payment request:', req.body);

// Don't disable signature verification
if (process.env.NODE_ENV === 'development') {
  skipVerification = true;  // DON'T DO THIS
}

// Don't return detailed errors
res.status(500).json({ error: err.message, stack: err.stack });

// Don't trust user input
const query = `SELECT * FROM payments WHERE id = ${req.params.id}`;
```

### ✅ Do
```typescript
// Do mask sensitive data
import { maskSensitiveData } from './utils/security';
console.log('Payment request:', maskSensitiveData(req.body));

// Do always verify signatures
const isValid = verifyWebhookSignature(payload, signature, secret);
if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

// Do return generic errors
res.status(500).json({ error: 'Internal server error' });
console.error('Full error:', err);  // Log internally

// Do validate and sanitize input
import { sanitizeString } from './utils/security';
const id = sanitizeString(req.params.id);
```

## Post-Merge Checklist

- [ ] Security scanning passes in CI
- [ ] Secrets scanning passes
- [ ] Dependency audit passes
- [ ] CodeQL analysis passes

## Questions?

If you're unsure about any security aspect:

1. Review the [SECURITY.md](SECURITY.md) policy
2. Check existing secure implementations in the codebase
3. Ask for security review in your PR
4. Email security@kenyaclaw.com for sensitive questions

---

**Remember**: Security is everyone's responsibility. When in doubt, err on the side of caution.
