# 🕴️ The Continental - Agent Swarm

The Continental is a 10-agent autonomous swarm system integrated into Africa Payments MCP for intelligent payment operations management.

## Agents Overview

| Agent | Name | Role | Key Responsibilities |
|-------|------|------|---------------------|
| CEO | Winston | Strategic Oversight | Transaction approval >$1,000, strategic decisions, overrides |
| CTO | John Wick | Technical Health | Infrastructure changes, provider integrations, technical escalation |
| CFO | Adjudicator | Financial Control | Cash flow monitoring, fraud detection, refund approval |
| COO | Doctor | Operations | System health, incident response, auto-remediation |
| CCO | Charon | Customer Success | Complaints, goodwill refunds, support tickets |
| CMO | Bowery King | Growth | Marketing campaigns, referral programs, acquisition |
| CRO | Sofia | Revenue | Sales pipeline, enterprise deals, pricing decisions |

## High Table Council

The High Table Council coordinates all agents through:
- **Voting System**: Democratic decision-making across agents
- **Consensus Building**: 66% threshold for approval
- **Tie-Breaking**: CEO (Winston) breaks ties
- **Agent Communication**: Direct messaging and broadcast system

## CLI Commands

### Check Agent Status
```bash
africa-payments-mcp agents status
africa-payments-mcp agents status --verbose
```

### List All Agents
```bash
africa-payments-mcp agents list
```

### Talk to an Agent
```bash
# Ask Winston to approve a transaction
africa-payments-mcp agents ask winston "approve transaction TX123"

# Check system health with John Wick
africa-payments-mcp agents ask john-wick "health status"

# Get cash flow from Adjudicator
africa-payments-mcp agents ask adjudicator "cash flow report"

# Check incidents with Doctor
africa-payments-mcp agents ask doctor "active incidents"

# Get support tickets from Charon
africa-payments-mcp agents ask charon "open tickets"

# Check campaigns with Bowery King
africa-payments-mcp agents ask bowery-king "top campaigns"

# Get sales pipeline from Sofia
africa-payments-mcp agents ask sofia "pipeline"
```

### Council Operations
```bash
# Show council status
africa-payments-mcp agents council --status

# List active voting sessions
africa-payments-mcp agents council --list

# Show session history
africa-payments-mcp agents council --history
```

### Send Notifications
```bash
# Notify specific agent
africa-payments-mcp agents notify ceo "Urgent: System issue detected"

# Broadcast to all agents
africa-payments-mcp agents notify all "Daily sync meeting" --priority high
```

### Generate Reports
```bash
# Report for specific agent
africa-payments-mcp agents report --agent cfo

# All agents summary
africa-payments-mcp agents report
```

## Programmatic Usage

```typescript
import { AgentSwarmIntegration } from '@kenyaclaw/africa-payments-mcp';

const swarm = new AgentSwarmIntegration(logger);

// Check transaction approval
const result = await swarm.checkTransactionApproval(transaction, params);
if (!result.approved) {
  console.log(`Transaction rejected: ${result.reason}`);
}

// Get all agent states
const states = swarm.getAllAgentStates();

// Get council for voting
const council = swarm.getCouncil();
const session = await council.initiateSession(
  'Approve New Provider',
  'Review integration of Provider X',
  'ceo'
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    THE CONTINENTAL                          │
│                    (Agent Swarm)                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  CEO    │ │  CTO    │ │  CFO    │ │  COO    │  ...      │
│  │ Winston │ │John Wick│ │Adjudic. │ │ Doctor  │           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       │           │           │           │                 │
│       └───────────┴───────────┴───────────┘                 │
│                   │                                         │
│              ┌────┴────┐                                    │
│              │ Council │  ← High Table Coordination         │
│              │(Voting) │                                    │
│              └────┬────┘                                    │
│                   │                                         │
│       ┌───────────┴───────────┐                             │
│       ▼                       ▼                             │
│  ┌──────────┐           ┌──────────┐                        │
│  │ Payment  │           │  Human   │                        │
│  │  Flow    │           │ Oversight│                        │
│  └──────────┘           └──────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

```typescript
const swarm = new AgentSwarmIntegration(logger, {
  enabled: true,
  autoApprovalEnabled: true,
  humanEscalationEnabled: true,
  logAllDecisions: true,
  decisionTimeoutMs: 30000,
});
```

## Integration Points

The agent swarm integrates with:
- **Payment Flow**: Transaction approval middleware
- **Refund Flow**: Refund approval workflow
- **Infrastructure**: Change approval gates
- **Provider Onboarding**: Integration approval process
- **Monitoring**: System health and incident response

## File Structure

```
src/agents/
├── types.ts        # Shared types and interfaces
├── base.ts         # Base agent class
├── ceo.ts          # Winston - CEO Agent
├── cto.ts          # John Wick - CTO Agent
├── cfo.ts          # Adjudicator - CFO Agent
├── coo.ts          # Doctor - COO Agent
├── cco.ts          # Charon - CCO Agent
├── cmo.ts          # Bowery King - CMO Agent
├── cro.ts          # Sofia - CRO Agent
├── council.ts      # High Table Council
├── integration.ts  # Payment flow integration
├── cli.ts          # CLI commands
├── index.ts        # Exports
└── README.md       # This file
```

## Rules of The Continental

1. **No Business on Continental Grounds**: Agents operate independently within their domains
2. **Be Seeing You**: All decisions are logged and visible
3. **Excommunicado**: Agents can be deactivated if compromised
4. **High Table Decisions**: Council votes on cross-cutting concerns
5. **Human Override**: Human operators can always override agent decisions

---

*"The Continental is now operational. Welcome to the High Table."*
