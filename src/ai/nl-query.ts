/**
 * Natural Language Query Module
 * 
 * Parses natural language queries like "Show failed payments from Nigeria last week"
 * and converts them to database queries.
 */

import { Logger } from '../utils/logger.js';
import {
  NLQueryInput,
  NLQueryResult,
  QueryIntent,
  QueryFilters,
  QueryAggregation,
  TimeRange,
} from './types.js';
import { Transaction, TransactionQuery } from '../types/index.js';

// Country name mappings
const COUNTRY_MAPPINGS: Record<string, string> = {
  'kenya': 'KE',
  'nigeria': 'NG',
  'ghana': 'GH',
  'uganda': 'UG',
  'tanzania': 'TZ',
  'south africa': 'ZA',
  'rwanda': 'RW',
  'ivory coast': 'CI',
  'senegal': 'SN',
  'cameroon': 'CM',
  'ethiopia': 'ET',
  'zambia': 'ZM',
  'malawi': 'MW',
  'mozambique': 'MZ',
  'botswana': 'BW',
};

// Provider name mappings
const PROVIDER_MAPPINGS: Record<string, string> = {
  'mpesa': 'mpesa',
  'm-pesa': 'mpesa',
  'paystack': 'paystack',
  'mtn momo': 'mtn_momo',
  'mtn mobile money': 'mtn_momo',
  'airtel money': 'airtel_money',
  'intasend': 'intasend',
  'flutterwave': 'flutterwave',
  'wave': 'wave',
  'chipper cash': 'chipper_cash',
  'orange money': 'orange_money',
};

// Status mappings
const STATUS_MAPPINGS: Record<string, string> = {
  'failed': 'failed',
  'failure': 'failed',
  'failures': 'failed',
  'successful': 'completed',
  'success': 'completed',
  'completed': 'completed',
  'pending': 'pending',
  'processing': 'processing',
  'refunded': 'refunded',
  'cancelled': 'cancelled',
};

// Time period patterns
interface TimePattern {
  pattern: RegExp;
  getRange: () => TimeRange;
}

export class NLQueryEngine {
  private readonly logger: Logger;
  private transactionStore: Transaction[] = []; // Mock database

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Initialize the NL query engine
   */
  async initialize(): Promise<void> {
    this.logger.info('NL Query engine initialized');
  }

  /**
   * Set mock transaction data (for testing/demos)
   */
  setMockData(transactions: Transaction[]): void {
    this.transactionStore = transactions;
  }

  /**
   * Execute a natural language query
   */
  async executeQuery(input: NLQueryInput): Promise<NLQueryResult> {
    const startTime = Date.now();
    const query = input.query.toLowerCase().trim();

    this.logger.info(`Processing NL query: "${input.query}"`);

    // Parse the query
    const intent = this.parseIntent(query);
    const filters = this.parseFilters(query);
    const aggregations = this.parseAggregations(query);
    const timeRange = this.parseTimeRange(query);

    // Build and execute database query
    const dbQuery = this.buildDatabaseQuery(intent, filters, timeRange);
    const results = this.executeDatabaseQuery(dbQuery, filters);

    // Apply aggregations if any
    const processedResults = this.applyAggregations(results, aggregations);

    // Format the result
    const formattedResult = this.formatResults(processedResults, intent, aggregations);

    const executionTime = Date.now() - startTime;

    return {
      originalQuery: input.query,
      parsedIntent: intent,
      filters,
      aggregations,
      timeRange,
      formattedResult,
      data: processedResults,
      executionTime,
    };
  }

