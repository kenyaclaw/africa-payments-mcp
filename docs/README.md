# Africa Payments MCP Documentation

This directory contains the documentation website for Africa Payments MCP, built with [VitePress](https://vitepress.dev/).

## Structure

```
docs/
├── .vitepress/           # VitePress configuration
│   ├── config.js         # Site configuration
│   └── theme/            # Custom theme
│       ├── index.js
│       └── custom.css
├── index.md              # Homepage
├── getting-started.md    # Quick start guide
├── configuration.md      # Configuration reference
├── webhooks.md           # Webhook documentation
├── contributing.md       # Contribution guidelines
├── changelog.md          # Release notes
├── providers/            # Provider documentation
│   ├── index.md
│   ├── mpesa.md
│   ├── paystack.md
│   ├── mtn-momo.md
│   ├── intasend.md
│   └── airtel-money.md
├── tools/                # Tools documentation
│   ├── index.md
│   ├── universal.md
│   └── provider-specific.md
├── examples/             # Usage examples
│   ├── index.md
│   ├── claude.md
│   ├── cursor.md
│   ├── nodejs.md
│   └── python.md
└── api/
    └── reference.md      # API reference
```

## Local Development

### Prerequisites

- Node.js 18+ installed

### Setup

```bash
# Navigate to docs directory
cd docs

# Install dependencies
npm install

# Start development server
npm run docs:dev
```

The dev server will start at `http://localhost:5173`

### Build

```bash
# Build for production
npm run docs:build

# Preview production build
npm run docs:preview
```

## Writing Documentation

### Markdown Files

All documentation is written in Markdown. VitePress supports:

- Standard Markdown syntax
- Frontmatter for page metadata
- Vue components in Markdown
- Custom containers (tips, warnings, etc.)

### Frontmatter

Each page can have frontmatter at the top:

```yaml
---
title: Page Title
description: Page description for SEO
---
```

### Custom Containers

```markdown
::: tip
This is a tip
:::

::: warning
This is a warning
:::

::: danger STOP
This is a danger block
:::

::: details Click to expand
Hidden content
:::
```

### Code Blocks

````markdown
```typescript
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',
  amount: 1000
});
```
````

With line highlights:

````markdown
```typescript{2,4}
const result = await client.callTool('mpesa_stk_push', {
  phoneNumber: '254712345678',  // This line is highlighted
  amount: 1000,
  accountReference: 'ORDER-123' // This line too
});
```
````

## Deployment

Documentation is automatically deployed to GitHub Pages when:

1. Changes are pushed to `main` branch in `docs/` folder
2. Manually triggered via GitHub Actions

The deployment workflow is defined in `.github/workflows/docs.yml`.

### GitHub Pages Setup

1. Go to repository **Settings** → **Pages**
2. Under **Build and deployment**:
   - **Source**: GitHub Actions
3. Save settings

## Contributing

When updating documentation:

1. Follow existing style and structure
2. Test locally before pushing
3. Update changelog if making significant changes
4. Ensure all links work correctly

## Resources

- [VitePress Documentation](https://vitepress.dev/)
- [Markdown Guide](https://www.markdownguide.org/)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
