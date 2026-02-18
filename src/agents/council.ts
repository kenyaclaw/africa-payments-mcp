/**
 * The Continental - High Table Council
 * 
 * Responsibilities:
 * - Agent voting system
 * - Consensus building
 * - Tie-breaking
 * - Agent communication
 */

import { Logger } from '../utils/logger.js';
import {
  AgentRole,
  AgentDecision,
  CouncilSession,
  CouncilVote,
  Vote,
  AgentNotification,
  DecisionOutcome,
} from './types.js';
import { BaseAgent } from './base.js';

export interface CouncilConfig {
  quorumRequired: number; // Number of votes needed for quorum
  consensusThreshold: number; // Percentage needed for consensus
  tieBreaker: AgentRole;
  maxVotingTime: number; // milliseconds
}

export class HighTableCouncil {
  private logger: Logger;
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private sessions: Map<string, CouncilSession> = new Map();
  private sessionHistory: CouncilSession[] = [];
  private config: CouncilConfig;
  private notifications: AgentNotification[] = [];

  constructor(logger: Logger, config?: Partial<CouncilConfig>) {
    this.logger = logger;
    this.config = {
      quorumRequired: 4,
      consensusThreshold: 0.66,
      tieBreaker: 'ceo',
      maxVotingTime: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
  }

  /**
   * Register an agent with the council
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getRole(), agent);
    this.logger.info(`🪑 High Table registered agent: ${agent.getName()} (${agent.getRole()})`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(role: AgentRole): void {
    this.agents.delete(role);
    this.logger.info(`🚪 High Table unregistered agent: ${role}`);
  }

  /**
   * Get registered agents
   */
  getRegisteredAgents(): Array<{ role: AgentRole; name: string; active: boolean }> {
    return Array.from(this.agents.entries()).map(([role, agent]) => ({
      role,
      name: agent.getName(),
      active: agent.isActive(),
    }));
  }

  /**
   * Initiate council session for decision
   */
  async initiateSession(
    topic: string,
    description: string,
    initiatedBy: AgentRole,
    options?: {
      requireUnanimous?: boolean;
      votingAgents?: AgentRole[];
    }
  ): Promise<CouncilSession> {
    this.logger.info(`🏛️ High Table session initiated by ${initiatedBy}: ${topic}`);

    const session: CouncilSession = {
      id: `COUNCIL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      topic,
      description,
      initiatedBy,
      startedAt: new Date(),
      votes: [],
      status: 'open',
    };

    this.sessions.set(session.id, session);

    // Notify voting agents
    const votingAgents = options?.votingAgents || Array.from(this.agents.keys());
    for (const role of votingAgents) {
      const agent = this.agents.get(role);
      if (agent && agent.isActive()) {
        const notification: AgentNotification = {
          id: `NOTIFY-${Date.now()}`,
          from: 'council',
          to: role,
          priority: 'high',
          title: `Council Vote Required: ${topic}`,
          message: description,
          timestamp: new Date(),
          actionRequired: true,
          metadata: { sessionId: session.id },
        };
        this.notifications.push(notification);
      }
    }

    return session;
  }

  /**
   * Cast vote in council session
   */
  async castVote(
    sessionId: string,
    agent: AgentRole,
    vote: Vote,
    reason: string
  ): Promise<CouncilSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Council session ${sessionId} not found`);
    }

    if (session.status !== 'open') {
      throw new Error(`Council session ${sessionId} is ${session.status}`);
    }

    // Check if agent already voted
    const existingVote = session.votes.find(v => v.agent === agent);
    if (existingVote) {
      existingVote.vote = vote;
      existingVote.reason = reason;
      existingVote.timestamp = new Date();
    } else {
      const councilVote: CouncilVote = {
        agent,
        agentName: this.agents.get(agent)?.getName() || agent,
        vote,
        reason,
        timestamp: new Date(),
      };
      session.votes.push(councilVote);
    }

    this.logger.info(`🗳️ High Table vote from ${agent}: ${vote}`);

    // Check if we have quorum and can close the session
    await this.checkSessionCompletion(session);

    return session;
  }