  /**
   * Parse the intent from the query
   */
  private parseIntent(query: string): QueryIntent {
    const intent: QueryIntent = {
      action: 'show',
      subject: 'transactions',
    };

    // Determine action
    if (query.includes('count') || query.includes('how many')) {
      intent.action = 'count';
    } else if (query.includes('total') || query.includes('sum')) {
      intent.action = 'sum';
    } else if (query.includes('average') || query.includes('avg')) {
      intent.action = 'average';
    } else if (query.includes('compare')) {
      intent.action = 'compare';
    } else if (query.includes('trend') || query.includes('over time')) {
      intent.action = 'trend';
    }

    // Determine subject
    if (query.includes('payment')) {
      intent.subject = 'payments';
    } else if (query.includes('refund')) {
      intent.subject = 'refunds';
    } else if (query.includes('failure') || query.includes('failed')) {
      intent.subject = 'failures';
      intent.status = ['failed'];
    } else if (query.includes('revenue') || query.includes('money')) {
      intent.subject = 'revenue';
    } else if (query.includes('volume')) {
      intent.subject = 'volume';
    }

    // Extract status
    if (!intent.status) {
      for (const [keyword, status] of Object.entries(STATUS_MAPPINGS)) {
        if (query.includes(keyword)) {
          intent.status = [status];
          break;
        }
      }
    }

    return intent;
  }

  /**
   * Parse filters from the query
   */
  private parseFilters(query: string): QueryFilters {
    const filters: QueryFilters = {};

    // Country filter
    for (const [name, code] of Object.entries(COUNTRY_MAPPINGS)) {
      if (query.includes(name) || query.includes(code.toLowerCase())) {
        filters.countries = filters.countries || [];
        if (!filters.countries.includes(code)) {
          filters.countries.push(code);
        }
      }
    }

    // Provider filter
    for (const [name, code] of Object.entries(PROVIDER_MAPPINGS)) {
      if (query.includes(name)) {
        filters.providers = filters.providers || [];
        if (!filters.providers.includes(code)) {
          filters.providers.push(code);
        }
      }
    }

    // Status filter
    for (const [keyword, status] of Object.entries(STATUS_MAPPINGS)) {
      if (query.includes(keyword)) {
        filters.status = filters.status || [];
        if (!filters.status.includes(status)) {
          filters.status.push(status);
        }
      }
    }

    // Amount filters
    const aboveMatch = query.match(/above\s+(\d+)/);
    if (aboveMatch) {
      filters.minAmount = parseInt(aboveMatch[1], 10);
    }

    const belowMatch = query.match(/below\s+(\d+)/);
    if (belowMatch) {
      filters.maxAmount = parseInt(belowMatch[1], 10);
    }

    const betweenMatch = query.match(/between\s+(\d+)\s+and\s+(\d+)/);
    if (betweenMatch) {
      filters.minAmount = parseInt(betweenMatch[1], 10);
      filters.maxAmount = parseInt(betweenMatch[2], 10);
    }

    // Phone number filter
    const phoneMatch = query.match(/(phone|number|to)\s+(\+?\d+)/);
    if (phoneMatch) {
      filters.phoneNumber = phoneMatch[2];
    }

    // Customer filter
    const customerMatch = query.match(/(customer|user)\s+(\w+)/);
    if (customerMatch) {
      filters.customerId = customerMatch[2];
    }

    return filters;
  }

  /**
   * Parse aggregations from the query
   */
  private parseAggregations(query: string): QueryAggregation[] | undefined {
    const aggregations: QueryAggregation[] = [];

    // Check for group by
    const groupByMatch = query.match(/group\s+by\s+(\w+)/);
    if (groupByMatch) {
      aggregations.push({
        type: 'group_by',
        field: groupByMatch[1],
        alias: `${groupByMatch[1]}_group`,
      });
    }

    // Check for per day/week/month
    const perMatch = query.match(/per\s+(day|week|month|country|provider)/);
    if (perMatch) {
      aggregations.push({
        type: 'group_by',
        field: perMatch[1],
        alias: `${perMatch[1]}_breakdown`,
      });
    }

    return aggregations.length > 0 ? aggregations : undefined;
  }

