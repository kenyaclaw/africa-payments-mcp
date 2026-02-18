import { useState, useCallback, useRef, useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  PaymentRequest,
  PaymentResponse,
  PaymentEvent,
  PaymentEventListener,
  PaymentConfig,
} from '../types';

const { AfricaPaymentsMcpRn } = NativeModules;

export interface UsePaymentOptions {
  config: PaymentConfig;
  onSuccess?: (response: PaymentResponse) => void;
  onError?: (error: Error) => void;
  onPending?: (response: PaymentResponse) => void;
}

export interface UsePaymentResult {
  pay: (request: PaymentRequest) => Promise<PaymentResponse>;
  loading: boolean;
  error: Error | null;
  response: PaymentResponse | null;
  reset: () => void;
}

export function usePayment(options: UsePaymentOptions): UsePaymentResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [response, setResponse] = useState<PaymentResponse | null>(null);
  const eventListenersRef = useRef<PaymentEventListener[]>([]);
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    if (AfricaPaymentsMcpRn) {
      eventEmitterRef.current = new NativeEventEmitter(AfricaPaymentsMcpRn);
      
      const subscription = eventEmitterRef.current.addListener(
        'onPaymentEvent',
        (event: PaymentEvent) => {
          eventListenersRef.current.forEach((listener) => listener(event));
          
          switch (event.type) {
            case 'payment.success':
              options.onSuccess?.(event.data);
              break;
            case 'payment.failed':
              options.onError?.(new Error(event.data.failureReason || 'Payment failed'));
              break;
            case 'payment.pending':
              options.onPending?.(event.data);
              break;
          }
        }
      );

      return () => {
        subscription.remove();
      };
    }
  }, [options]);

  const pay = useCallback(
    async (request: PaymentRequest): Promise<PaymentResponse> => {
      setLoading(true);
      setError(null);
      
      try {
        // Initialize SDK with config
        await AfricaPaymentsMcpRn.initialize(options.config);
        
        // Initiate payment
        const result: PaymentResponse = await AfricaPaymentsMcpRn.initiatePayment(request);
        setResponse(result);
        
        if (result.status === 'failed') {
          throw new Error(result.failureReason || 'Payment failed');
        }
        
        return result;
      } catch (err) {
        const paymentError = err instanceof Error ? err : new Error(String(err));
        setError(paymentError);
        options.onError?.(paymentError);
        throw paymentError;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResponse(null);
  }, []);

  const addEventListener = useCallback((listener: PaymentEventListener) => {
    eventListenersRef.current.push(listener);
    return () => {
      const index = eventListenersRef.current.indexOf(listener);
      if (index > -1) {
        eventListenersRef.current.splice(index, 1);
      }
    };
  }, []);

  return {
    pay,
    loading,
    error,
    response,
    reset,
  };
}

export default usePayment;
