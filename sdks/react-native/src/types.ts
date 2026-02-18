export interface PaymentConfig {
  apiKey: string;
  environment: 'sandbox' | 'production';
  region: 'ke' | 'ng' | 'gh' | 'za' | 'tz' | 'ug';
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  phoneNumber: string;
  reference: string;
  description?: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  reference: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  createdAt: string;
  updatedAt: string;
  receiptUrl?: string;
  failureReason?: string;
}

export interface TransactionQuery {
  transactionId?: string;
  reference?: string;
  startDate?: string;
  endDate?: string;
  status?: PaymentResponse['status'];
  limit?: number;
  offset?: number;
}

export interface TransactionHistory {
  transactions: PaymentResponse[];
  total: number;
  hasMore: boolean;
}

export type PaymentProvider = 'mpesa' | 'mtn' | 'vodafone' | 'airtel' | 'bank' | 'card';

export interface ProviderConfig {
  provider: PaymentProvider;
  enabled: boolean;
  config?: Record<string, any>;
}

export type PaymentEventType = 
  | 'payment.initiated'
  | 'payment.pending'
  | 'payment.success'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.timeout';

export interface PaymentEvent {
  type: PaymentEventType;
  data: PaymentResponse;
  timestamp: number;
}

export type PaymentEventListener = (event: PaymentEvent) => void;
