import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:africa_payments_mcp/africa_payments_mcp.dart';

void main() {
  const MethodChannel channel = MethodChannel('africa_payments_mcp');

  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    channel.setMockMethodCallHandler((MethodCall methodCall) async {
      switch (methodCall.method) {
        case 'initialize':
          return {'success': true, 'message': 'SDK initialized'};
        case 'initiatePayment':
          return {
            'transactionId': 'tx-123',
            'status': 'pending',
            'reference': 'REF-001',
            'amount': 1000.0,
            'currency': 'KES',
            'phoneNumber': '254712345678',
            'createdAt': '2024-01-01T00:00:00.000Z',
            'updatedAt': '2024-01-01T00:00:00.000Z',
          };
        case 'getTransaction':
          return {
            'transactionId': 'tx-123',
            'status': 'success',
            'reference': 'REF-001',
            'amount': 1000.0,
            'currency': 'KES',
            'phoneNumber': '254712345678',
            'createdAt': '2024-01-01T00:00:00.000Z',
            'updatedAt': '2024-01-01T00:00:00.000Z',
          };
        case 'getTransactionHistory':
          return {
            'transactions': [
              {
                'transactionId': 'tx-001',
                'status': 'success',
                'reference': 'REF-001',
                'amount': 1000.0,
                'currency': 'KES',
                'phoneNumber': '254712345678',
                'createdAt': '2024-01-01T00:00:00.000Z',
                'updatedAt': '2024-01-01T00:00:00.000Z',
              }
            ],
            'total': 1,
            'hasMore': false,
          };
        case 'refundTransaction':
          return {
            'transactionId': 'refund-123',
            'status': 'success',
            'reference': 'REFUND-001',
            'amount': 500.0,
            'currency': 'KES',
            'phoneNumber': '254712345678',
            'createdAt': '2024-01-01T00:00:00.000Z',
            'updatedAt': '2024-01-01T00:00:00.000Z',
          };
        default:
          return null;
      }
    });
  });

  tearDown(() {
    channel.setMockMethodCallHandler(null);
  });

  group('PaymentService', () {
    late PaymentService service;
    const config = PaymentConfig(
      apiKey: 'test-api-key',
      environment: PaymentEnvironment.sandbox,
      region: PaymentRegion.kenya,
    );

    setUp(() {
      service = PaymentService();
    });

    tearDown(() {
      service.dispose();
    });

    test('initialize succeeds', () async {
      await expectLater(
        service.initialize(config),
        completes,
      );
      expect(service.config, equals(config));
    });

    test('initiatePayment returns PaymentResponse', () async {
      await service.initialize(config);
      
      final request = PaymentRequest(
        amount: 1000.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'REF-001',
      );

      final response = await service.initiatePayment(request);
      
      expect(response.transactionId, 'tx-123');
      expect(response.status, PaymentStatus.pending);
      expect(response.amount, 1000.0);
    });

    test('getTransaction returns PaymentResponse', () async {
      await service.initialize(config);
      
      final response = await service.getTransaction('tx-123');
      
      expect(response.transactionId, 'tx-123');
      expect(response.status, PaymentStatus.success);
    });

    test('getTransactionHistory returns TransactionHistory', () async {
      await service.initialize(config);
      
      final history = await service.getTransactionHistory(
        TransactionQuery(limit: 10),
      );
      
      expect(history.transactions.length, 1);
      expect(history.total, 1);
      expect(history.hasMore, false);
    });

    test('refundTransaction returns PaymentResponse', () async {
      await service.initialize(config);
      
      final response = await service.refundTransaction('tx-123', amount: 500.0);
      
      expect(response.status, PaymentStatus.success);
      expect(response.amount, 500.0);
    });

    test('throws PaymentException when not initialized', () async {
      final request = PaymentRequest(
        amount: 1000.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'REF-001',
      );

      expect(
        () => service.initiatePayment(request),
        throwsA(isA<PaymentException>()),
      );
    });
  });
}
