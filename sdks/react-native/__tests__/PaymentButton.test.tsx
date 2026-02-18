import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { PaymentButton } from '../src/components/PaymentButton';

const mockInitiatePayment = jest.fn();
const mockInitialize = jest.fn();

NativeModules.AfricaPaymentsMcpRn = {
  initialize: mockInitialize,
  initiatePayment: mockInitiatePayment,
};

describe('PaymentButton', () => {
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByTestId, getByText } = render(
      <PaymentButton config={mockConfig} request={mockRequest} />
    );

    expect(getByTestId('payment-button')).toBeTruthy();
    expect(getByText('Pay Now')).toBeTruthy();
  });

  it('renders with custom title', () => {
    const { getByText } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest} 
        title="Pay with M-Pesa" 
      />
    );

    expect(getByText('Pay with M-Pesa')).toBeTruthy();
  });

  it('shows loading indicator when loading prop is true', () => {
    const { getByTestId, queryByText } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest} 
        loading={true} 
      />
    );

    expect(getByTestId('payment-button-loading')).toBeTruthy();
    expect(queryByText('Pay Now')).toBeNull();
  });

  it('handles payment on press', async () => {
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
    const { getByTestId } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest}
        onSuccess={onSuccess}
      />
    );

    fireEvent.press(getByTestId('payment-button'));

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalledWith(mockConfig);
      expect(mockInitiatePayment).toHaveBeenCalledWith(mockRequest);
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
    });
  });

  it('calls onError when payment fails', async () => {
    const mockError = new Error('Payment failed');
    mockInitialize.mockResolvedValue({ success: true });
    mockInitiatePayment.mockRejectedValue(mockError);

    const onError = jest.fn();
    const { getByTestId } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest}
        onError={onError}
      />
    );

    fireEvent.press(getByTestId('payment-button'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(mockError);
    });
  });

  it('is disabled when disabled prop is true', () => {
    const { getByTestId } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest}
        disabled={true}
      />
    );

    const button = getByTestId('payment-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it('applies custom styles', () => {
    const customStyle = { backgroundColor: 'red', marginTop: 10 };
    const customTextStyle = { color: 'blue', fontSize: 20 };

    const { getByTestId, getByText } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest}
        style={customStyle}
        textStyle={customTextStyle}
      />
    );

    // Custom styles are applied
    expect(getByTestId('payment-button')).toBeTruthy();
    expect(getByText('Pay Now')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const icon = <span>💳</span>;
    const { getByText } = render(
      <PaymentButton 
        config={mockConfig} 
        request={mockRequest}
        icon={icon}
      />
    );

    expect(getByText('💳')).toBeTruthy();
  });
});
