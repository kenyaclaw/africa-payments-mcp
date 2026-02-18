import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../models/payment_config.dart';
import '../models/payment_request.dart';
import '../models/payment_response.dart';
import '../models/transaction_query.dart';

/// Exception thrown when a payment operation fails
class PaymentException implements Exception {
  final String message;
  final String? code;
  final dynamic details;

  PaymentException(this.message, {this.code, this.details});

  @override
  String toString() => 'PaymentException: $message (code: $code)';
}

/// Callback for payment events
typedef PaymentEventCallback = void Function(PaymentEvent event);

/// Payment event
class PaymentEvent {
  final String type;
  final PaymentResponse data;
  final DateTime timestamp;

  PaymentEvent({
    required this.type,
    required this.data,
  }) : timestamp = DateTime.now();

  static const String initiated = 'payment.initiated';
  static const String pending = 'payment.pending';
  static const String success = 'payment.success';
  static const String failed = 'payment.failed';
  static const String cancelled = 'payment.cancelled';
}

/// Main service for handling payments
class PaymentService {
  static const MethodChannel _channel =
      MethodChannel('africa_payments_mcp');

  PaymentConfig? _config;
  final _eventController = StreamController<PaymentEvent>.broadcast();
  final _eventCallbacks = <PaymentEventCallback>[];

  /// Stream of payment events
  Stream<PaymentEvent> get eventStream => _eventController.stream;

  /// Current configuration
  PaymentConfig? get config => _config;

  /// Initialize the service
  Future<void> initialize(PaymentConfig config) async {
    _config = config;
    try {
      await _channel.invokeMethod('initialize', config.toJson());
      _setupEventListener();
    } on PlatformException catch (e) {
      throw PaymentException(
        'Failed to initialize SDK: ${e.message}',
        code: e.code,
      );
    }
  }

  /// Dispose resources
  void dispose() {
    _eventController.close();
    _eventCallbacks.clear();
  }

  /// Initiate a payment
  Future<PaymentResponse> initiatePayment(PaymentRequest request) async {
    _ensureInitialized();

    if (!request.isValid) {
      throw PaymentException('Invalid payment request');
    }

    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'initiatePayment',
        request.toJson(),
      );

      if (result == null) {
        throw PaymentException('Empty response from native module');
      }

      final response = PaymentResponse.fromJson(
        Map<String, dynamic>.from(result),
      );

      _emitEvent(PaymentEvent(
        type: PaymentEvent.initiated,
        data: response,
      ));

      return response;
    } on PlatformException catch (e) {
      throw PaymentException(
        e.message ?? 'Payment failed',
        code: e.code,
      );
    }
  }

  /// Get transaction details
  Future<PaymentResponse> getTransaction(String transactionId) async {
    _ensureInitialized();

    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getTransaction',
        {'transactionId': transactionId},
      );

      if (result == null) {
        throw PaymentException('Transaction not found');
      }

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result));
    } on PlatformException catch (e) {
      throw PaymentException(
        e.message ?? 'Failed to fetch transaction',
        code: e.code,
      );
    }
  }

  /// Get transaction history
  Future<TransactionHistory> getTransactionHistory(
    TransactionQuery query,
  ) async {
    _ensureInitialized();

    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getTransactionHistory',
        query.toJson(),
      );

      if (result == null) {
        return const TransactionHistory(
          transactions: [],
          total: 0,
          hasMore: false,
        );
      }

      return TransactionHistory.fromJson(
        Map<String, dynamic>.from(result),
      );
    } on PlatformException catch (e) {
      throw PaymentException(
        e.message ?? 'Failed to fetch history',
        code: e.code,
      );
    }
  }

  /// Refund a transaction
  Future<PaymentResponse> refundTransaction(
    String transactionId, {
    double? amount,
  }) async {
    _ensureInitialized();

    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'refundTransaction',
        {
          'transactionId': transactionId,
          if (amount != null) 'amount': amount,
        },
      );

      if (result == null) {
        throw PaymentException('Refund failed');
      }

      return PaymentResponse.fromJson(Map<String, dynamic>.from(result));
    } on PlatformException catch (e) {
      throw PaymentException(
        e.message ?? 'Refund failed',
        code: e.code,
      );
    }
  }

  /// Poll for transaction status updates
  Stream<PaymentResponse> pollTransactionStatus(
    String transactionId, {
    Duration interval = const Duration(seconds: 5),
    Duration timeout = const Duration(minutes: 5),
  }) async* {
    _ensureInitialized();

    final stopwatch = Stopwatch()..start();

    while (stopwatch.elapsed < timeout) {
      try {
        final transaction = await getTransaction(transactionId);
        yield transaction;

        if (transaction.status != PaymentStatus.pending) {
          break;
        }

        await Future.delayed(interval);
      } catch (e) {
        // Continue polling on error
        await Future.delayed(interval);
      }
    }
  }

  /// Add event listener
  void addEventListener(PaymentEventCallback callback) {
    _eventCallbacks.add(callback);
  }

  /// Remove event listener
  void removeEventListener(PaymentEventCallback callback) {
    _eventCallbacks.remove(callback);
  }

  void _ensureInitialized() {
    if (_config == null) {
      throw PaymentException(
        'SDK not initialized. Call initialize() first.',
        code: 'NOT_INITIALIZED',
      );
    }
  }

  void _setupEventListener() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onPaymentEvent') {
        final args = Map<String, dynamic>.from(call.arguments as Map);
        final event = PaymentEvent(
          type: args['type'] as String,
          data: PaymentResponse.fromJson(
            Map<String, dynamic>.from(args['data'] as Map),
          ),
        );
        _emitEvent(event);
      }
    });
  }

  void _emitEvent(PaymentEvent event) {
    _eventController.add(event);
    for (final callback in _eventCallbacks) {
      callback(event);
    }
  }

  // HTTP API Methods (fallback when native module is not available)

  Future<PaymentResponse> _initiatePaymentHttp(PaymentRequest request) async {
    _ensureInitialized();

    final url = Uri.parse('${_config!.baseUrlEffective}/v1/payments');
    final response = await http.post(
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${_config!.apiKey}',
      },
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      return PaymentResponse.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    } else {
      throw PaymentException(
        'Payment failed: ${response.statusCode}',
        code: 'HTTP_${response.statusCode}',
      );
    }
  }
}

/// Singleton instance
final paymentService = PaymentService();
