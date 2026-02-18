import 'package:flutter/foundation.dart';
import '../models/payment_request.dart';
import '../models/payment_response.dart';

/// State for payment operations
@immutable
class PaymentState {
  final bool isLoading;
  final PaymentResponse? response;
  final String? error;
  final bool isInitialized;

  const PaymentState({
    this.isLoading = false,
    this.response,
    this.error,
    this.isInitialized = false,
  });

  PaymentState copyWith({
    bool? isLoading,
    PaymentResponse? response,
    String? error,
    bool? isInitialized,
    bool clearError = false,
    bool clearResponse = false,
  }) {
    return PaymentState(
      isLoading: isLoading ?? this.isLoading,
      response: clearResponse ? null : (response ?? this.response),
      error: clearError ? null : (error ?? this.error),
      isInitialized: isInitialized ?? this.isInitialized,
    );
  }

  bool get hasError => error != null && error!.isNotEmpty;
  bool get hasResponse => response != null;
  bool get isSuccess => hasResponse && response!.isSuccess;
  bool get isPending => hasResponse && response!.isPending;

  @override
  String toString() {
    return 'PaymentState(isLoading: $isLoading, isSuccess: $isSuccess, error: $error)';
  }
}

/// Notifier for payment state management
class PaymentNotifier extends ValueNotifier<PaymentState> {
  PaymentNotifier() : super(const PaymentState());

  void setLoading(bool loading) {
    value = value.copyWith(isLoading: loading);
  }

  void setSuccess(PaymentResponse response) {
    value = value.copyWith(
      isLoading: false,
      response: response,
      clearError: true,
    );
  }

  void setError(String error) {
    value = value.copyWith(
      isLoading: false,
      error: error,
      clearResponse: true,
    );
  }

  void reset() {
    value = const PaymentState(isInitialized: true);
  }

  void initialize() {
    value = value.copyWith(isInitialized: true);
  }
}
