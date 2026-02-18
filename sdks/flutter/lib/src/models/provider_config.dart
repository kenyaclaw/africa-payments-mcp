import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'provider_config.g.dart';

/// Payment provider types
enum PaymentProvider {
  @JsonValue('mpesa')
  mpesa,
  @JsonValue('mtn')
  mtn,
  @JsonValue('vodafone')
  vodafone,
  @JsonValue('airtel')
  airtel,
  @JsonValue('bank')
  bank,
  @JsonValue('card')
  card,
}

/// Configuration for a payment provider
@JsonSerializable()
class ProviderConfig extends Equatable {
  /// The payment provider
  final PaymentProvider provider;

  /// Whether this provider is enabled
  final bool enabled;

  /// Provider-specific configuration
  final Map<String, dynamic>? config;

  const ProviderConfig({
    required this.provider,
    this.enabled = true,
    this.config,
  });

  factory ProviderConfig.fromJson(Map<String, dynamic> json) =>
      _$ProviderConfigFromJson(json);

  Map<String, dynamic> toJson() => _$ProviderConfigToJson(this);

  ProviderConfig copyWith({
    PaymentProvider? provider,
    bool? enabled,
    Map<String, dynamic>? config,
  }) {
    return ProviderConfig(
      provider: provider ?? this.provider,
      enabled: enabled ?? this.enabled,
      config: config ?? this.config,
    );
  }

  @override
  List<Object?> get props => [provider, enabled, config];

  /// Get display name for the provider
  String get displayName {
    switch (provider) {
      case PaymentProvider.mpesa:
        return 'M-Pesa';
      case PaymentProvider.mtn:
        return 'MTN Mobile Money';
      case PaymentProvider.vodafone:
        return 'Vodafone Cash';
      case PaymentProvider.airtel:
        return 'Airtel Money';
      case PaymentProvider.bank:
        return 'Bank Transfer';
      case PaymentProvider.card:
        return 'Card Payment';
    }
  }
}
