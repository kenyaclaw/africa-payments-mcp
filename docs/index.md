---
layout: home

hero:
  name: "Africa Payments MCP"
  text: "One API for all African payments"
  tagline: Connect AI agents to M-Pesa, Paystack, MTN MoMo, and more with natural language
  image:
    src: /logo.png
    alt: Africa Payments MCP
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/kenyaclaw/africa-payments-mcp
    - theme: alt
      text: API Reference
      link: /api/reference

features:
  - icon: 🌍
    title: Pan-African Coverage
    details: M-Pesa, Paystack, MTN MoMo, Airtel Money, and more. One unified API for all major African payment providers.
  - icon: 🤖
    title: AI-Native
    details: Natural language payment operations. Your AI agents can send money, request payments, and check balances with simple commands.
  - icon: 🔒
    title: Secure
    details: Webhook signature verification, encrypted credentials, secure credential storage, and comprehensive audit logging.
  - icon: ⚡
    title: Fast
    details: Smart provider routing, automatic retries, connection pooling, and optimized for low-latency payment operations.
  - icon: 📊
    title: Observable
    details: Built-in logging, metrics collection, request tracing, and health checks for complete operational visibility.
  - icon: 🔧
    title: Extensible
    details: Easy to add new providers. Modular architecture with provider adapters and a clean plugin interface.
---

## Quick Start

Install the Africa Payments MCP server and start processing payments in minutes.

::: code-group

```bash [npx]
npx -y @africa-payments/mcp-server
```

```bash [npm]
npm install -g @africa-payments/mcp-server
```

```bash [Claude Desktop]
# Add to your claude_desktop_config.json:
{
  "mcpServers": {
    "africa-payments": {
      "command": "npx",
      "args": ["-y", "@africa-payments/mcp-server"],
      "env": {
        "MPESA_CONSUMER_KEY": "your_key",
        "MPESA_CONSUMER_SECRET": "your_secret"
      }
    }
  }
}
```

:::

## Supported Providers

<div class="provider-grid">

| Provider | Countries | Status |
|----------|-----------|--------|
| [M-Pesa](./providers/mpesa) | Kenya, Tanzania, Uganda, DRC, Mozambique, Lesotho | ✅ Ready |
| [Paystack](./providers/paystack) | Nigeria, Ghana, South Africa, Kenya | ✅ Ready |
| [MTN MoMo](./providers/mtn-momo) | 16+ African countries | ✅ Ready |
| [IntaSend](./providers/intasend) | Kenya, Nigeria, Ghana | ✅ Ready |
| [Airtel Money](./providers/airtel-money) | 14+ African countries | ✅ Ready |

</div>

## Example Usage

```typescript
// Send money via M-Pesa
const result = await client.callTool('unified_send_money', {
  recipient_phone: '+254712345678',
  amount: 5000,
  currency: 'KES'
});

// Request payment via Paystack
const result = await client.callTool('paystack_initialize', {
  email: 'customer@example.com',
  amount: 500000, // in kobo
  currency: 'NGN'
});
```

## Why Africa Payments MCP?

Building payment integrations for African markets is complex. Each provider has different APIs, authentication methods, and webhook formats. Africa Payments MCP simplifies this by providing:

- **Unified Interface**: One consistent API for all providers
- **AI Integration**: Built for Claude, Cursor, and other AI assistants
- **Local Expertise**: Designed specifically for African payment challenges
- **Production Ready**: Battle-tested in production environments

## Community & Support

- 💬 [Discord Community](https://discord.gg/africa-payments-mcp)
- 🐦 [Twitter/X](https://twitter.com/kenyaclaw)
- 📧 [Email Support](mailto:hello@kenyaclaw.com)
- 🐛 [GitHub Issues](https://github.com/kenyaclaw/africa-payments-mcp/issues)

## License

MIT License © 2024 [KenyaClaw](https://github.com/kenyaclaw)
