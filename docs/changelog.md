# Changelog

All notable changes to Africa Payments MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support for Airtel Money provider
- Bulk payout functionality for Paystack
- Webhook signature verification for IntaSend
- Automatic retry with exponential backoff
- Health check endpoint

## [1.0.0] - 2024-02-15

### Added
- Initial release of Africa Payments MCP
- **Providers:**
  - M-Pesa (Kenya, Tanzania, Uganda, DRC, Mozambique, Lesotho)
  - Paystack (Nigeria, Ghana, South Africa, Kenya)
  - MTN MoMo (16+ African countries)
  - IntaSend (Kenya, Nigeria, Ghana)
  - Airtel Money (14+ African countries)
- **Universal Tools:**
  - `unified_send_money` - Send money to any provider
  - `unified_request_payment` - Request payment from customers
  - `unified_check_status` - Check transaction status
  - `unified_get_balance` - Get wallet balance
  - `unified_list_transactions` - List transaction history
  - `unified_refund` - Process refunds
- **Provider-Specific Tools:**
  - M-Pesa: STK Push, B2C, transaction status, account balance, C2B
  - Paystack: Initialize, verify, transfers, bulk transfers, recipients
  - MTN MoMo: Request payment, transfer, balance, user validation
  - IntaSend: Collect, payout, payment links, balance
  - Airtel Money: Collect, send, refund, balance
- **Features:**
  - Smart provider routing by country/currency
  - Webhook handling with signature verification
  - Comprehensive error handling
  - Request logging and observability
  - Sandbox support for all providers
  - TypeScript type definitions
  - Full documentation website

### Security
- Webhook signature verification for all providers
- Encrypted credential storage
- Request/response logging with redaction
- No sensitive data in error messages

## [0.9.0] - 2024-02-01

### Added
- Beta support for MTN MoMo
- MTN MoMo collection and disbursement APIs
- Transaction status checking
- User account validation

### Changed
- Improved error messages across all providers
- Enhanced webhook payload parsing

### Fixed
- M-Pesa B2C timeout handling
- Paystack currency formatting for GHS

## [0.8.0] - 2024-01-15

### Added
- IntaSend provider integration
- M-Pesa collection via IntaSend
- Bank and M-Pesa payouts
- Payment link generation

### Changed
- Refactored provider interface for better extensibility
- Updated documentation structure

### Fixed
- Webhook URL configuration for multiple providers
- Currency code validation

## [0.7.0] - 2024-01-01

### Added
- Paystack bulk transfers
- Transfer recipient management
- Bank account lookups
- Subaccount support

### Changed
- Improved rate limit handling
- Better retry logic for failed requests

## [0.6.0] - 2023-12-15

### Added
- Airtel Money provider (initial support)
- OAuth token management
- Collection and disbursement APIs

### Fixed
- Phone number formatting across providers
- Currency conversion edge cases

## [0.5.0] - 2023-12-01

### Added
- M-Pesa C2B (Customer to Business) support
- C2B URL registration
- Transaction simulation for testing

### Changed
- Enhanced M-Pesa error handling
- Improved STK Push reliability

## [0.4.0] - 2023-11-15

### Added
- Paystack integration
- Card payments
- Bank transfers
- Mobile money via Paystack

### Fixed
- Environment variable loading
- Configuration validation

## [0.3.0] - 2023-11-01

### Added
- M-Pesa B2C (Business to Customer)
- Transaction status queries
- Account balance queries

### Changed
- Unified API design
- Consistent response format

## [0.2.0] - 2023-10-15

### Added
- M-Pesa STK Push
- M-Pesa sandbox support
- Webhook handlers
- Basic documentation

### Fixed
- Connection pooling issues
- Timeout handling

## [0.1.0] - 2023-10-01

### Added
- Initial project setup
- MCP server foundation
- Configuration system
- Logging infrastructure

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.0 | 2024-02-15 | Stable release with 5 providers |
| 0.9.0 | 2024-02-01 | MTN MoMo support |
| 0.8.0 | 2024-01-15 | IntaSend integration |
| 0.7.0 | 2024-01-01 | Paystack bulk transfers |
| 0.6.0 | 2023-12-15 | Airtel Money beta |
| 0.5.0 | 2023-12-01 | M-Pesa C2B |
| 0.4.0 | 2023-11-15 | Paystack integration |
| 0.3.0 | 2023-11-01 | M-Pesa B2C |
| 0.2.0 | 2023-10-15 | M-Pesa STK Push |
| 0.1.0 | 2023-10-01 | Initial setup |

---

## Migration Guides

### Upgrading to 1.0.0

Breaking changes from 0.x:

1. **Tool Names** - Some tool names have been standardized:
   - `mpesaStkPush` → `mpesa_stk_push`
   - `paystackInit` → `paystack_initialize`

2. **Configuration** - New configuration format:
   ```javascript
   // Old
   { mpesa: { consumerKey: 'xxx' } }
   
   // New
   { providers: { mpesa: { consumerKey: 'xxx' } } }
   ```

3. **Response Format** - All responses now include `metadata`:
   ```json
   {
     "success": true,
     "data": { ... },
     "metadata": { "provider": "mpesa", "timestamp": "..." }
   }
   ```

### Deprecations

| Deprecated | Replacement | Removed In |
|------------|-------------|------------|
| `unified_validate_phone` | `unified_validate_recipient` | 2.0.0 |
| `mpesa_c2b_simulate` | Use sandbox mode | 2.0.0 |

---

For a complete list of changes, see the [GitHub Releases](https://github.com/kenyaclaw/africa-payments-mcp/releases) page.
