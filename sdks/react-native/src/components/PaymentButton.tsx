import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { usePayment } from '../hooks/usePayment';
import type { PaymentRequest, PaymentConfig } from '../types';

export interface PaymentButtonProps {
  config: PaymentConfig;
  request: PaymentRequest;
  title?: string;
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
  onPending?: (response: any) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  activeOpacity?: number;
  testID?: string;
  accessibilityLabel?: string;
  icon?: React.ReactNode;
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({
  config,
  request,
  title = 'Pay Now',
  onSuccess,
  onError,
  onPending,
  disabled = false,
  loading: externalLoading = false,
  style,
  textStyle,
  activeOpacity = 0.7,
  testID = 'payment-button',
  accessibilityLabel = 'Make payment',
  icon,
}) => {
  const { pay, loading: internalLoading, error } = usePayment({
    config,
    onSuccess,
    onError,
    onPending,
  });

  const loading = internalLoading || externalLoading;

  const handlePress = useCallback(async () => {
    try {
      await pay(request);
    } catch (err) {
      // Error is already handled by usePayment hook
    }
  }, [pay, request]);

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={activeOpacity}
      style={[styles.button, isDisabled && styles.buttonDisabled, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" testID="payment-button-loading" />
        ) : (
          <>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text style={[styles.text, textStyle]}>{title}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#00A86B',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonDisabled: {
    backgroundColor: '#A0A0A0',
    elevation: 0,
    shadowOpacity: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PaymentButton;