  /**
   * Check if session has reached conclusion
   */
  private async checkSessionCompletion(session: CouncilSession): Promise<void> {
    const totalAgents = this.agents.size;
    const votesCast = session.votes.length;

    // Check for quorum
    if (votesCast < Math.min(this.config.quorumRequired, totalAgents)) {
      return; // Not enough votes
    }

    // Count votes
    const yesVotes = session.votes.filter(v => v.vote === 'yes').length;
    const noVotes = session.votes.filter(v => v.vote === 'no').length;
    const abstainVotes = session.votes.filter(v => v.vote === 'abstain').length;

    // Check for consensus
    const yesRatio = yesVotes / votesCast;
    const noRatio = noVotes / votesCast;

    if (yesRatio >= this.config.consensusThreshold) {
      session.status = 'closed';
      session.outcome = 'approved';
      this.logger.info(`✅ High Table reached consensus: APPROVED (${yesVotes}/${votesCast})`);
    } else if (noRatio >= this.config.consensusThreshold) {
      session.status = 'closed';
      session.outcome = 'rejected';
      this.logger.info(`❌ High Table reached consensus: REJECTED (${noVotes}/${votesCast})`);
    } else if (votesCast === totalAgents) {
      // All votes cast but no consensus - tie
      session.status = 'tied';
      this.logger.warn(`⚖️ High Table vote tied - invoking tie-breaker (${this.config.tieBreaker})`);
      
      // Tie-breaker vote
      const tieBreakerVote = await this.invokeTieBreaker(session);
      session.outcome = tieBreakerVote;
      session.tieBreaker = this.config.tieBreaker;
    } else {
      // Not all votes cast yet
      return;
    }

    if (session.status === 'closed' || session.status === 'tied') {
      this.sessions.delete(session.id);
      this.sessionHistory.push(session);
      await this.notifySessionResult(session);
    }
  }

  /**
   * Invoke tie-breaker
   */
  private async invokeTieBreaker(session: CouncilSession): Promise<DecisionOutcome> {
    const tieBreakerAgent = this.agents.get(this.config.tieBreaker);
    
    if (!tieBreakerAgent) {
      this.logger.error(`Tie-breaker agent ${this.config.tieBreaker} not found, defaulting to rejected`);
      return 'rejected';
    }

    // Use tie-breaker's decision logic
    const decision = await tieBreakerAgent.process({
      type: 'tie_breaker',
      session,
      votes: session.votes,
    });

    return decision.outcome;
  }

