/**
 * The Continental - COO Agent (Doctor)
 * 
 * Responsibilities:
 * - System health monitoring
 * - Incident response
 * - Auto-remediation
 * - Uptime reporting
 */

import { BaseAgent, AgentConfig } from './base.js';
import { Logger } from '../utils/logger.js';
import { AgentDecision, AgentNotification, AgentRole } from './types.js';

export interface Incident {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  description: string;
  startedAt: Date;
  resolvedAt?: Date;
  status: 'detected' | 'investigating' | 'mitigating' | 'resolved' | 'escalated';
  autoRemediationAttempted: boolean;
  affectedServices: string[];
  metrics: Record<string, any>;
}

export interface ServiceHealth {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  uptime24h: number; // percentage
  latency: number; // ms
  errorRate: number; // percentage
  lastIncident?: Date;
}

export class COOAgent extends BaseAgent {
  private activeIncidents: Map<string, Incident> = new Map();
  private incidentHistory: Incident[] = [];
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private autoRemediationEnabled: boolean = true;
  private remediationActions: Array<{ timestamp: Date; action: string; success: boolean }> = [];

  constructor(logger: Logger, config?: Partial<AgentConfig>) {
    super(
      {
        name: 'Doctor',
        role: 'coo',
        active: true,
        confidenceThreshold: 0.7,
        ...config,
      },
      logger
    );
  }

