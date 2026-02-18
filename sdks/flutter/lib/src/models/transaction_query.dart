import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';
import 'payment_response.dart';

part 'transaction_query.g.dart';

/// Query parameters for transaction history
@JsonSerializable()
class TransactionQuery extends Equatable {
  /// Filter by transaction ID
  final String? transactionId;

  /// Filter by reference
  final String? reference;

  /// Filter by start date
  final DateTime? startDate;

  /// Filter by end date
  final DateTime? endDate;

  /// Filter by status
  final PaymentStatus? status;

  /// Number of results to return
  @JsonKey(defaultValue: 20)
  final int limit;

  /// Offset for pagination
  @JsonKey(defaultValue: 0)
  final int offset;

  const TransactionQuery({
    this.transactionId,
    this.reference,
    this.startDate,
    this.endDate,
    this.status,
    this.limit = 20,
    this.offset = 0,
  });

  factory TransactionQuery.fromJson(Map<String, dynamic> json) =>
      _$TransactionQueryFromJson(json);

  Map<String, dynamic> toJson() => _$TransactionQueryToJson(this);

  TransactionQuery copyWith({
    String? transactionId,
    String? reference,
    DateTime? startDate,
    DateTime? endDate,
    PaymentStatus? status,
    int? limit,
    int? offset,
  }) {
    return TransactionQuery(
      transactionId: transactionId ?? this.transactionId,
      reference: reference ?? this.reference,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      status: status ?? this.status,
      limit: limit ?? this.limit,
      offset: offset ?? this.offset,
    );
  }

  @override
  List<Object?> get props => [
        transactionId,
        reference,
        startDate,
        endDate,
        status,
        limit,
        offset,
      ];
}
