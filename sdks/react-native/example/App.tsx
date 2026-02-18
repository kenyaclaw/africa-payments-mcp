import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  Button,
  ScrollView,
  Alert,
} from 'react-native';
import {
  PaymentButton,
  PaymentModal,
  usePayment,
  useTransaction,
} from 'africa-payments-mcp-rn';

const CONFIG = {
  apiKey: 'your-api-key-here',
  environment: 'sandbox' as const,
  region: 'ke' as const,
};

// Example 1: Simple Payment Button
function SimplePaymentExample() {
  return (
    <View style={styles.exampleContainer}>
      <Text style={styles.exampleTitle}>1. Simple Payment Button</Text>
      <PaymentButton
        config={CONFIG}
        request={{
          amount: 1000,
          currency: 'KES',
          phoneNumber: '254712345678',
          reference: `ORDER-${Date.now()}`,
          description: 'Test payment',
        }}
        title="Pay KES 1,000"
        onSuccess={(response) => {
          Alert.alert('Success', `Transaction ID: ${response.transactionId}`);
        }}
        onError={(error) => {
          Alert.alert('Error', error.message);
        }}
      />
    </View>
  );
}

// Example 2: Payment Modal
function PaymentModalExample() {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.exampleContainer}>
      <Text style={styles.exampleTitle}>2. Payment Modal</Text>
      <Button title="Open Payment Modal" onPress={() => setVisible(true)} />
      
      <PaymentModal
        visible={visible}
        onClose={() => setVisible(false)}
        config={CONFIG}
        amount={2500}
        currency="KES"
        reference={`ORDER-${Date.now()}`}
        description="Premium subscription"
        title="Complete Your Purchase"
        onSuccess={(response) => {
          Alert.alert('Success', `Paid! TX: ${response.transactionId}`);
          setVisible(false);
        }}
        onError={(error) => {
          Alert.alert('Payment Failed', error.message);
        }}
      />
    </View>
  );
}

// Example 3: Using usePayment Hook
function UsePaymentHookExample() {
  const { pay, loading, error, response, reset } = usePayment({
    config: CONFIG,
    onSuccess: (res) => {
      Alert.alert('Payment Successful!', `TX: ${res.transactionId}`);
    },
    onError: (err) => {
      Alert.alert('Payment Failed', err.message);
    },
  });

  const handlePayment = async () => {
    try {
      await pay({
        amount: 500,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: `HOOK-${Date.now()}`,
        description: 'Hook-based payment',
      });
    } catch (e) {
      // Error handled by onError callback
    }
  };

  return (
    <View style={styles.exampleContainer}>
      <Text style={styles.exampleTitle}>3. usePayment Hook</Text>
      
      {loading && <Text style={styles.status}>Processing payment...</Text>}
      {error && <Text style={styles.error}>Error: {error.message}</Text>}
      {response && (
        <View style={styles.responseContainer}>
          <Text style={styles.success}>Status: {response.status}</Text>
          <Text>TX ID: {response.transactionId}</Text>
        </View>
      )}
      
      <Button
        title={loading ? 'Processing...' : 'Pay KES 500 (Hook)'}
        onPress={handlePayment}
        disabled={loading}
      />
      
      {response && <Button title="Reset" onPress={reset} color="#888" />}
    </View>
  );
}

// Example 4: Transaction History
function TransactionHistoryExample() {
  const { history, loading, error, fetchHistory } = useTransaction({
    config: CONFIG,
  });

  return (
    <View style={styles.exampleContainer}>
      <Text style={styles.exampleTitle}>4. Transaction History</Text>
      
      <Button
        title={loading ? 'Loading...' : 'Fetch History'}
        onPress={() => fetchHistory({ limit: 10 })}
        disabled={loading}
      />
      
      {error && <Text style={styles.error}>{error.message}</Text>}
      
      {history && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>
            Transactions ({history.total} total):
          </Text>
          {history.transactions.map((tx) => (
            <View key={tx.transactionId} style={styles.transactionItem}>
              <Text style={styles.txReference}>{tx.reference}</Text>
              <Text>
                {tx.currency} {tx.amount.toLocaleString()}
              </Text>
              <Text style={[
                styles.txStatus,
                tx.status === 'success' && styles.txStatusSuccess,
                tx.status === 'failed' && styles.txStatusFailed,
                tx.status === 'pending' && styles.txStatusPending,
              ]}>
                {tx.status.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Main App
export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Africa Payments MCP</Text>
      <Text style={styles.subheader}>React Native SDK Demo</Text>
      
      <ScrollView style={styles.scrollView}>
        <SimplePaymentExample />
        <PaymentModalExample />
        <UsePaymentHookExample />
        <TransactionHistoryExample />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
    color: '#1A1A1A',
  },
  subheader: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  exampleContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exampleTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1A1A1A',
  },
  status: {
    fontSize: 14,
    color: '#007BFF',
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: '#DC3545',
    marginBottom: 8,
  },
  success: {
    fontSize: 14,
    color: '#00A86B',
    fontWeight: '600',
  },
  responseContainer: {
    backgroundColor: '#F0F9F4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  historyContainer: {
    marginTop: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  transactionItem: {
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
  },
  txReference: {
    fontWeight: '600',
    marginBottom: 4,
  },
  txStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  txStatusSuccess: {
    color: '#00A86B',
  },
  txStatusFailed: {
    color: '#DC3545',
  },
  txStatusPending: {
    color: '#FFC107',
  },
});
