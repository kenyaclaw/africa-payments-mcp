import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'payment_request.g.dart';

/// Request to initiate a payment
@JsonSerializable()
class PaymentRequest extends Equatable {
  /// Payment amount
  final double amount;

  /// Currency code (e.g., KES, NGN, GHS)
  final String currency;

  /// Customer phone number
  final String phoneNumber;

  /// Unique reference for this payment
  final String reference;

  /// Optional description
  final String? description;

  /// Optional callback URL for webhooks
  final String? callbackUrl;

  /// Optional metadata
  final Map<String, dynamic>? metadata;

  const PaymentRequest({
    required this.amount,
    required this.currency,
    required this.phoneNumber,
    required this.reference,
    this.description,
    this.callbackUrl,
    this.metadata,
  });

  factory PaymentRequest.fromJson(Map<String, dynamic> json) =>
      _$PaymentRequestFromJson(json);

  Map<String, dynamic> toJson() => _$PaymentRequestToJson(this);

  PaymentRequest copyWith({
    double? amount,
    String? currency,
    String? phoneNumber,
    String? reference,
    String? description,
    String? callbackUrl,
    Map<String, dynamic>? metadata,
  }) {
    return PaymentRequest(
      amount: amount ?? this.amount,
      currency: currency ?? this.currency,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      reference: reference ?? this.reference,
      description: description ?? this.description,
      callbackUrl: callbackUrl ?? this.callbackUrl,
      metadata: metadata ?? this.metadata,
    );
  }

  @override
  List<Object?> get props => [
        amount,
        currency,
        phoneNumber,
        reference,
        description,
        callbackUrl,
        metadata,
      ];

  /// Validate the request
  bool get isValid {
    return amount > 0 &&
        currency.isNotEmpty &&
        phoneNumber.isNotEmpty &&
        reference.isNotEmpty;
  }

  /// Get cleaned phone number (digits only)
  String get cleanPhoneNumber {
    return phoneNumber.replaceAll(RegExp(r'\D'), '');
  }
}
