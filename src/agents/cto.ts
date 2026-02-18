/**
 * The Continental - CTO Agent (John Wick)
 * 
 * Responsibilities:
 * - Monitor technical health
 * - Approve infrastructure changes
 * - Escalate technical issues
 * - Approve new provider integrations
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import {
  AgentDecision,
  InfrastructureChangeRequest,
  ProviderIntegrationRequest,
  AgentNotification,
} from './types.js';

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  providers: Record<string, {
    status: 'up' | 'down' | 'degraded';
    latency: number;
    errorRate: number;
    lastChecked: Date;
  }>;
  apiEndpoints: Record<string, {
    status: 'up' | 'down';
    latency: number;
  }>;
  database: 'healthy' | 'slow' | 'unavailable';
  queue: 'healthy' | 'backed_up' | 'down';
}

export class CTOAgent extends BaseAgent {
  private systemHealth: SystemHealthStatus;
  private activeIncidents: string[] = [];
  private providerHealthHistory: Map<string, Array<{ timestamp: Date; status: string }>> = new Map();

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'John Wick',
        role: 'cto',
        active: true,
        confidenceThreshold: 0.8,
        ...config,
      },
      logger
    );

    this.systemHealth = {
      overall: 'healthy',
      providers: {},
      apiEndpoints: {},
      database: 'healthy',
      queue: 'healthy',
    };
  }

  /**
   * Monitor and update system health
   */
  async updateSystemHealth(health: Partial<SystemHealthStatus>): Promise<void> {
    this.setStatus('analyzing');
    
    // Merge new health data
    this.systemHealth = {
      ...this.systemHealth,
      ...health,
      providers: { ...this.systemHealth.providers, ...health.providers },
    };

    // Update provider health history
    for (const [provider, status] of Object.entries(this.systemHealth.providers)) {
      if (!this.providerHealthHistory.has(provider)) {
        this.providerHealthHistory.set(provider, []);
      }
      this.providerHealthHistory.get(provider)!.push({
        timestamp: new Date(),
        status: status.status,
      });

      // Keep only last 100 entries
      const history = this.providerHealthHistory.get(provider)!;
      if (history.length > 100) {
        this.providerHealthHistory.set(provider, history.slice(-100));
      }
    }

    // Recalculate overall health
    this.recalculateOverallHealth();

    this.logAction('health_check', 'system', 'success', { health: this.systemHealth });
    this.setStatus('idle');
  }

  private recalculateOverallHealth(): void {
    const providers = Object.values(this.systemHealth.providers);
    const downProviders = providers.filter(p => p.status === 'down').length;
    const degradedProviders = providers.filter(p => p.status === 'degraded').length;

    if (downProviders > 0 || this.systemHealth.database === 'unavailable') {
      this.systemHealth.overall = 'critical';
      this.setHealth('critical');
    } else if (degradedProviders > 0 || this.systemHealth.database === 'slow') {
      this.systemHealth.overall = 'degraded';
      this.setHealth('degraded');
    } else {
      this.systemHealth.overall = 'healthy';
      this.setHealth('healthy');
    }
  }

  /**
   * Get current system health
   */
  getSystemHealth(): SystemHealthStatus {
    return { ...this.systemHealth };
  }

  /**
   * Approve infrastructure changes
   */
  async approveInfrastructureChange(request: InfrastructureChangeRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`🔧 John Wick reviewing infrastructure change: ${request.changeType}`);

    const { impact, affectedProviders, rollbackPlan } = request;
    
    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    // Critical checks
    if (impact === 'critical' && !rollbackPlan) {
      outcome = 'rejected';
      confidence = 0.95;
      reason = 'Critical changes require a rollback plan';
    } else if (affectedProviders.some(p => this.systemHealth.providers[p]?.status === 'down')) {
      outcome = 'rejected';
      confidence = 0.9;
      reason = 'Cannot make changes while affected providers are down';
    } else if (impact === 'low' || impact === 'medium') {
      outcome = 'approved';
      confidence = 0.9;
      reason = `Low-risk ${request.changeType} approved with standard safeguards`;
    } else if (impact === 'high' && rollbackPlan) {
      outcome = 'approved';
      confidence = 0.75;
      reason = 'High-impact change approved with verified rollback plan';
    } else {
      outcome = 'escalated';
      confidence = 0.6;
      reason = 'Critical infrastructure change requires manual review';
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'infrastructure_change',
      outcome,
      reason,
      { request, systemHealth: this.systemHealth },
      confidence
    );

    if (outcome === 'approved') {
      this.logAction('infrastructure_approved', request.changeType, 'success', { request });
    }

    this.setStatus('idle');
    return decision;
  }

  /**
   * Approve new provider integrations
   */
  async approveProviderIntegration(request: ProviderIntegrationRequest): Promise<AgentDecision> {
    this.setStatus('analyzing');
    
    this.logger.info(`🔌 John Wick reviewing provider integration: ${request.providerName}`);

    const { sandboxTested, requiredCredentials, estimatedVolume } = request;
    
    let outcome: 'approved' | 'rejected' | 'escalated';
    let confidence: number;
    let reason: string;

    // Check requirements
    const missingCreds = requiredCredentials.filter(c => !c || c === '');

    if (!sandboxTested) {
      outcome = 'rejected';
      confidence = 0.95;
      reason = 'Provider must be tested in sandbox before production integration';
    } else if (missingCreds.length > 0) {
      outcome = 'rejected';
      confidence = 0.9;
      reason = `Missing required credentials: ${missingCreds.join(', ')}`;
    } else if (this.systemHealth.overall === 'critical') {
      outcome = 'escalated';
      confidence = 0.7;
      reason = 'System in critical state - defer new integrations';
    } else {
      outcome = 'approved';
      confidence = 0.85;
      reason = `Provider ${request.providerName} integration approved for ${estimatedVolume} volume`;
    }

    this.setStatus(outcome === 'approved' ? 'approving' : outcome === 'rejected' ? 'rejecting' : 'escalating');

    const decision = await this.makeDecision(
      'provider_integration',
      outcome,
      reason,
      { request, systemHealth: this.systemHealth },
      confidence
    );

    this.setStatus('idle');
    return decision;
  }

  /**
   * Escalate technical issues
   */
  async escalateTechnicalIssue(
    issue: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    affectedComponents: string[]
  ): Promise<AgentNotification> {
    this.setStatus('escalating');
    
    this.logger.error(`🚨 John Wick escalating technical issue: ${issue} (${severity})`);

    const incidentId = `INC-${Date.now()}`;
    this.activeIncidents.push(incidentId);

    const notification = this.createNotification(
      severity === 'critical' ? 'human' : 'all',
      severity === 'critical' ? 'urgent' : severity,
      `Technical Incident: ${issue}`,
      `Incident ${incidentId}: ${issue}\nAffected: ${affectedComponents.join(', ')}`,
      true,
      { incidentId, affectedComponents, severity }
    );

    this.logAction('escalate_issue', incidentId, 'success', { issue, severity, affectedComponents });
    this.setStatus('idle');

    return notification;
  }

  /**
   * Resolve an incident
   */
  resolveIncident(incidentId: string, resolution: string): void {
    const index = this.activeIncidents.indexOf(incidentId);
    if (index !== -1) {
      this.activeIncidents.splice(index, 1);
      this.logger.info(`✅ John Wick resolved incident ${incidentId}: ${resolution}`);
      this.logAction('resolve_incident', incidentId, 'success', { resolution });
    }
  }

  /**
   * Get technical metrics report
   */
  getTechnicalMetrics(): {
    systemHealth: SystemHealthStatus;
    activeIncidents: number;
    providerUptime: Record<string, number>;
    avgLatency: number;
  } {
    const providerUptime: Record<string, number> = {};
    
    for (const [provider, history] of this.providerHealthHistory.entries()) {
      if (history.length === 0) continue;
      const upCount = history.filter(h => h.status === 'up').length;
      providerUptime[provider] = (upCount / history.length) * 100;
    }

    const latencies = Object.values(this.systemHealth.providers)
      .map(p => p.latency)
      .filter(l => l > 0);
    
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    return {
      systemHealth: this.systemHealth,
      activeIncidents: this.activeIncidents.length,
      providerUptime,
      avgLatency,
    };
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'infrastructure_change') {
      return this.approveInfrastructureChange(context.request as InfrastructureChangeRequest);
    }
    
    if (context.type === 'provider_integration') {
      return this.approveProviderIntegration(context.request as ProviderIntegrationRequest);
    }

    return this.makeDecision(
      'strategic_override',
      'escalated',
      'Unknown technical request type - requires clarification',
      context,
      0.5
    );
  }
}
