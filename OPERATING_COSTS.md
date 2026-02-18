# Africa Payments MCP - Operating Costs

> **Adjudicator Analysis** | KenyaClaw CFO  
> Cost Structure & Break-Even Analysis | February 2026

---

## Overview

This document details the operating costs for Africa Payments MCP under two scenarios:
1. **User Self-Hosted** (Free tier) - Costs borne by users
2. **KenyaClaw Managed Service** (Pro/Enterprise tiers) - Costs borne by KenyaClaw

---

## Scenario 1: User Self-Hosted (Free Tier)

When users choose to self-host the open-source MCP server, they bear the infrastructure costs.

### User Infrastructure Requirements

| Component | Minimum Spec | Recommended Spec |
|-----------|--------------|------------------|
| **Server** | 1 vCPU, 2GB RAM | 2 vCPU, 4GB RAM |
| **Storage** | 10GB SSD | 50GB SSD |
| **Database** | SQLite (included) | PostgreSQL |
| **Network** | 100GB/month | 1TB/month |

### User Cost Estimates

| Provider | Minimal Setup | Recommended Setup |
|----------|---------------|-------------------|
| **AWS Lightsail** | $5/month | $20/month |
| **DigitalOcean** | $6/month | $24/month |
| **Hetzner** | €3/month | €10/month |
| **Vercel (Serverless)** | $0 (hobby) | $20/month |
| **Self Hardware** | $0 | Electricity only |

### Additional User Costs

| Cost Item | Description | Typical Cost |
|-----------|-------------|--------------|
| **Domain** | Custom domain | $10-15/year |
| **SSL Certificate** | Let's Encrypt (free) or paid | $0-50/year |
| **API Provider Fees** | M-Pesa, Paystack, etc. | Per-transaction |
| **Backup Storage** | S3, etc. | $5-20/month |
| **Monitoring** | Uptime monitoring | $0-30/month |

**Total User Self-Hosted Cost: $0-50/month**

---

## Scenario 2: KenyaClaw Managed Service

When users subscribe to Pro ($49/mo) or Enterprise ($499/mo) tiers, KenyaClaw hosts and manages the infrastructure.

### Base Infrastructure Costs

| Service | Provider | Monthly Cost | Purpose |
|---------|----------|--------------|---------|
| **Compute** | AWS ECS / GCP Cloud Run | $200 | Container hosting |
| **Database** | AWS RDS PostgreSQL | $100 | Primary data store |
| **Cache** | AWS ElastiCache Redis | $50 | Session & rate limiting |
| **Object Storage** | AWS S3 | $30 | Logs, exports |
| **CDN** | CloudFront | $50 | Static assets, API edge |
| **DNS** | Route 53 | $25 | Domain management |
| **Load Balancer** | ALB | $25 | Traffic distribution |
| **VPC/Networking** | AWS | $50 | Private networking |
| **Total Base Infrastructure** | | **$530** | |

### DevOps & Tooling Costs

| Tool | Tier | Monthly Cost | Purpose |
|------|------|--------------|---------|
| **DataDog** | Pro | $100 | Monitoring, APM |
| **Sentry** | Team | $26 | Error tracking |
| **GitHub Actions** | Team | $50 | CI/CD |
| **npm Pro** | Pro | $7 | Private packages |
| **Docker Hub** | Pro | $5 | Image registry |
| **Terraform Cloud** | Free | $0 | IaC |
| **PagerDuty** | Starter | $29 | Incident management |
| **Total DevOps** | | **$217** | |

### Security & Compliance Costs

| Item | Frequency | Monthly Equivalent | Purpose |
|------|-----------|-------------------|---------|
| **SSL Certificates** | Annual | $8 | Wildcard cert |
| **Security Scanning** | Monthly | $50 | Vulnerability scans |
| **Penetration Testing** | Quarterly | $83 | External security audit |
| **SOC 2 Compliance** | Annual | $417 | Certification (Year 2+) |
| **Total Security** | | **$558** | (Heavy in first year) |

### Support Infrastructure Costs

| Tool | Monthly Cost | Purpose |
|------|--------------|---------|
| **Intercom/Help Scout** | $50 | Customer support |
| **Status Page** | $29 | Statuspage.io |
| **Documentation Hosting** | $20 | ReadMe or equivalent |
| **Total Support** | **$99** | |

### Operational Overhead

| Category | Monthly Cost | Description |
|----------|--------------|-------------|
| **Legal/Compliance** | $100 | Retainer, contract review |
| **Accounting** | $200 | Bookkeeping, reporting |
| **Insurance** | $150 | Cyber liability, E&O |
| **Office/Remote** | $200 | Co-working, equipment |
| **Communications** | $50 | Slack, Zoom, etc. |
| **Total Overhead** | **$700** | |

### Total Fixed Monthly Costs (Base)

| Category | Monthly Cost |
|----------|--------------|
| Infrastructure | $530 |
| DevOps & Tooling | $217 |
| Security & Compliance | $200 (normalized) |
| Support Infrastructure | $99 |
| Operational Overhead | $700 |
| **Total Base** | **$1,746/month** |

> Note: The $833 mentioned in the business model reflects a lean startup phase. Full operational readiness requires ~$1,746/month.

---

## Variable Costs by Scale

### Per-User Incremental Costs

| Metric | Cost | Notes |
|--------|------|-------|
| **Compute per 1000 users** | $150/month | Container scaling |
| **Database per 1000 users** | $50/month | Read replicas |
| **Storage per 1000 users** | $30/month | Log retention |
| **Bandwidth per 1000 users** | $70/month | API traffic |
| **Support per 1000 users** | $200/month | 1 support agent per 2000 users |
| **Total per 1000 users** | **$500/month** | |

