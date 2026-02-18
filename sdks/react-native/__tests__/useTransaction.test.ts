import { renderHook, act, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { useTransaction } from '../src/hooks/useTransaction';

const mockGetTransaction = jest.fn();
const mockGetTransactionHistory = jest.fn();
const mockRefundTransaction = jest.fn();
const mockInitialize = jest.fn();

NativeModules.AfricaPaymentsMcpRn = {
  initialize: mockInitialize,
  getTransaction: mockGetTransaction,
  getTransactionHistory: mockGetTransactionHistory,
  refundTransaction: mockRefundTransaction,
};

describe('useTransaction', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    environment: 'sandbox' as const,
    region: 'ke' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with correct state', () => {
    const { result } = renderHook(() => 
      useTransaction({ config: mockConfig })
    );

    expect(result.current.transaction).toBeNull();
    expect(result.current.history).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch transaction successfully', async () => {
    const mockTransaction = {
      transactionId: 'tx-123',
      status: 'success',
      reference: 'REF-001',
      amount: 1000,
      currency: 'KES',
      phoneNumber: '254712345678',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockInitialize.mockResolvedValue({ success: true });
    mockGetTransaction.mockResolvedValue(mockTransaction);

    const { result } = renderHook(() => useTransaction({ config: mockConfig }));

    await act(async () => {
      await result.current.fetchTransaction('tx-123');
    });

    expect(mockInitialize).toHaveBeenCalledWith(mockConfig);
    expect(mockGetTransaction).toHaveBeenCalledWith('tx-123');
    expect(result.current.transaction).toEqual(mockTransaction);
    expect(result.current.loading).toBe(false);
  });

  it('should fetch transaction history successfully', async () => {
    const mockHistory = {
      transactions: [
        {
          transactionId: 'tx-001',
          status: 'success',
          reference: 'REF-001',
          amount: 1000,
          currency: 'KES',
          phoneNumber: '254712345678',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
      hasMore: false,
    };

    mockInitialize.mockResolvedValue({ success: true });
    mockGetTransactionHistory.mockResolvedValue(mockHistory);

    const { result } = renderHook(() => useTransaction({ config: mockConfig }));

    const query = { limit: 10, offset: 0 };
    await act(async () => {
      await result.current.fetchHistory(query);
    });

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(query);
    expect(result.current.history).toEqual(mockHistory);
  });

  it('should process refund successfully', async () => {
    const mockRefundResponse = {
      transactionId: 'refund-123',
      status: 'success',
      reference: 'REFUND-001',
      amount: 500,
      currency: 'KES',
      phoneNumber: '254712345678',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockInitialize.mockResolvedValue({ success: true });
    mockRefundTransaction.mockResolvedValue(mockRefundResponse);

    const { result } = renderHook(() => useTransaction({ config: mockConfig }));

    await act(async () => {
      await result.current.refund('tx-123', 500);
    });

    expect(mockRefundTransaction).toHaveBeenCalledWith('tx-123', 500);
  });

  it('should handle fetch error', async () => {
    const mockError = new Error('Network error');
    mockInitialize.mockResolvedValue({ success: true });
    mockGetTransaction.mockRejectedValue(mockError);

    const { result } = renderHook(() => useTransaction({ config: mockConfig }));

    await act(async () => {
      try {
        await result.current.fetchTransaction('tx-123');
      } catch (e) {
        // Expected
      }
    });

    expect(result.current.error).toEqual(mockError);
    expect(result.current.transaction).toBeNull();
  });

  it('should auto-fetch history on mount when enabled', async () => {
    const mockHistory = {
      transactions: [],
      total: 0,
      hasMore: false,
    };

    mockInitialize.mockResolvedValue({ success: true });
    mockGetTransactionHistory.mockResolvedValue(mockHistory);

    const query = { limit: 10 };
    renderHook(() => 
      useTransaction({ config: mockConfig, autoFetch: true, query })
    );

    await waitFor(() => {
      expect(mockGetTransactionHistory).toHaveBeenCalledWith(query);
    });
  });
});
