# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report vulnerabilities to **security@kenyaclaw.com**

**DO NOT** create public GitHub issues for security problems.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- Acknowledgment: Within 24 hours
- Initial assessment: Within 72 hours
- Fix released: Based on severity (Critical: 7 days, High: 14 days, Medium: 30 days)

## Security Best Practices

### For Users

1. **Never commit API keys to git**
   - Use environment variables or secure secret management
   - Add `.env` to `.gitignore`

2. **Use environment variables for secrets**
   ```bash
   export PAYSTACK_SECRET_KEY=sk_live_...
   export MPESA_API_KEY=...
   ```

3. **Enable webhook signature verification**
   - Always verify webhook signatures from payment providers
   - Use the `verifyWebhookSignature` utility provided

4. **Use HTTPS for all webhook URLs**
   - Never use HTTP in production
   - TLS 1.2 or higher required

5. **Implement rate limiting**
   - Use the built-in `RateLimiter` class
   - Configure appropriate limits for your use case

6. **Monitor for suspicious activity**
   - Log all payment events
   - Set up alerts for unusual patterns

### For Developers

1. **Input Validation**
   - Validate all inputs using provided sanitization functions
   - Never trust user input

2. **Error Handling**
   - Don't leak sensitive information in error messages
   - Log full errors internally, return generic messages to users

3. **Dependency Management**
   - Run `npm audit` regularly
   - Keep dependencies up to date
   - Review new dependencies for security issues

4. **Code Review**
   - All code must be reviewed before merging
   - Security-focused review checklist in `SECURITY_CHECKLIST.md`

## Security Features

This project includes:

- Webhook signature verification
- Rate limiting
- Input sanitization
- IP whitelisting
- Security headers (Helmet)
- Secrets scanning in CI
- Dependency vulnerability scanning

## Compliance

See [docs/compliance.md](docs/compliance.md) for PCI DSS and other compliance notes.

## Security Contacts

- Email: security@kenyaclaw.com
- GPG Key: Available upon request