  /**
   * Parse time range from the query
   */
  private parseTimeRange(query: string): TimeRange | undefined {
    const now = new Date();
    let start: Date | undefined;
    let end: Date = now;
    let description = '';

    // Last N days/weeks/months
    const lastNMatch = query.match(/last\s+(\d+)\s*(day|days|week|weeks|month|months|hour|hours)/);
    if (lastNMatch) {
      const amount = parseInt(lastNMatch[1], 10);
      const unit = lastNMatch[2].startsWith('day') ? 'days' :
                   lastNMatch[2].startsWith('week') ? 'weeks' :
                   lastNMatch[2].startsWith('month') ? 'months' : 'hours';
      
      start = new Date(now);
      if (unit === 'days') start.setDate(start.getDate() - amount);
      else if (unit === 'weeks') start.setDate(start.getDate() - amount * 7);
      else if (unit === 'months') start.setMonth(start.getMonth() - amount);
      else if (unit === 'hours') start.setHours(start.getHours() - amount);
      
      description = `last ${amount} ${unit}`;
    }

    // Yesterday
    else if (query.includes('yesterday')) {
      start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
      description = 'yesterday';
    }

    // Today
    else if (query.includes('today')) {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      description = 'today';
    }

    // This week
    else if (query.includes('this week')) {
      start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      description = 'this week';
    }

    // Last week
    else if (query.includes('last week')) {
      start = new Date(now);
      start.setDate(start.getDate() - start.getDay() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      description = 'last week';
    }

    // This month
    else if (query.includes('this month')) {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      description = 'this month';
    }

    // Last month
    else if (query.includes('last month')) {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      description = 'last month';
    }

    if (start) {
      return {
        start,
        end,
        description,
      };
    }

    return undefined;
  }

  /**
   * Build database query from parsed components
   */
  private buildDatabaseQuery(
    intent: QueryIntent,
    filters: QueryFilters,
    timeRange?: TimeRange
  ): TransactionQuery {
    const query: TransactionQuery = {};

    if (timeRange) {
      query.startDate = timeRange.start;
      query.endDate = timeRange.end;
    }

    if (filters.status?.length) {
      query.status = filters.status[0] as any;
    } else if (intent.status?.length) {
      query.status = intent.status[0] as any;
    }

    if (filters.minAmount !== undefined) {
      query.minAmount = filters.minAmount;
    }

    if (filters.maxAmount !== undefined) {
      query.maxAmount = filters.maxAmount;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.phoneNumber) {
      query.phoneNumber = filters.phoneNumber;
    }

    return query;
  }

  /**
   * Execute database query (mock implementation)
   */
  private executeDatabaseQuery(query: TransactionQuery, filters: QueryFilters): Transaction[] {
    let results = [...this.transactionStore];

    if (query.startDate) {
      results = results.filter(t => t.createdAt >= query.startDate!);
    }

    if (query.endDate) {
      results = results.filter(t => t.createdAt <= query.endDate!);
    }

    if (query.status) {
      results = results.filter(t => t.status === query.status);
    }

    if (query.minAmount !== undefined) {
      results = results.filter(t => t.amount.amount >= query.minAmount!);
    }

    if (query.maxAmount !== undefined) {
      results = results.filter(t => t.amount.amount <= query.maxAmount!);
    }

    if (query.customerId) {
      results = results.filter(t => t.customer.id === query.customerId);
    }

    // Apply country filter
    if (filters.countries && filters.countries.length > 0) {
      results = results.filter(t => filters.countries!.includes(t.customer.country || ''));
    }

    // Apply provider filter
    if (filters.providers && filters.providers.length > 0) {
      results = results.filter(t => filters.providers!.includes(t.provider));
    }

    return results;
  }

  /**
   * Apply aggregations to results
   */
  private applyAggregations(
    results: Transaction[],
    aggregations?: QueryAggregation[]
  ): any[] {
    if (!aggregations || aggregations.length === 0) {
      return results;
    }

    // Handle group by
    const groupByAgg = aggregations.find(a => a.type === 'group_by');
    if (groupByAgg) {
      const grouped = new Map<string, Transaction[]>();

      for (const transaction of results) {
        let key: string;
        
        switch (groupByAgg.field) {
          case 'country':
            key = transaction.customer.country || 'Unknown';
            break;
          case 'provider':
            key = transaction.provider;
            break;
          case 'day':
            key = transaction.createdAt.toISOString().split('T')[0];
            break;
          case 'week':
            const weekStart = new Date(transaction.createdAt);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            key = weekStart.toISOString().split('T')[0];
            break;
          case 'month':
            key = `${transaction.createdAt.getFullYear()}-${String(transaction.createdAt.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            key = transaction.provider;
        }

        const group = grouped.get(key) || [];
        group.push(transaction);
        grouped.set(key, group);
      }

      // Convert to array of summary objects
      return Array.from(grouped.entries()).map(([key, transactions]) => ({
        group: key,
        count: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + t.amount.amount, 0),
        currency: transactions[0]?.amount.currency || 'Unknown',
        successRate: this.calculateSuccessRate(transactions),
      }));
    }

    return results;
  }

  /**
   * Calculate success rate for a group of transactions
   */
  private calculateSuccessRate(transactions: Transaction[]): number {
    if (transactions.length === 0) return 0;
    const successful = transactions.filter(t => t.status === 'completed').length;
    return Math.round((successful / transactions.length) * 100);
  }

  /**
   * Format results for display
   */
  private formatResults(
    results: any[],
    intent: QueryIntent,
    aggregations?: QueryAggregation[]
  ): string {
    if (results.length === 0) {
      return 'No results found.';
    }

    // Handle count action
    if (intent.action === 'count') {
      return `Found ${results.length} ${intent.subject}.`;
    }

    // Handle sum action
    if (intent.action === 'sum') {
      const total = results.reduce((sum, r) => sum + (r.amount?.amount || r.totalAmount || 0), 0);
      const currency = results[0]?.amount?.currency || results[0]?.currency || 'USD';
      return `Total ${intent.subject}: ${total.toLocaleString()} ${currency}`;
    }

    // Handle average action
    if (intent.action === 'average') {
      const total = results.reduce((sum, r) => sum + (r.amount?.amount || r.totalAmount || 0), 0);
      const avg = total / results.length;
      const currency = results[0]?.amount?.currency || results[0]?.currency || 'USD';
      return `Average ${intent.subject}: ${avg.toFixed(2)} ${currency}`;
    }

    // Handle grouped results
    if (aggregations && results[0]?.group) {
      let output = `\n${intent.subject.toUpperCase()} BY ${aggregations[0].field.toUpperCase()}\n`;
      output += '='.repeat(50) + '\n\n';

      for (const item of results) {
        output += `${item.group}:\n`;
        output += `  Count: ${item.count}\n`;
        output += `  Total: ${item.totalAmount.toLocaleString()} ${item.currency}\n`;
        if (item.successRate !== undefined) {
          output += `  Success Rate: ${item.successRate}%\n`;
        }
        output += '\n';
      }

      return output;
    }

    // Default: list results
    let output = `\nFound ${results.length} ${intent.subject}:\n`;
    output += '='.repeat(50) + '\n\n';

    for (const item of results.slice(0, 10)) {
      output += `- ${item.id || 'N/A'}: ${item.amount?.amount || 0} ${item.amount?.currency || 'USD'}`;
      output += ` (${item.status || 'unknown'})\n`;
    }

    if (results.length > 10) {
      output += `\n... and ${results.length - 10} more\n`;
    }

    return output;
  }

  /**
   * Get query statistics
   */
  getStats(): {
    queriesProcessed: number;
    transactionsAvailable: number;
  } {
    return {
      queriesProcessed: 0, // Would track in production
      transactionsAvailable: this.transactionStore.length,
    };
  }

  /**
   * Reset all data (for testing)
   */
  reset(): void {
    this.transactionStore = [];
  }
}

// Export singleton helper
export function createNLQueryEngine(logger: Logger): NLQueryEngine {
  return new NLQueryEngine(logger);
}