  /**
   * Detect and create incident
   */
  async detectIncident(
    severity: 'low' | 'medium' | 'high' | 'critical',
    component: string,
    description: string,
    affectedServices: string[],
    metrics: Record<string, any>
  ): Promise<Incident> {
    this.setStatus('analyzing');
    
    const incident: Incident = {
      id: `INC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      severity,
      component,
      description,
      startedAt: new Date(),
      status: 'detected',
      autoRemediationAttempted: false,
      affectedServices,
      metrics,
    };

    this.activeIncidents.set(incident.id, incident);
    
    this.logger.error(`🚨 Doctor detected incident: ${incident.id} - ${description} (${severity})`);

    // Update service health
    for (const service of affectedServices) {
      const health = this.serviceHealth.get(service);
      if (health) {
        health.status = severity === 'critical' ? 'down' : 'degraded';
        health.lastIncident = new Date();
      }
    }

    // Attempt auto-remediation for non-critical incidents
    if (this.autoRemediationEnabled && severity !== 'critical') {
      await this.attemptAutoRemediation(incident);
    }

    // Escalate critical incidents immediately
    if (severity === 'critical') {
      incident.status = 'escalated';
      await this.escalateIncident(incident);
    }

    this.setStatus('idle');
    return incident;
  }

  /**
   * Attempt auto-remediation
   */
  private async attemptAutoRemediation(incident: Incident): Promise<void> {
    this.setStatus('analyzing');
    incident.status = 'mitigating';
    incident.autoRemediationAttempted = true;

    this.logger.info(`🔧 Doctor attempting auto-remediation for ${incident.id}`);

    const remediationActions: string[] = [];
    let success = false;

    // Based on incident type, attempt remediation
    switch (incident.component) {
      case 'provider_timeout':
        remediationActions.push('Switching to fallback provider');
        remediationActions.push('Increasing timeout threshold');
        success = true; // Simulated
        break;
      
      case 'rate_limit':
        remediationActions.push('Implementing exponential backoff');
        remediationActions.push('Reducing request rate');
        success = true;
        break;
      
      case 'memory_high':
        remediationActions.push('Clearing cache');
        remediationActions.push('Scaling up memory');
        success = true;
        break;
      
      case 'disk_full':
        remediationActions.push('Archiving old logs');
        remediationActions.push('Cleaning temporary files');
        success = false; // Requires manual intervention
        break;
      
      default:
        remediationActions.push('Restarting service');
        success = false;
    }

    for (const action of remediationActions) {
      this.remediationActions.push({
        timestamp: new Date(),
        action,
        success,
      });
    }

    if (success) {
      incident.status = 'resolved';
      incident.resolvedAt = new Date();
      this.activeIncidents.delete(incident.id);
      this.incidentHistory.push(incident);
      
      this.logger.info(`✅ Doctor resolved incident ${incident.id} via auto-remediation`);
      
      // Restore service health
      for (const service of incident.affectedServices) {
        const health = this.serviceHealth.get(service);
        if (health) {
          health.status = 'operational';
        }
      }
    } else {
      incident.status = 'escalated';
      await this.escalateIncident(incident);
    }

    this.setStatus('idle');
  }

  /**
   * Escalate incident to human operators
   */
  private async escalateIncident(incident: Incident): Promise<AgentNotification> {
    this.logger.warn(`📢 Doctor escalating incident ${incident.id} to human operators`);

    const notification = this.createNotification(
      'human',
      incident.severity === 'critical' ? 'urgent' : incident.severity,
      `Incident Escalation: ${incident.component}`,
      `Incident ${incident.id} requires manual intervention.\n` +
      `Component: ${incident.component}\n` +
      `Description: ${incident.description}\n` +
      `Auto-remediation: ${incident.autoRemediationAttempted ? 'Attempted and failed' : 'Not attempted'}`,
      true,
      { incidentId: incident.id, incident }
    );

    return notification;
  }

  /**
   * Resolve incident manually
   */
  resolveIncident(incidentId: string, resolution: string, resolvedBy: 'auto' | 'human' | AgentRole): void {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      this.logger.warn(`Incident ${incidentId} not found`);
      return;
    }

    incident.status = 'resolved';
    incident.resolvedAt = new Date();
    this.activeIncidents.delete(incidentId);
    this.incidentHistory.push(incident);

    // Restore service health
    for (const service of incident.affectedServices) {
      const health = this.serviceHealth.get(service);
      if (health) {
        health.status = 'operational';
      }
    }

    this.logger.info(`✅ Doctor marked incident ${incidentId} as resolved by ${resolvedBy}: ${resolution}`);
    
    this.logAction('resolve_incident', incidentId, 'success', {
      resolution,
      resolvedBy,
      duration: incident.resolvedAt.getTime() - incident.startedAt.getTime(),
    });
  }

  /**
   * Update service health
   */
  updateServiceHealth(serviceName: string, health: Partial<ServiceHealth>): void {
    const existing = this.serviceHealth.get(serviceName);
    if (existing) {
      this.serviceHealth.set(serviceName, { ...existing, ...health });
    } else {
      this.serviceHealth.set(serviceName, {
        name: serviceName,
        status: health.status || 'operational',
        uptime24h: health.uptime24h || 100,
        latency: health.latency || 0,
        errorRate: health.errorRate || 0,
        ...health,
      });
    }
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): Incident[] {
    return Array.from(this.activeIncidents.values());
  }

  /**
   * Get system health overview
   */
  getSystemHealth(): {
    overall: 'healthy' | 'degraded' | 'critical';
    services: ServiceHealth[];
    activeIncidents: number;
    avgUptime: number;
  } {
    const services = Array.from(this.serviceHealth.values());
    const activeCritical = Array.from(this.activeIncidents.values()).filter(i => i.severity === 'critical').length;
    const activeHigh = Array.from(this.activeIncidents.values()).filter(i => i.severity === 'high').length;

    let overall: 'healthy' | 'degraded' | 'critical';
    if (activeCritical > 0) {
      overall = 'critical';
    } else if (activeHigh > 0 || services.some(s => s.status === 'degraded')) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const avgUptime = services.length > 0
      ? services.reduce((sum, s) => sum + s.uptime24h, 0) / services.length
      : 100;

    return {
      overall,
      services,
      activeIncidents: this.activeIncidents.size,
      avgUptime,
    };
  }

  /**
   * Generate uptime report
   */
  generateUptimeReport(): {
    period: string;
    overallUptime: number;
    services: Array<{
      name: string;
      uptime: number;
      incidents: number;
      avgLatency: number;
    }>;
    slaCompliance: boolean;
    recommendations: string[];
  } {
    const services = Array.from(this.serviceHealth.values());
    const last24h = this.incidentHistory.filter(
      i => i.startedAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const serviceReports = services.map(s => {
      const incidents = last24h.filter(i => i.affectedServices.includes(s.name));
      return {
        name: s.name,
        uptime: s.uptime24h,
        incidents: incidents.length,
        avgLatency: s.latency,
      };
    });

    const overallUptime = serviceReports.length > 0
      ? serviceReports.reduce((sum, s) => sum + s.uptime, 0) / serviceReports.length
      : 100;

    const recommendations: string[] = [];
    
    for (const service of serviceReports) {
      if (service.uptime < 99.9) {
        recommendations.push(`${service.name}: Uptime ${service.uptime.toFixed(2)}% below 99.9% SLA`);
      }
      if (service.avgLatency > 1000) {
        recommendations.push(`${service.name}: High latency (${service.avgLatency.toFixed(0)}ms) - investigate`);
      }
    }

    return {
      period: '24h',
      overallUptime,
      services: serviceReports,
      slaCompliance: overallUptime >= 99.9,
      recommendations,
    };
  }

  /**
   * Enable/disable auto-remediation
   */
  setAutoRemediation(enabled: boolean): void {
    this.autoRemediationEnabled = enabled;
    this.logger.info(`🔧 Doctor auto-remediation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Process generic context (required by base class)
   */
  async process(context: Record<string, any>): Promise<AgentDecision> {
    if (context.type === 'incident_response') {
      const incident = await this.detectIncident(
        context.severity,
        context.component,
        context.description,
        context.affectedServices || [],
        context.metrics || {}
      );

      return this.makeDecision(
        'incident_response',
        incident.status === 'resolved' ? 'approved' : incident.status === 'escalated' ? 'escalated' : 'pending',
        `Incident ${incident.id} ${incident.status}`,
        { incident },
        incident.status === 'resolved' ? 0.9 : 0.6
      );
    }

    if (context.type === 'resolve_incident') {
      this.resolveIncident(context.incidentId, context.resolution, context.resolvedBy || 'human');
      
      return this.makeDecision(
        'incident_response',
        'approved',
        `Incident ${context.incidentId} resolved: ${context.resolution}`,
        context,
        1.0
      );
    }

    return this.makeDecision(
      'incident_response',
      'escalated',
      'Unknown operations request type - requires clarification',
      context,
      0.5
    );
  }
}
