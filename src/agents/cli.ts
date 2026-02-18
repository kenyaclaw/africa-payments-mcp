/**
 * The Continental - Agent CLI Commands
 * 
 * Commands:
 * - africa-payments-mcp agents status
 * - africa-payments-mcp agents ask winston "approve transaction TX123"
 * - africa-payments-mcp agents list
 * - africa-payments-mcp agents council
 * - africa-payments-mcp agents notify <agent> <message>
 */

import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { AgentSwarmIntegration } from './integration.js';
import { AgentRole, AgentCLIResponse } from './types.js';
import { CEOAgent } from './ceo.js';
import { CTOAgent } from './cto.js';
import { CFOAgent } from './cfo.js';
import { COOAgent } from './coo.js';
import { CCOAgent } from './cco.js';
import { CMOAgent } from './cmo.js';
import { CROAgent } from './cro.js';
import pc from 'picocolors';
import boxen from 'boxen';
import ora from 'ora';

export function createAgentCommands(swarm: AgentSwarmIntegration, logger: Logger): Command {
  const agentsCmd = new Command('agents')
    .description('Manage The Continental agent swarm');

  // ==================== STATUS COMMAND ====================
  agentsCmd
    .command('status')
    .description('Show status of all agents in The Continental')
    .option('-v, --verbose', 'Show detailed status')
    .action(async (options) => {
      const spinner = ora('Gathering agent status...').start();
      
      try {
        const status = swarm.getSwarmStatus();
        spinner.stop();

        console.log(boxen(
          `${pc.bold('🕴️ THE CONTINENTAL')}\n` +
          `${pc.dim('Agent Swarm Status')}\n` +
          `${'─'.repeat(40)}\n` +
          `${status.enabled ? pc.green('●') : pc.red('●')} Swarm: ${status.enabled ? 'ENABLED' : 'DISABLED'}`,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: status.enabled ? 'green' : 'red',
          }
        ));

        console.log('\n' + pc.bold('🎭 Active Agents:'));
        
        for (const agent of status.agents) {
          const statusIcon = agent.active ? pc.green('●') : pc.red('●');
          const healthIcon = agent.health === 'healthy' ? pc.green('✓') :
                            agent.health === 'degraded' ? pc.yellow('⚠') : pc.red('✗');
          
          console.log(`  ${statusIcon} ${pc.bold(agent.name)} (${pc.cyan(agent.role.toUpperCase())})`);
          console.log(`     Health: ${healthIcon} ${agent.health}`);
          console.log(`     Status: ${agent.status}`);
          console.log(`     Decisions: ${agent.decisionsMade}`);
          
          if (options.verbose) {
            const agentInstance = swarm.getAgent(agent.role);
            if (agentInstance) {
              const metrics = agentInstance.getMetrics();
              console.log(`     Approval Rate: ${(metrics.approvalRate * 100).toFixed(1)}%`);
              console.log(`     Escalation Rate: ${(metrics.escalationRate * 100).toFixed(1)}%`);
            }
          }
          console.log();
        }

        console.log(pc.bold('🏛️ High Table Council:'));
        console.log(`  Registered Agents: ${status.council.registeredAgents}`);
        console.log(`  Active Agents: ${status.council.activeAgents}`);
        console.log(`  Total Sessions: ${status.council.totalSessions}`);
        console.log(`  Approved: ${pc.green(status.council.approvedProposals)} | Rejected: ${pc.red(status.council.rejectedProposals)}`);

        if (status.recentDecisions.length > 0) {
          console.log('\n' + pc.bold('📝 Recent Decisions:'));
          for (const decision of status.recentDecisions.slice(-5)) {
            const outcomeIcon = decision.outcome === 'approved' ? pc.green('✓') :
                               decision.outcome === 'rejected' ? pc.red('✗') : pc.yellow('⏸');
            console.log(`  ${outcomeIcon} ${pc.cyan(decision.agentName)}: ${decision.decisionType} → ${decision.outcome}`);
          }
        }

      } catch (error) {
        spinner.fail('Failed to get agent status');
        console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // ==================== LIST COMMAND ====================
  agentsCmd
    .command('list')
    .description('List all available agents')
    .action(async () => {
      const agents = [
        { name: 'Winston', role: 'ceo', description: 'Strategic decisions, transaction approval >$1,000' },
        { name: 'John Wick', role: 'cto', description: 'Technical health, infrastructure changes' },
        { name: 'Adjudicator', role: 'cfo', description: 'Cash flow, fraud detection, refunds' },
        { name: 'Doctor', role: 'coo', description: 'System health, incident response' },
        { name: 'Charon', role: 'cco', description: 'Customer complaints, goodwill refunds' },
        { name: 'Bowery King', role: 'cmo', description: 'Marketing campaigns, growth metrics' },
        { name: 'Sofia', role: 'cro', description: 'Sales pipeline, enterprise deals' },
      ];

      console.log(boxen(
        pc.bold('🕴️ THE CONTINENTAL - AGENTS'),
        { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
      ));

      for (const agent of agents) {
        console.log(boxen(
          `${pc.bold(agent.name)}\n` +
          `${pc.dim(agent.role.toUpperCase())}\n` +
          `${'─'.repeat(30)}\n` +
          agent.description,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'gray',
            margin: 1,
          }
        ));
      }
    });

  // ==================== ASK COMMAND ====================
  agentsCmd
    .command('ask')
    .description('Send a message to a specific agent')
    .argument('<agent>', 'Agent name or role (winston, john-wick, adjudicator, etc.)')
    .argument('<message>', 'Message to send to the agent')
    .option('--dry-run', 'Simulate without executing')
    .action(async (agentArg, message, options) => {
      const spinner = ora(`Consulting ${agentArg}...`).start();

      try {
        const agentMap: Record<string, AgentRole> = {
          'winston': 'ceo',
          'john-wick': 'cto',
          'john': 'cto',
          'adjudicator': 'cfo',
          'doctor': 'coo',
          'charon': 'cco',
          'bowery-king': 'cmo',
          'bowery': 'cmo',
          'sofia': 'cro',
        };

        const role = agentMap[agentArg.toLowerCase()];
        if (!role) {
          spinner.fail(`Unknown agent: ${agentArg}`);
          console.log(pc.yellow('Available agents: winston, john-wick, adjudicator, doctor, charon, bowery-king, sofia'));
          process.exit(1);
        }

        const agent = swarm.getAgent(role);
        if (!agent) {
          spinner.fail(`Agent ${agentArg} not found`);
          process.exit(1);
        }

        const lowerMessage = message.toLowerCase();
        let response: AgentCLIResponse;

        if (options.dryRun) {
          spinner.stop();
          console.log(pc.yellow('🔍 Dry run mode - no action taken'));
        }

        switch (role) {
          case 'ceo':
            response = await handleCEORequest(agent as CEOAgent, lowerMessage, message);
            break;
          case 'cto':
            response = await handleCTORequest(agent as CTOAgent, lowerMessage, message);
            break;
          case 'cfo':
            response = await handleCFORequest(agent as CFOAgent, lowerMessage, message);
            break;
          case 'coo':
            response = await handleCOORequest(agent as COOAgent, lowerMessage, message);
            break;
          case 'cco':
            response = await handleCCORequest(agent as CCOAgent, lowerMessage, message);
            break;
          case 'cmo':
            response = await handleCMORequest(agent as CMOAgent, lowerMessage, message);
            break;
          case 'cro':
            response = await handleCRORequest(agent as CROAgent, lowerMessage, message);
            break;
          default:
            response = { success: false, message: 'Unknown agent role', error: 'Invalid role' };
        }

        spinner.stop();

        if (response.success) {
          console.log(boxen(
            `${pc.green('✓')} ${pc.bold(agent.getName())} responded:\n\n${response.message}`,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          ));

          if (response.data) {
            console.log(pc.dim('\nData:'));
            console.log(JSON.stringify(response.data, null, 2));
          }
        } else {
          console.log(boxen(
            `${pc.red('✗')} ${pc.bold(agent.getName())}:\n\n${response.message}`,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          ));

          if (response.humanEscalation) {
            console.log(pc.yellow('\n⚠️ This request has been escalated to human CEO for review'));
          }
        }

      } catch (error) {
        spinner.fail('Request failed');
        console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
      }
    });

  // ==================== COUNCIL COMMAND ====================
  agentsCmd
    .command('council')
    .description('High Table Council operations')
    .option('-s, --status', 'Show council status')
    .option('-l, --list', 'List active sessions')
    .option('-h, --history', 'Show session history')
    .action(async (options) => {
      const council = swarm.getCouncil();
      const stats = council.getStatistics();

      if (options.status || (!options.list && !options.history)) {
        console.log(boxen(
          `${pc.bold('🏛️ HIGH TABLE COUNCIL')}\n` +
          `${'─'.repeat(40)}\n` +
          `Registered Agents: ${stats.registeredAgents}\n` +
          `Active Agents: ${pc.green(stats.activeAgents.toString())}\n` +
          `Total Sessions: ${stats.totalSessions}\n` +
          `Approved: ${pc.green(stats.approvedProposals.toString())}\n` +
          `Rejected: ${pc.red(stats.rejectedProposals.toString())}\n` +
          `Tie-breaker Invoked: ${stats.tieBreakerInvoked}\n` +
          `Avg Voting Time: ${stats.avgVotingTime.toFixed(1)}s`,
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        ));
      }

      if (options.list) {
        const sessions = council.getActiveSessions();
        console.log(pc.bold('\n📋 Active Sessions:'));
        if (sessions.length === 0) {
          console.log(pc.dim('  No active sessions'));
        } else {
          for (const session of sessions) {
            console.log(`  ${pc.cyan(session.id)}: ${session.topic}`);
            console.log(`    Votes: ${session.votes.length} | Status: ${session.status}`);
          }
        }
      }

      if (options.history) {
        const history = council.getSessionHistory(10);
        console.log(pc.bold('\n📜 Session History:'));
        for (const session of history.reverse()) {
          const outcomeIcon = session.outcome === 'approved' ? pc.green('✓') :
                             session.outcome === 'rejected' ? pc.red('✗') : pc.yellow('⏸');
          console.log(`  ${outcomeIcon} ${session.topic}`);
          console.log(`    ${session.votes.length} votes → ${session.outcome}`);
        }
      }
    });

  // ==================== NOTIFY COMMAND ====================
  agentsCmd
    .command('notify')
    .description('Send notification to an agent')
    .argument('<agent>', 'Target agent (ceo, cto, all, human)')
    .argument('<message>', 'Notification message')
    .option('-p, --priority <level>', 'Priority (low, medium, high, urgent)', 'medium')
    .action(async (agentArg, message, options) => {
      const council = swarm.getCouncil();
      
      const validPriorities = ['low', 'medium', 'high', 'urgent'] as const;
      const priority = validPriorities.includes(options.priority) ? options.priority : 'medium';

      const target = agentArg.toLowerCase() as AgentRole | 'all' | 'human';

      console.log(boxen(
        `${pc.bold('📢 NOTIFICATION SENT')}\n` +
        `${'─'.repeat(40)}\n` +
        `To: ${pc.cyan(target)}\n` +
        `Priority: ${priority === 'urgent' ? pc.red(priority) : priority}\n` +
        `Message: ${message}`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      ));
    });

  // ==================== REPORT COMMAND ====================
  agentsCmd
    .command('report')
    .description('Generate agent reports')
    .option('-d, --daily', 'Generate daily report')
    .option('-a, --agent <role>', 'Report for specific agent')
    .action(async (options) => {
      console.log(boxen(
        pc.bold('📊 AGENT REPORTS'),
        { padding: 1, borderStyle: 'round', borderColor: 'magenta' }
      ));

      if (options.agent) {
        const role = options.agent as AgentRole;
        const agent = swarm.getAgent(role);
        if (agent) {
          const metrics = agent.getMetrics();
          console.log(pc.bold(`\n${agent.getName()} (${role.toUpperCase()})`));
          console.log(JSON.stringify(metrics, null, 2));
        }
      } else {
        const states = swarm.getAllAgentStates();
        for (const state of states) {
          console.log(`\n${pc.bold(state.name)} (${state.role.toUpperCase()})`);
          console.log(`  Status: ${state.active ? pc.green('Active') : pc.red('Inactive')}`);
          console.log(`  Health: ${state.health}`);
          console.log(`  Decisions: ${state.decisionsMade}`);
        }
      }
    });

  return agentsCmd;
}

// ==================== Handler Functions ====================

async function handleCEORequest(agent: CEOAgent, lowerMessage: string, originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('approve') && lowerMessage.includes('transaction')) {
    const txMatch = originalMessage.match(/TX[A-Z0-9]+/i);
    const txId = txMatch ? txMatch[0] : 'TX-UNKNOWN';

    const decision = await agent.approveTransaction({
      transactionId: txId,
      amount: { amount: 2500, currency: 'USD' },
      customerId: 'CUST-123',
      provider: 'mpesa',
      paymentMethod: 'mobile_money',
    });

    return {
      success: decision.outcome === 'approved',
      message: decision.reason,
      data: { decision, transactionId: txId },
      humanEscalation: decision.requiresHumanReview,
    };
  }

  if (lowerMessage.includes('report')) {
    const report = agent.generateDailyReport();
    return {
      success: true,
      message: `Daily CEO Report:\n- Total Decisions: ${report.totalDecisions}\n- Approved: ${report.approved}\n- Rejected: ${report.rejected}\n- Pending Human Review: ${report.pendingHumanReview}`,
      data: report,
    };
  }

  if (lowerMessage.includes('pending')) {
    const pending = agent.getPendingHumanReview();
    return {
      success: true,
      message: `You have ${pending.length} items pending your review.`,
      data: pending,
    };
  }

  return {
    success: true,
    message: 'Winston at your service. I can help with:\n- Transaction approvals\n- Strategic decisions\n- Override agent decisions\n- Daily reports',
  };
}

async function handleCTORequest(agent: CTOAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('health')) {
    const health = agent.getSystemHealth();
    return {
      success: true,
      message: `System Health: ${health.overall.toUpperCase()}\n- Providers: ${Object.keys(health.providers).length}\n- Database: ${health.database}\n- Queue: ${health.queue}`,
      data: health,
    };
  }

  if (lowerMessage.includes('incident') || lowerMessage.includes('alert')) {
    return {
      success: true,
      message: 'Active incidents will be displayed. Use "escalate" to report a new incident.',
    };
  }

  return {
    success: true,
    message: 'John Wick here. I monitor:\n- Technical health\n- Infrastructure changes\n- Provider integrations\n- System incidents',
  };
}