### Per-Transaction Costs

| Cost Item | Rate | Notes |
|-----------|------|-------|
| **API Request** | $0.0001 | CloudFront + Lambda |
| **Webhook Delivery** | $0.001 | Retry logic included |
| **Log Storage** | $0.10/GB | Compressed, 30-day default |
| **Database Operation** | Negligible | Included in RDS cost |

---

## Cost Projections by Scale

### Monthly Costs at Different User Levels

| Users | Fixed | Variable | Total | Per User |
|-------|-------|----------|-------|----------|
| 1,000 | $1,746 | $500 | $2,246 | $2.25 |
| 5,000 | $1,746 | $2,500 | $4,246 | $0.85 |
| 10,000 | $1,746 | $5,000 | $6,746 | $0.67 |
| 25,000 | $1,746 | $12,500 | $14,246 | $0.57 |
| 50,000 | $1,746 | $25,000 | $26,746 | $0.53 |
| 100,000 | $2,500* | $50,000 | $52,500 | $0.53 |

*At 100K users, additional fixed costs for enterprise infrastructure

---

## Break-Even Analysis

### Assumptions

| Metric | Value |
|--------|-------|
| Average Revenue Per User (ARPU) | $50/month |
| Gross Margin Target | 80% |
| Fixed Costs | $1,746/month |
| Variable Cost per User | $0.50/month |

### Break-Even Calculation

```
Revenue = Fixed Costs + Variable Costs
$50 × N = $1,746 + ($0.50 × N)
$50N - $0.50N = $1,746
$49.50N = $1,746
N = 35.3 paying customers

Break-even: 36 paying customers
```

### Break-Even at Different Conversion Rates

| Total Users | Conversion | Paying Customers | MRR | Monthly Cost | Profit/Loss |
|-------------|------------|------------------|-----|--------------|-------------|
| 500 | 5% | 25 | $1,250 | $1,871 | -$621 |
| 720 | 5% | 36 | $1,800 | $2,106 | -$306 |
| 1,000 | 5% | 50 | $2,500 | $2,296 | +$204 |
| 2,000 | 5% | 100 | $5,000 | $2,846 | +$2,154 |
| 5,000 | 5% | 250 | $12,500 | $4,246 | +$8,254 |

**At 5% conversion: Break-even at 720 total users (36 paying)**

---

## Unit Economics

### Lifetime Value (LTV) Calculation

| Metric | Value |
|--------|-------|
| Monthly Revenue | $50 |
| Gross Margin | 90% |
| Monthly Contribution | $45 |
| Average Lifetime | 24 months |
| **LTV** | **$1,080** |

### Customer Acquisition Cost (CAC)

| Channel | CAC | Volume |
|---------|-----|--------|
| Organic/Content | $10 | High |
| Community/Events | $25 | Medium |
| Paid Social | $50 | Medium |
| Partnerships | $75 | Low |
| **Blended CAC** | **~$35** | |

### LTV:CAC Ratio

```
LTV:CAC = $1,080 : $35 = 30.9:1

Rule of Thumb:
• 3:1 = Good
• 5:1 = Great
• 10:1 = Excellent
• 30:1 = Exceptional (or CAC too low, can invest more)
```

**Recommendation:** Increase marketing spend to accelerate growth while maintaining 10:1+ ratio.

---

## Cost Optimization Strategies

### Phase 1: Startup (0-1000 users)
- Use serverless where possible (pay-per-use)
- Single-region deployment
- Community support only
- Open source tools

### Phase 2: Growth (1000-10000 users)
- Multi-region for reliability
- Automated scaling
- Tier-1 support during business hours
- Invest in monitoring

### Phase 3: Scale (10000+ users)
- Dedicated infrastructure for Enterprise
- 24/7 support coverage
- Advanced caching strategies
- Reserved instance pricing

---

## Monthly Operating Cost Summary

### Minimal Viable Operation

| Category | Monthly |
|----------|---------|
| Infrastructure | $400 |
| Tools | $100 |
| Support | $0 (community) |
| Overhead | $333 |
| **Total** | **$833** |

### Recommended Operation

| Category | Monthly |
|----------|---------|
| Infrastructure | $530 |
| Tools | $217 |
| Support | $99 |
| Overhead | $700 |
| Marketing | $2,000 |
| **Total** | **$3,546** |

### Full-Scale Operation (10,000 users)

| Category | Monthly |
|----------|---------|
| Infrastructure | $5,530 |
| Tools | $500 |
| Support | $1,000 |
| Overhead | $1,000 |
| Marketing | $5,000 |
| Team (5 people) | $20,000 |
| **Total** | **$33,030** |
| Revenue (5% × 10,000 × $50) | $25,000 |
| **Deficit** | **-$8,030** |

> At 10,000 users with current pricing, we need 660+ paying customers to cover full team costs, requiring 6.6% conversion.

---

## Recommendations

### 1. Pricing Validation
Current pricing ($49 Pro, $499 Enterprise) appears viable with:
- 5%+ conversion rate to paid
- Efficient customer acquisition
- Gradual team growth aligned with revenue

### 2. Cost Monitoring
Track monthly:
- Infrastructure cost per user
- Support tickets per user
- Gross margin by tier
- CAC by channel

### 3. Scaling Triggers
Hire additional team when:
- MRR > $10,000 (first support hire)
- MRR > $25,000 (second engineer)
- MRR > $50,000 (dedicated sales)

### 4. Margin Protection
Maintain 80%+ gross margin by:
- Optimizing infrastructure (reserved instances)
- Automating support (chatbots, docs)
- Limiting free tier abuse (rate limits)

---

*Assessment: **OPERATIONALLY VIABLE** — Costs are reasonable for a SaaS business with clear paths to break-even and profitability.*
