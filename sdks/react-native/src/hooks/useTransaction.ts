import { useState, useCallback, useEffect } from 'react';
import { NativeModules } from 'react-native';
import type {
  PaymentResponse,
  TransactionQuery,
  TransactionHistory,
  PaymentConfig,
} from '../types';

const { AfricaPaymentsMcpRn } = NativeModules;

export interface UseTransactionOptions {
  config: PaymentConfig;
  autoFetch?: boolean;
  query?: TransactionQuery;
  pollingInterval?: number; // in milliseconds
}

export interface UseTransactionResult {
  transaction: PaymentResponse | null;
  history: TransactionHistory | null;
  loading: boolean;
  error: Error | null;
  fetchTransaction: (transactionId: string) => Promise<PaymentResponse>;
  fetchHistory: (query?: TransactionQuery) => Promise<TransactionHistory>;
  refund: (transactionId: string, amount?: number) => Promise<PaymentResponse>;
  refresh: () => void;
}

export function useTransaction(options: UseTransactionOptions): UseTransactionResult {
  const [transaction, setTransaction] = useState<PaymentResponse | null>(null);
  const [history, setHistory] = useState<TransactionHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTransaction = useCallback(
    async (transactionId: string): Promise<PaymentResponse> => {
      setLoading(true);
      setError(null);
      
      try {
        await AfricaPaymentsMcpRn.initialize(options.config);
        const result: PaymentResponse = await AfricaPaymentsMcpRn.getTransaction(transactionId);
        setTransaction(result);
        return result;
      } catch (err) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        setError(fetchError);
        throw fetchError;
      } finally {
        setLoading(false);
      }
    },
    [options.config]
  );

  const fetchHistory = useCallback(
    async (query?: TransactionQuery): Promise<TransactionHistory> => {
      setLoading(true);
      setError(null);
      
      try {
        await AfricaPaymentsMcpRn.initialize(options.config);
        const result: TransactionHistory = await AfricaPaymentsMcpRn.getTransactionHistory(
          query || options.query || {}
        );
        setHistory(result);
        return result;
      } catch (err) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        setError(fetchError);
        throw fetchError;
      } finally {
        setLoading(false);
      }
    },
    [options.config, options.query]
  );

  const refund = useCallback(
    async (transactionId: string, amount?: number): Promise<PaymentResponse> => {
      setLoading(true);
      setError(null);
      
      try {
        await AfricaPaymentsMcpRn.initialize(options.config);
        const result: PaymentResponse = await AfricaPaymentsMcpRn.refundTransaction(
          transactionId,
          amount
        );
        return result;
      } catch (err) {
        const refundError = err instanceof Error ? err : new Error(String(err));
        setError(refundError);
        throw refundError;
      } finally {
        setLoading(false);
      }
    },
    [options.config]
  );

  const refresh = useCallback(() => {
    if (options.query) {
      fetchHistory(options.query);
    }
  }, [fetchHistory, options.query]);

  // Polling for transaction status updates
  useEffect(() => {
    if (!options.pollingInterval || !transaction) return;

    const interval = setInterval(() => {
      if (transaction.status === 'pending') {
        fetchTransaction(transaction.transactionId);
      }
    }, options.pollingInterval);

    return () => clearInterval(interval);
  }, [options.pollingInterval, transaction, fetchTransaction]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (options.autoFetch && options.query) {
      fetchHistory(options.query);
    }
  }, [options.autoFetch, fetchHistory]);

  return {
    transaction,
    history,
    loading,
    error,
    fetchTransaction,
    fetchHistory,
    refund,
    refresh,
  };
}

export default useTransaction;