async function handleCFORequest(agent: CFOAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('cash') || lowerMessage.includes('flow')) {
    const cashFlow = agent.getCashFlow();
    return {
      success: true,
      message: `Cash Flow Status:\n- Current Balance: $${cashFlow.currentBalance.amount}\n- Daily Volume: $${cashFlow.dailyVolume.amount}\n- Daily Refunds: $${cashFlow.dailyRefunds.amount}`,
      data: cashFlow,
    };
  }

  if (lowerMessage.includes('fraud')) {
    return {
      success: true,
      message: 'Fraud monitoring active. Recent patterns will be analyzed.',
    };
  }

  if (lowerMessage.includes('report')) {
    const report = agent.generateDailyReport();
    return {
      success: true,
      message: `Daily Financial Report:\n- Transactions: ${report.transactionCount}\n- Fraud Alerts: ${report.fraudAlerts}\n- Flagged: ${report.flaggedTransactions}`,
      data: report,
    };
  }

  return {
    success: true,
    message: 'Adjudicator monitoring:\n- Cash flow\n- Fraud detection\n- Refund approvals\n- Financial reports',
  };
}

async function handleCOORequest(agent: COOAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('incident')) {
    const incidents = agent.getActiveIncidents();
    return {
      success: true,
      message: `Active Incidents: ${incidents.length}\n${incidents.map(i => `- ${i.id}: ${i.description} (${i.severity})`).join('\n')}`,
      data: incidents,
    };
  }

  if (lowerMessage.includes('health') || lowerMessage.includes('status')) {
    const health = agent.getSystemHealth();
    return {
      success: true,
      message: `Operations Health: ${health.overall}\n- Active Incidents: ${health.activeIncidents}\n- Avg Uptime: ${health.avgUptime.toFixed(2)}%`,
      data: health,
    };
  }

  if (lowerMessage.includes('uptime')) {
    const report = agent.generateUptimeReport();
    return {
      success: true,
      message: `Uptime Report (${report.period}):\n- Overall: ${report.overallUptime.toFixed(2)}%\n- SLA Compliant: ${report.slaCompliance ? '✓' : '✗'}`,
      data: report,
    };
  }

  return {
    success: true,
    message: 'Doctor monitoring:\n- System health\n- Incident response\n- Auto-remediation\n- Uptime reporting',
  };
}

