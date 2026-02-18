# Security Policy

## Reporting Security Vulnerabilities

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them via email to: **security@kenyaclaw.com**

We take all security reports seriously. Thank you for helping keep Africa Payments MCP and our users safe.

## Response Process

1. **Acknowledgment** - We acknowledge receipt within 24 hours
2. **Assessment** - We assess severity and impact within 72 hours
3. **Fix Development** - We develop and test a fix
4. **Disclosure** - We coordinate disclosure with the reporter

## Supported Versions

Security updates are provided for the following versions:

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes    |
| < 0.1.0 | ❌ No     |

## Security Best Practices

- Never commit API keys or secrets
- Use environment variables for sensitive configuration
- Enable webhook signature verification
- Use HTTPS for all webhooks
- Implement proper rate limiting
- Keep dependencies updated

For more details, see the main [SECURITY.md](../SECURITY.md).
