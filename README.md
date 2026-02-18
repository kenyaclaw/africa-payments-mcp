# 🌍 Africa Payments MCP

> **The missing piece for African fintech.** One MCP server. Every major African payment provider. Natural language payments.

[![CI](https://github.com/kenyaclaw/africa-payments-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kenyaclaw/africa-payments-mcp/actions/workflows/ci.yml)
[![Security](https://github.com/kenyaclaw/africa-payments-mcp/actions/workflows/security.yml/badge.svg)](https://github.com/kenyaclaw/africa-payments-mcp/actions/workflows/security.yml)
[![codecov](https://codecov.io/gh/kenyaclaw/africa-payments-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/kenyaclaw/africa-payments-mcp)
[![npm version](https://badge.fury.io/js/@kenyaclaw%2Fafrica-payments-mcp.svg)](https://badge.fury.io/js/@kenyaclaw%2Fafrica-payments-mcp)
[![Downloads](https://img.shields.io/npm/dm/@kenyaclaw/africa-payments-mcp.svg)](https://www.npmjs.com/package/@kenyaclaw/africa-payments-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built by Africans](https://img.shields.io/badge/Built%20by-Africans-008751)](https://github.com/kenyaclaw)

---

## ✨ What if accepting payments was as easy as sending a message?

```bash
# "Send KES 5,000 to Mary via M-Pesa"
# "Request $100 from a customer in Nigeria"  
# "Check if that MTN MoMo payment came through"
# "Process a refund for order #12345"
```

No more wrestling with 5 different APIs. No more juggling documentation.  
Just natural language that works across **M-Pesa**, **Paystack**, **MTN MoMo**, and more.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Africa Payments MCP Demo" width="800"/>
  <br>
  <em>See it in action with Claude, ChatGPT, Cursor, and any MCP client</em>
</p>

---

## 🎬 See It In Action

| Demo with Claude | Demo with Cursor |
|:----------------:|:----------------:|
| ![Claude Demo](docs/assets/claude-screenshot.png) | ![Cursor Demo](docs/assets/cursor-screenshot.png) |

---

## 💡 Why Africa Payments MCP?

### The Problem 😤

Africa has the world's most innovative payment systems—M-Pesa, Paystack, Flutterwave, MTN MoMo, Chipper Cash—but integrating them is a nightmare:

- 🔀 **Fragmented APIs**: M-Pesa uses SOAP. Paystack uses REST. MTN MoMo uses something entirely different.
- 📚 **Scattered Documentation**: Hours spent hunting for the right docs
- 🔧 **Different Auth Methods**: API keys, OAuth, basic auth—each one unique
- 🐛 **Edge Cases Everywhere**: Each provider has quirks that break your code
- ⏱️ **Weeks of Integration Time**: Before you process a single payment

### The Solution 🎯

**One MCP server. Every provider. Natural language.**

```typescript
// Instead of this...
const mpesa = new MpesaAPI({ consumerKey, consumerSecret, passkey });
await mpesa.authenticate();
const result = await mpesa.stkPush({ phone, amount, accountRef });

// Just say this:
"Send KES 5,000 to 254712345678 via M-Pesa"
```

### The Impact 🚀

- ⚡ **Ship in hours, not weeks** — Your first payment working today
- 🧠 **AI-native from day one** — Built for the era of AI agents
- 🌍 **Truly Pan-African** — One integration covers the continent
- 🔓 **Open Source** — MIT licensed, community-driven
- 🛠️ **Developer-First** — Built by Africans who understand the pain

---

## 🚀 Quick Start

### 1. Install

```bash
npm install -g @kenyaclaw/africa-payments-mcp
```

### 2. Configure

```bash
africa-payments-mcp init
# Follow the prompts to add your provider credentials
```

### 3. Connect to Your AI

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "africa-payments": {
      "command": "africa-payments-mcp",
      "env": {
        "MPESA_CONSUMER_KEY": "your_key",
        "PAYSTACK_SECRET_KEY": "your_key"
      }
    }
  }
}
```

### 4. Start Accepting Payments

Open Claude, ChatGPT, Cursor, or any MCP client and just ask:

> "Send KES 5,000 to Mary via M-Pesa"

---

## 🔌 Supported Providers

| Provider | Countries | Status | Features |
|----------|-----------|--------|----------|
| **M-Pesa** | 🇰🇪 Kenya, 🇹🇿 Tanzania, 🇲🇿 Mozambique, 🇨🇩 DRC, 🇪🇬 Egypt | ✅ Ready | STK Push, B2C, B2B, C2B, Reversal |
| **Paystack** | 🇳🇬 Nigeria, 🇬🇭 Ghana, 🇿🇦 South Africa, +4 more | ✅ Ready | Cards, Bank Transfer, Mobile Money |
| **MTN MoMo** | 🇳🇬 Nigeria, 🇬🇭 Ghana, 🇺🇬 Uganda, +12 more | ✅ Ready | Collections, Disbursements, Remittances |
| **Flutterwave** | 🇳🇬 Nigeria, 🇰🇪 Kenya, 🇿🇦 South Africa, +30 more | 🚧 Beta | Cards, Mobile Money, Bank Transfer |
| **Chipper Cash** | 🇳🇬 Nigeria, 🇬🇭 Ghana, 🇰🇪 Kenya, +7 more | 🚧 Beta | P2P Transfers, Payments |

> 💡 **Want to add a provider?** [See our contribution guide](CONTRIBUTING.md)

---

## 📖 Documentation

- [📚 Full Documentation](https://docs.africapayments.dev)
- [🚀 Quick Start Guide](docs/quickstart.md)
- [🔧 Provider Setup](docs/providers.md)
- [💻 API Reference](docs/api.md)
- [🧪 Examples](examples/)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your AI Agent                             │
│              (Claude, ChatGPT, Cursor, etc.)                │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
┌─────────────────────▼───────────────────────────────────────┐
│              Africa Payments MCP Server                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   M-Pesa    │ │  Paystack   │ │     MTN MoMo            │ │
│  │   Adapter   │ │   Adapter   │ │     Adapter             │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ Flutterwave │ │ ChipperCash │ │    More Coming...       │ │
│  │   Adapter   │ │   Adapter   │ │                         │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🌟 What Developers Are Saying

> *"Integrated M-Pesa in 10 minutes. Took me 3 weeks the old way."*  
> — **David O.**, Fintech Developer, Lagos

> *"Finally, payments that work the way I think about them."*  
> — **Grace W.**, Startup Founder, Nairobi

> *"The USB-C of African payments. One connection, everything works."*  
> — **Kofi A.**, Full Stack Engineer, Accra

---

## 🤝 Contributing

We built this for Africa's developers. Help us make it better:

1. 🍴 Fork the repo
2. 🌿 Create your branch (`git checkout -b feature/amazing-feature`)
3. 💻 Make your changes
4. ✅ Add tests
5. 📝 Update documentation
6. 🔀 Submit a PR

[Read our Contributing Guide](CONTRIBUTING.md)

---

## 📜 License

MIT License — use it, modify it, build the future of African fintech.

---

## 💬 Join the Community

- 🐦 [Twitter/X](https://twitter.com/africapayments)
- 💼 [LinkedIn](https://linkedin.com/company/africa-payments)
- 💬 [Discord](https://discord.gg/africapayments)
- 📧 [Email us](mailto:hello@africapayments.dev)

---

<p align="center">
  <strong>Built with ❤️ in Nairobi, Lagos, Accra, and across the continent</strong>
  <br>
  <em>🇰🇪 🇳🇬 🇬🇭 🇹🇿 🇺🇬 🇿🇦 🇪🇬 🇲🇦 🇷🇼 🇪🇹 🇸🇳 🇨🇮</em>
</p>

<p align="center">
  <img src="docs/assets/africa-payments-logo.svg" alt="Africa Payments MCP" width="200"/>
</p>


## 🚀 Launch Materials

Ready to launch? Check out our complete launch kit:
📋 **[LAUNCH.md](docs/LAUNCH.md)** - Twitter, HN, Dev.to, LinkedIn, Product Hunt templates