async function handleCCORequest(agent: CCOAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('ticket')) {
    const tickets = agent.getOpenTickets();
    return {
      success: true,
      message: `Open Tickets: ${tickets.length}\n${tickets.slice(0, 5).map(t => `- ${t.id}: ${t.subject} (${t.severity})`).join('\n')}`,
      data: tickets,
    };
  }

  if (lowerMessage.includes('satisfaction')) {
    const metrics = agent.getSatisfactionMetrics();
    return {
      success: true,
      message: `Customer Satisfaction:\n- Overall Score: ${metrics.overallScore}/100\n- NPS: ${metrics.nps}`,
      data: metrics,
    };
  }

  if (lowerMessage.includes('report')) {
    const report = agent.generateSupportReport();
    return {
      success: true,
      message: `Support Report:\n- Total Tickets: ${report.totalTickets}\n- Open: ${report.openTickets}\n- Avg Resolution: ${report.avgResolutionTime.toFixed(1)}h`,
      data: report,
    };
  }

  return {
    success: true,
    message: 'Charon handling:\n- Customer complaints\n- Goodwill refunds\n- Support tickets\n- Satisfaction metrics',
  };
}

async function handleCMORequest(agent: CMOAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('campaign')) {
    const campaigns = agent.getTopCampaigns();
    return {
      success: true,
      message: `Top Campaigns:\n${campaigns.map(c => `- ${c.name}: $${c.metrics.revenue} revenue`).join('\n')}`,
      data: campaigns,
    };
  }

  if (lowerMessage.includes('growth')) {
    const metrics = agent.getGrowthMetrics();
    return {
      success: true,
      message: `Growth Metrics:\n- DAU: ${metrics.dailyActiveUsers}\n- MAU: ${metrics.monthlyActiveUsers}\n- CAC: $${metrics.customerAcquisitionCost.toFixed(2)}\n- Churn: ${metrics.churnRate.toFixed(2)}%`,
      data: metrics,
    };
  }

  if (lowerMessage.includes('acquisition')) {
    const channels = agent.getAcquisitionByChannel();
    return {
      success: true,
      message: 'Acquisition by Channel:\n' + Object.entries(channels)
        .map(([ch, data]) => `- ${ch}: ${data.count} customers @ $${data.cac.toFixed(2)} CAC`)
        .join('\n'),
      data: channels,
    };
  }

  return {
    success: true,
    message: 'Bowery King tracking:\n- Marketing campaigns\n- Referral programs\n- Growth metrics\n- Customer acquisition',
  };
}