  /**
   * Notify participants of session result
   */
  private async notifySessionResult(session: CouncilSession): Promise<void> {
    const resultMessage = session.outcome === 'approved' 
      ? '✅ Proposal APPROVED'
      : session.outcome === 'rejected'
      ? '❌ Proposal REJECTED'
      : '⚖️ Result: TIE (broken by tie-breaker)';

    for (const vote of session.votes) {
      const notification: AgentNotification = {
        id: `RESULT-${Date.now()}`,
        from: 'council',
        to: vote.agent,
        priority: 'high',
        title: `Council Decision: ${session.topic}`,
        message: `${resultMessage}\n\nYour vote: ${vote.vote}\nFinal decision: ${session.outcome}`,
        timestamp: new Date(),
        actionRequired: false,
        metadata: { sessionId: session.id, outcome: session.outcome },
      };
      this.notifications.push(notification);
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): CouncilSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session history
   */
  getSessionHistory(limit: number = 10): CouncilSession[] {
    return this.sessionHistory.slice(-limit);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CouncilSession | undefined {
    return this.sessions.get(sessionId) || this.sessionHistory.find(s => s.id === sessionId);
  }

  /**
   * Close session manually (e.g., timeout)
   */
  closeSession(sessionId: string, forcedOutcome?: DecisionOutcome): CouncilSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.status = forcedOutcome ? 'closed' : 'tied';
    if (forcedOutcome) {
      session.outcome = forcedOutcome;
    }

    this.sessions.delete(sessionId);
    this.sessionHistory.push(session);
    
    this.notifySessionResult(session);
    
    return session;
  }

  /**
   * Request consensus on a decision
   */
  async requestConsensus(
    topic: string,
    description: string,
    context: Record<string, any>,
    initiatedBy: AgentRole
  ): Promise<AgentDecision> {
    const session = await this.initiateSession(topic, description, initiatedBy);

    // Auto-collect votes from eligible agents
    for (const [role, agent] of this.agents.entries()) {
      if (agent.isActive() && role !== initiatedBy) {
        try {
          const decision = await agent.process(context);
          const vote: Vote = decision.outcome === 'approved' ? 'yes' : 
                            decision.outcome === 'rejected' ? 'no' : 'abstain';
          await this.castVote(session.id, role, vote, decision.reason);
        } catch (error) {
          this.logger.warn(`Failed to get vote from ${role}: ${error}`);
        }
      }
    }

    // Initiator's vote
    const initiatorAgent = this.agents.get(initiatedBy);
    if (initiatorAgent) {
      const initiatorDecision = await initiatorAgent.process(context);
      const initiatorVote: Vote = initiatorDecision.outcome === 'approved' ? 'yes' : 
                                  initiatorDecision.outcome === 'rejected' ? 'no' : 'abstain';
      await this.castVote(session.id, initiatedBy, initiatorVote, initiatorDecision.reason);
    }

    // Get final session state
    const finalSession = this.sessions.get(session.id) || this.sessionHistory.find(s => s.id === session.id);

    if (!finalSession) {
      return {
        id: session.id,
        agent: 'council',
        agentName: 'High Table Council',
        decisionType: 'strategic_override',
        outcome: 'escalated',
        reason: 'Council session failed to complete',
        timestamp: new Date(),
        context,
        requiresHumanReview: true,
        confidence: 0.5,
      };
    }

    return {
      id: session.id,
      agent: 'council',
      agentName: 'High Table Council',
      decisionType: 'strategic_override',
      outcome: finalSession.outcome || 'escalated',
      reason: `Council decision: ${finalSession.votes.length} votes cast, outcome ${finalSession.outcome}`,
      timestamp: new Date(),
      context: { ...context, session: finalSession },
      requiresHumanReview: finalSession.outcome === 'escalated',
      confidence: finalSession.status === 'tied' ? 0.5 : 0.8,
    };
  }

  /**
   * Broadcast message to all agents
   */
  broadcast(from: AgentRole, title: string, message: string, priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'): void {
    const notification: AgentNotification = {
      id: `BCAST-${Date.now()}`,
      from,
      to: 'all',
      priority,
      title,
      message,
      timestamp: new Date(),
      actionRequired: priority === 'urgent',
    };

    this.notifications.push(notification);

    for (const [role, agent] of this.agents.entries()) {
      if (agent.isActive() && role !== from) {
        this.logger.debug(`📢 Broadcast to ${role}: ${title}`);
      }
    }
  }

  /**
   * Send direct message between agents
   */
  sendMessage(
    from: AgentRole,
    to: AgentRole,
    title: string,
    message: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    actionRequired: boolean = false
  ): AgentNotification {
    const notification: AgentNotification = {
      id: `DM-${Date.now()}`,
      from,
      to,
      priority,
      title,
      message,
      timestamp: new Date(),
      actionRequired,
    };

    this.notifications.push(notification);
    this.logger.debug(`💬 Message from ${from} to ${to}: ${title}`);

    return notification;
  }

  /**
   * Get notifications for an agent
   */
  getNotifications(forAgent: AgentRole | 'all' | 'human', onlyUnread: boolean = false): AgentNotification[] {
    return this.notifications.filter(n => 
      n.to === forAgent || n.to === 'all'
    );
  }

  /**
   * Get council statistics
   */
  getStatistics(): {
    registeredAgents: number;
    activeAgents: number;
    totalSessions: number;
    approvedProposals: number;
    rejectedProposals: number;
    tieBreakerInvoked: number;
    avgVotingTime: number;
  } {
    const activeAgents = Array.from(this.agents.values()).filter(a => a.isActive()).length;
    
    const approved = this.sessionHistory.filter(s => s.outcome === 'approved').length;
    const rejected = this.sessionHistory.filter(s => s.outcome === 'rejected').length;
    const tied = this.sessionHistory.filter(s => s.status === 'tied').length;

    const votingTimes = this.sessionHistory
      .filter(s => s.startedAt)
      .map(s => {
        const lastVote = s.votes[s.votes.length - 1];
        return lastVote ? lastVote.timestamp.getTime() - s.startedAt.getTime() : 0;
      });

    return {
      registeredAgents: this.agents.size,
      activeAgents,
      totalSessions: this.sessionHistory.length,
      approvedProposals: approved,
      rejectedProposals: rejected,
      tieBreakerInvoked: tied,
      avgVotingTime: votingTimes.length > 0 
        ? votingTimes.reduce((a, b) => a + b, 0) / votingTimes.length / 1000 // in seconds
        : 0,
    };
  }
}
