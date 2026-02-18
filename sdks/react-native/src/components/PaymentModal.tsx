import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { usePayment } from '../hooks/usePayment';
import type { PaymentRequest, PaymentConfig } from '../types';

const { height } = Dimensions.get('window');

export interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  config: PaymentConfig;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  title?: string;
  onSuccess?: (response: any) => void;
  onError?: (error: Error) => void;
  testID?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  onClose,
  config,
  amount,
  currency,
  reference,
  description,
  title = 'Complete Payment',
  onSuccess,
  onError,
  testID = 'payment-modal',
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isValid, setIsValid] = useState(false);

  const { pay, loading, error, response, reset } = usePayment({
    config,
    onSuccess: (res) => {
      onSuccess?.(res);
      setTimeout(() => {
        handleClose();
      }, 2000);
    },
    onError,
  });

  // Validate phone number (simple validation for African numbers)
  useEffect(() => {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    setIsValid(cleanNumber.length >= 9 && cleanNumber.length <= 12);
  }, [phoneNumber]);

  const handlePay = useCallback(async () => {
    if (!isValid) return;

    const request: PaymentRequest = {
      amount,
      currency,
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      reference,
      description,
    };

    try {
      await pay(request);
    } catch (err) {
      // Error handled by hook
    }
  }, [pay, amount, currency, phoneNumber, reference, description, isValid]);

  const handleClose = useCallback(() => {
    reset();
    setPhoneNumber('');
    onClose();
  }, [onClose, reset]);

  const formatPhoneNumber = (text: string) => {
    // Remove non-digits
    const cleaned = text.replace(/\D/g, '');
    setPhoneNumber(cleaned);
  };

  const getStatusMessage = () => {
    if (!response) return null;
    
    switch (response.status) {
      case 'pending':
        return 'Please check your phone and enter your PIN to complete the payment.';
      case 'success':
        return 'Payment completed successfully!';
      case 'failed':
        return response.failureReason || 'Payment failed. Please try again.';
      default:
        return null;
    }
  };

  const statusMessage = getStatusMessage();
  const statusColor = response?.status === 'success' 
    ? '#00A86B' 
    : response?.status === 'failed' 
    ? '#DC3545' 
    : '#007BFF';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity 
                  onPress={handleClose} 
                  style={styles.closeButton}
                  testID="payment-modal-close"
                >
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Amount Display */}
              <View style={styles.amountContainer}>
                <Text style={styles.amountLabel}>Amount to Pay</Text>
                <Text style={styles.amount}>
                  {currency} {amount.toLocaleString()}
                </Text>
                {description && (
                  <Text style={styles.description}>{description}</Text>
                )}
              </View>

              {/* Status Message */}
              {statusMessage && (
                <View style={[styles.statusContainer, { backgroundColor: `${statusColor}15` }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {statusMessage}
                  </Text>
                </View>
              )}

              {/* Error Message */}
              {error && !response && (
                <View style={[styles.statusContainer, { backgroundColor: '#DC354515' }]}>
                  <Text style={[styles.statusText, { color: '#DC3545' }]}>
                    {error.message}
                  </Text>
                </View>
              )}

              {/* Input Form */}
              {(!response || response.status === 'failed') && (
                <View style={styles.form}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 254712345678"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={formatPhoneNumber}
                    maxLength={12}
                    editable={!loading}
                    testID="payment-modal-phone-input"
                  />
                  <Text style={styles.hint}>
                    Enter your M-Pesa or mobile money number
                  </Text>

                  {/* Pay Button */}
                  <TouchableOpacity
                    style={[
                      styles.payButton,
                      (!isValid || loading) && styles.payButtonDisabled,
                    ]}
                    onPress={handlePay}
                    disabled={!isValid || loading}
                    testID="payment-modal-pay-button"
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.payButtonText}>
                        Pay {currency} {amount.toLocaleString()}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Success State */}
              {response?.status === 'success' && (
                <View style={styles.successContainer}>
                  <View style={styles.successIcon}>
                    <Text style={styles.successIconText}>✓</Text>
                  </View>
                  <Text style={styles.successText}>
                    Transaction ID: {response.transactionId}
                  </Text>
                  <TouchableOpacity
                    style={styles.doneButton}
                    onPress={handleClose}
                    testID="payment-modal-done-button"
                  >
                    <Text style={styles.doneButtonText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.85,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 20,
    color: '#666666',
  },
  amountContainer: {
    alignItems: 'center',
    padding: 24,
  },
  amountLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  description: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
    textAlign: 'center',
  },
  statusContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#F5F5F5',
  },
  hint: {
    fontSize: 12,
    color: '#888888',
    marginTop: 8,
  },
  payButton: {
    backgroundColor: '#00A86B',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  payButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00A86B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconText: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  successText: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: '#00A86B',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PaymentModal;
