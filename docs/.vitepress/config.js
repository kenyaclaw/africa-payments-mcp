import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Africa Payments MCP',
  description: 'One API for all African payments',
  
  lastUpdated: true,
  cleanUrls: true,
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c3c3c' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Africa Payments MCP' }],
    ['meta', { property: 'og:site_name', content: 'Africa Payments MCP' }],
    ['meta', { property: 'og:description', content: 'One API for all African payments' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started' },
      { text: 'Providers', link: '/providers/' },
      { text: 'API Reference', link: '/api/reference' },
      {
        text: 'v1.0.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: '/contributing' }
        ]
      }
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Configuration', link: '/configuration' }
          ]
        },
        {
          text: 'Providers',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/providers/' },
            { text: 'M-Pesa', link: '/providers/mpesa' },
            { text: 'Paystack', link: '/providers/paystack' },
            { text: 'MTN MoMo', link: '/providers/mtn-momo' },
            { text: 'IntaSend', link: '/providers/intasend' },
            { text: 'Airtel Money', link: '/providers/airtel-money' }
          ]
        },
        {
          text: 'Tools',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/tools/' },
            { text: 'Universal Tools', link: '/tools/universal' },
            { text: 'Provider-Specific', link: '/tools/provider-specific' }
          ]
        },
        {
          text: 'Integration',
          collapsed: false,
          items: [
            { text: 'Webhooks', link: '/webhooks' },
            { text: 'Examples', link: '/examples/' }
          ]
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'API Reference', link: '/api/reference' },
            { text: 'Contributing', link: '/contributing' },
            { text: 'Changelog', link: '/changelog' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kenyaclaw/africa-payments-mcp' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 KenyaClaw'
    },

    editLink: {
      pattern: 'https://github.com/kenyaclaw/africa-payments-mcp/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    }
  }
})