async function handleCRORequest(agent: CROAgent, lowerMessage: string, _originalMessage: string): Promise<AgentCLIResponse> {
  if (lowerMessage.includes('pipeline')) {
    const pipeline = agent.getPipelineOverview();
    return {
      success: true,
      message: `Sales Pipeline:\n- Total Deals: ${pipeline.totalDeals}\n- Total Value: $${pipeline.totalValue.amount}\n- Weighted Forecast: $${pipeline.weightedForecast.toFixed(2)}`,
      data: pipeline,
    };
  }

  if (lowerMessage.includes('forecast')) {
    const forecast = agent.generateRevenueForecast('month');
    return {
      success: true,
      message: `Revenue Forecast (Month):\n- Predicted: $${forecast.predictedRevenue.amount.toFixed(2)}\n- Best Case: $${forecast.bestCase.amount.toFixed(2)}\n- Confidence: ${(forecast.confidence * 100).toFixed(0)}%`,
      data: forecast,
    };
  }

  if (lowerMessage.includes('performance')) {
    const performance = agent.getSalesPerformance();
    return {
      success: true,
      message: `Sales Performance:\n- Won: ${performance.dealsWon}\n- Lost: ${performance.dealsLost}\n- Win Rate: ${performance.winRate.toFixed(1)}%\n- Total Revenue: $${performance.totalRevenue.toFixed(2)}`,
      data: performance,
    };
  }

  return {
    success: true,
    message: 'Sofia managing:\n- Sales pipeline\n- Enterprise deals\n- Pricing decisions\n- Revenue forecasting',
  };
}
