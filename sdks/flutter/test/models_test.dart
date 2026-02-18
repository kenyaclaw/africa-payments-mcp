import 'package:flutter_test/flutter_test.dart';
import 'package:africa_payments_mcp/africa_payments_mcp.dart';

void main() {
  group('PaymentConfig', () {
    test('should create valid config', () {
      const config = PaymentConfig(
        apiKey: 'test-api-key',
        environment: PaymentEnvironment.sandbox,
        region: PaymentRegion.kenya,
      );

      expect(config.apiKey, 'test-api-key');
      expect(config.environment, PaymentEnvironment.sandbox);
      expect(config.region, PaymentRegion.kenya);
      expect(config.timeoutSeconds, 30);
    });

    test('should serialize to JSON', () {
      const config = PaymentConfig(
        apiKey: 'test-api-key',
        environment: PaymentEnvironment.production,
        region: PaymentRegion.nigeria,
      );

      final json = config.toJson();
      expect(json['apiKey'], 'test-api-key');
      expect(json['environment'], 'production');
      expect(json['region'], 'ng');
    });

    test('should deserialize from JSON', () {
      final json = {
        'apiKey': 'test-api-key',
        'environment': 'sandbox',
        'region': 'ke',
        'timeoutSeconds': 60,
      };

      final config = PaymentConfig.fromJson(json);
      expect(config.apiKey, 'test-api-key');
      expect(config.environment, PaymentEnvironment.sandbox);
      expect(config.region, PaymentRegion.kenya);
      expect(config.timeoutSeconds, 60);
    });

    test('should return correct base URL', () {
      const sandboxConfig = PaymentConfig(
        apiKey: 'key',
        environment: PaymentEnvironment.sandbox,
        region: PaymentRegion.kenya,
      );

      const productionConfig = PaymentConfig(
        apiKey: 'key',
        environment: PaymentEnvironment.production,
        region: PaymentRegion.kenya,
      );

      expect(
        sandboxConfig.baseUrlEffective,
        'https://api.sandbox.africapayments.com',
      );
      expect(
        productionConfig.baseUrlEffective,
        'https://api.africapayments.com',
      );
    });
  });

  group('PaymentRequest', () {
    test('should validate correctly', () {
      const validRequest = PaymentRequest(
        amount: 100.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'REF-001',
      );

      const invalidRequest = PaymentRequest(
        amount: 0,
        currency: '',
        phoneNumber: '',
        reference: '',
      );

      expect(validRequest.isValid, true);
      expect(invalidRequest.isValid, false);
    });

    test('should clean phone number', () {
      const request = PaymentRequest(
        amount: 100.0,
        currency: 'KES',
        phoneNumber: '+254 (712) 345-678',
        reference: 'REF-001',
      );

      expect(request.cleanPhoneNumber, '254712345678');
    });

    test('should serialize to JSON', () {
      const request = PaymentRequest(
        amount: 1000.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        reference: 'REF-001',
        description: 'Test payment',
      );

      final json = request.toJson();
      expect(json['amount'], 1000.0);
      expect(json['currency'], 'KES');
      expect(json['phoneNumber'], '254712345678');
      expect(json['reference'], 'REF-001');
      expect(json['description'], 'Test payment');
    });
  });

  group('PaymentResponse', () {
    test('should determine success status', () {
      final successResponse = PaymentResponse(
        transactionId: 'tx-123',
        status: PaymentStatus.success,
        reference: 'REF-001',
        amount: 1000.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final pendingResponse = PaymentResponse(
        transactionId: 'tx-124',
        status: PaymentStatus.pending,
        reference: 'REF-002',
        amount: 500.0,
        currency: 'KES',
        phoneNumber: '254712345678',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(successResponse.isSuccess, true);
      expect(successResponse.isPending, false);
      expect(pendingResponse.isSuccess, false);
      expect(pendingResponse.isPending, true);
    });
  });

  group('PaymentRegion', () {
    test('should have correct JSON values', () {
      expect(PaymentRegion.kenya.name, 'kenya');
      expect(PaymentRegion.nigeria.name, 'nigeria');
      expect(PaymentRegion.ghana.name, 'ghana');
    });
  });

  group('ProviderConfig', () {
    test('should have correct display names', () {
      const mpesa = ProviderConfig(
        provider: PaymentProvider.mpesa,
        enabled: true,
      );

      const mtn = ProviderConfig(
        provider: PaymentProvider.mtn,
        enabled: true,
      );

      expect(mpesa.displayName, 'M-Pesa');
      expect(mtn.displayName, 'MTN Mobile Money');
    });
  });
}
