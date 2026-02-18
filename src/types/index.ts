/**
 * Africa Payments MCP Server - Type Definitions
 * Unified interface for all African payment providers
 */

// ==================== Core Payment Types ====================

export interface Money {
  amount: number;
  currency: string; // ISO 4217: KES, NGN, GHS, UGX, TZS, ZAR, etc.
}

export interface PhoneNumber {
  countryCode: string; // e.g., "254" for Kenya
  nationalNumber: string; // e.g., "712345678"
  formatted: string; // e.g., "+254712345678"
}

export interface Customer {
  id?: string;
  name?: string;
  email?: string;
  phone?: PhoneNumber;
  country?: string; // ISO 3166-1 alpha-2: KE, NG, GH, UG, TZ, ZA
}

// ==================== Transaction Types ====================

export type TransactionStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'refunded';

export type PaymentMethod = 
  | 'mobile_money' 
  | 'card' 
  | 'bank_transfer' 
  | 'wallet' 
  | 'qr_code';

export interface Transaction {
  id: string;
  providerTransactionId: string;
  provider: string; // 'mpesa', 'paystack', 'mtn_momo', etc.
  status: TransactionStatus;
  amount: Money;
  customer: Customer;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  refundId?: string;
}

export interface TransactionQuery {
  startDate?: Date;
  endDate?: Date;
  status?: TransactionStatus;
  provider?: string;
  customerId?: string;
  phoneNumber?: string;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  limit?: number;
  offset?: number;
}

// ==================== Payment Operations ====================

export interface SendMoneyParams {
  recipient: {
    phone?: PhoneNumber;
    email?: string;
    name?: string;
    bankAccount?: {
      accountNumber: string;
      bankCode: string;
      accountName?: string;
    };
  };
  amount: Money;
  description?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
  provider?: string; // Optional: auto-select if not specified
}

export interface RequestPaymentParams {
  customer: Customer;
  amount: Money;
  description?: string;
  expiryMinutes?: number;
  callbackUrl?: string;
  metadata?: Record<string, any>;
  provider?: string;
}

export interface RefundParams {
  originalTransactionId: string;
  amount?: Money; // Partial refund if specified
  reason?: string;
}

// ==================== Provider Interface ====================

export interface ProviderConfig {
  enabled: boolean;
  environment: 'sandbox' | 'production';
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface PaymentProvider {
  readonly name: string;
  readonly displayName: string;
  readonly countries: string[]; // ISO codes
  readonly currencies: string[]; // ISO codes
  readonly supportedMethods: PaymentMethod[];
  readonly config: ProviderConfig;

  // Core operations
  initialize(config: Record<string, any>): Promise<void>;
  
  sendMoney(params: SendMoneyParams): Promise<Transaction>;
  requestPayment(params: RequestPaymentParams): Promise<Transaction>;
  verifyTransaction(id: string): Promise<Transaction>;
  refund(params: RefundParams): Promise<Transaction>;
  
  // Optional operations
  getBalance?(): Promise<Money>;
  getRates?(from: string, to: string): Promise<number>;
  validatePhone?(phone: string): Promise<boolean>;
  listTransactions?(query: TransactionQuery): Promise<Transaction[]>;
  
  // Webhook handling
  parseWebhook?(payload: any, signature?: string): Promise<Transaction>;
  verifyWebhookSignature?(payload: any, signature: string): Promise<boolean>;
}

// ==================== MCP Tool Types ====================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
}

// ==================== Server Configuration ====================

export interface ServerConfig {
  providers: {
    mpesa?: MpesaConfig;
    paystack?: PaystackConfig;
    intasend?: IntaSendConfig;
    mtn_momo?: MTNMoMoConfig;
    airtel_money?: AirtelMoneyConfig;
    orange_money?: OrangeMoneyConfig;
    chipper_cash?: ChipperCashConfig;
    wave?: WaveConfig;
  };
  defaults: {
    currency: string;
    country: string;
    provider?: string;
  };
  server: {
    port?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    webhookBaseUrl?: string;
  };
}

// ==================== Provider-Specific Configs ====================

export interface MpesaConfig extends ProviderConfig {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortCode: string;
  initiatorName?: string;
  initiatorPassword?: string;
  securityCredential?: string;
}

export interface PaystackConfig extends ProviderConfig {
  secretKey: string;
  publicKey?: string;
  webhookSecret?: string;
}

export interface IntaSendConfig extends ProviderConfig {
  publishableKey: string;
  secretKey: string;
  serviceProvider?: 'M-PESA' | 'T-KASH' | 'AIRTEL' | 'MTN';
}

export interface MTNMoMoConfig extends ProviderConfig {
  apiUser: string;
  apiKey: string;
  subscriptionKey: string;
  targetEnvironment?: 'sandbox' | 'production';
  apiBaseUrl?: string;
}

export interface AirtelMoneyConfig extends ProviderConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface OrangeMoneyConfig extends ProviderConfig {
  clientId: string;
  clientSecret: string;
  merchantId: string;
  environment: 'sandbox' | 'production';
}

export interface ChipperCashConfig extends ProviderConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
}

export interface WaveConfig extends ProviderConfig {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: 'sandbox' | 'production';
}

// ==================== Error Types ====================

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string,
    public readonly transactionId?: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export enum ErrorCodes {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG',
  PROVIDER_NOT_AVAILABLE = 'PROVIDER_NOT_AVAILABLE',
  
  // Validation errors
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_PHONE = 'INVALID_PHONE',
  INVALID_CURRENCY = 'INVALID_CURRENCY',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Provider errors
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Auth errors
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}

// ==================== Country/Provider Mapping ====================

export const COUNTRY_DEFAULT_PROVIDERS: Record<string, string[]> = {
  KE: ['mpesa', 'intasend', 'paystack'], // Kenya
  NG: ['paystack', 'intasend', 'flutterwave'], // Nigeria
  GH: ['paystack', 'mtn_momo', 'vodafone_cash'], // Ghana
  UG: ['mtn_momo', 'airtel_money', 'paystack'], // Uganda
  TZ: ['mpesa', 'airtel_money', 'tigo_pesa'], // Tanzania
  ZA: ['paystack', 'flutterwave'], // South Africa
  RW: ['mtn_momo', 'airtel_money'], // Rwanda
  CI: ['wave', 'mtn_momo', 'orange_money'], // Ivory Coast
  SN: ['wave', 'orange_money'], // Senegal
  CM: ['mtn_momo', 'orange_money'], // Cameroon
  ET: ['cbe_birr', 'telebirr'], // Ethiopia
  ZM: ['airtel_money', 'mtn_momo'], // Zambia
  MW: ['airtel_money', 'tnm_mpamba'], // Malawi
  MZ: ['m-pesa', 'mkesh'], // Mozambique
  BW: ['orange_money', 'smega'], // Botswana
};

export const PROVIDER_COUNTRIES: Record<string, string[]> = {
  mpesa: ['KE', 'TZ', 'MZ', 'EG', 'IN', 'RO'],
  paystack: ['NG', 'GH', 'ZA', 'KE'],
  flutterwave: ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW', 'CM', 'CI', 'SN'],
  mtn_momo: ['UG', 'GH', 'CM', 'CI', 'RW', 'ZA', 'SN', 'BJ', 'CG', 'GN'],
  airtel_money: ['KE', 'UG', 'TZ', 'ZM', 'MW', 'RW', 'CG', 'CD', 'GA'],
  wave: ['SN', 'CI', 'UG', 'BF', 'ML'],
  intasend: ['KE', 'NG'],
  chipper_cash: ['NG', 'GH', 'KE', 'UG', 'ZA', 'GB'],
};
