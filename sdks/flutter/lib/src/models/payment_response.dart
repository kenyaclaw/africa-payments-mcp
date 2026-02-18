import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'payment_response.g.dart';

/// Payment status
enum PaymentStatus {
  @JsonValue('pending')
  pending,
  @JsonValue('success')
  success,
  @JsonValue('failed')
  failed,
  @JsonValue('cancelled')
  cancelled,
}

/// Response from a payment operation
@JsonSerializable()
class PaymentResponse extends Equatable {
  /// Unique transaction ID
  final String transactionId;

  /// Current status
  final PaymentStatus status;

  /// Reference provided in the request
  final String reference;

  /// Payment amount
  final double amount;

  /// Currency code
  final String currency;

  /// Phone number used
  final String phoneNumber;

  /// Creation timestamp
  final DateTime createdAt;

  /// Last update timestamp
  final DateTime updatedAt;

  /// Optional receipt URL
  final String? receiptUrl;

  /// Failure reason (if status is failed)
  final String? failureReason;

  const PaymentResponse({
    required this.transactionId,
    required this.status,
    required this.reference,
    required this.amount,
    required this.currency,
    required this.phoneNumber,
    required this.createdAt,
    required this.updatedAt,
    this.receiptUrl,
    this.failureReason,
  });

  factory PaymentResponse.fromJson(Map<String, dynamic> json) =>
      _$PaymentResponseFromJson(json);

  Map<String, dynamic> toJson() => _$PaymentResponseToJson(this);

  /// Check if payment was successful
  bool get isSuccess => status == PaymentStatus.success;

  /// Check if payment is pending
  bool get isPending => status == PaymentStatus.pending;

  /// Check if payment failed
  bool get isFailed => status == PaymentStatus.failed;

  @override
  List<Object?> get props => [
        transactionId,
        status,
        reference,
        amount,
        currency,
        phoneNumber,
        createdAt,
        updatedAt,
        receiptUrl,
        failureReason,
      ];
}

/// Transaction history response
@JsonSerializable()
class TransactionHistory extends Equatable {
  /// List of transactions
  final List<PaymentResponse> transactions;

  /// Total count
  final int total;

  /// Whether there are more results
  final bool hasMore;

  const TransactionHistory({
    required this.transactions,
    required this.total,
    required this.hasMore,
  });

  factory TransactionHistory.fromJson(Map<String, dynamic> json) =>
      _$TransactionHistoryFromJson(json);

  Map<String, dynamic> toJson() => _$TransactionHistoryToJson(this);

  @override
  List<Object?> get props => [transactions, total, hasMore];
}
