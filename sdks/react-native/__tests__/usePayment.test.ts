import { renderHook, act, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { usePayment } from '../src/hooks/usePayment';

const mockInitiatePayment = jest.fn();
const mockInitialize = jest.fn();

NativeModules.AfricaPaymentsMcpRn = {
  initialize: mockInitialize,
  initiatePayment: mockInitiatePayment,
};

describe('usePayment', () => {
  const mockConfig = {
    apiKey: 'test-api-key',
    environment: 'sandbox' as const,
    region: 'ke' as const,
  };

  const mockRequest = {
    amount: 1000,
    currency: 'KES',
    phoneNumber: '254712345678',
    reference: 'REF-001',
    description: 'Test payment',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with correct state', () => {
    const { result } = renderHook(() => usePayment({ config: mockConfig }));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
  });

  it('should handle successful payment', async () => {
    const mockResponse = {
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
    mockInitiatePayment.mockResolvedValue(mockResponse);

    const onSuccess = jest.fn();
    const { result } = renderHook(() => 
      usePayment({ config: mockConfig, onSuccess })
    );

    await act(async () => {
      await result.current.pay(mockRequest);
    });

    expect(mockInitialize).toHaveBeenCalledWith(mockConfig);
    expect(mockInitiatePayment).toHaveBeenCalledWith(mockRequest);
    expect(result.current.response).toEqual(mockResponse);
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith(mockResponse);
  });

  it('should handle payment error', async () => {
    const mockError = new Error('Network error');
    mockInitialize.mockResolvedValue({ success: true });
    mockInitiatePayment.mockRejectedValue(mockError);

    const onError = jest.fn();
    const { result } = renderHook(() => 
      usePayment({ config: mockConfig, onError })
    );

    await act(async () => {
      try {
        await result.current.pay(mockRequest);
      } catch (e) {
        // Expected
      }
    });

    expect(result.current.error).toEqual(mockError);
    expect(result.current.response).toBeNull();
    expect(onError).toHaveBeenCalledWith(mockError);
  });

  it('should reset state correctly', async () => {
    const mockResponse = {
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
    mockInitiatePayment.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePayment({ config: mockConfig }));

    await act(async () => {
      await result.current.pay(mockRequest);
    });

    expect(result.current.response).toEqual(mockResponse);

    act(() => {
      result.current.reset();
    });

    expect(result.current.response).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should set loading state during payment', async () => {
    mockInitialize.mockResolvedValue({ success: true });
    mockInitiatePayment.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'success' }), 100))
    );

    const { result } = renderHook(() => usePayment({ config: mockConfig }));

    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.pay(mockRequest);
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
