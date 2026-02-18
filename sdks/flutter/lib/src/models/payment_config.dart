import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'payment_config.g.dart';

/// Supported regions for payments
enum PaymentRegion {
  @JsonValue('ke')
  kenya,
  @JsonValue('ng')
  nigeria,
  @JsonValue('gh')
  ghana,
  @JsonValue('za')
  southAfrica,
  @JsonValue('tz')
  tanzania,
  @JsonValue('ug')
  uganda,
}

/// Environment types
enum PaymentEnvironment {
  @JsonValue('sandbox')
  sandbox,
  @JsonValue('production')
  production,
}

/// Configuration for the Africa Payments SDK
@JsonSerializable()
class PaymentConfig extends Equatable {
  /// API key for authentication
  final String apiKey;

  /// Environment (sandbox/production)
  final PaymentEnvironment environment;

  /// Target region
  final PaymentRegion region;

  /// Optional API base URL override
  final String? baseUrl;

  /// Request timeout in seconds
  @JsonKey(defaultValue: 30)
  final int timeoutSeconds;

  const PaymentConfig({
    required this.apiKey,
    required this.environment,
    required this.region,
    this.baseUrl,
    this.timeoutSeconds = 30,
  });

  factory PaymentConfig.fromJson(Map<String, dynamic> json) =>
      _$PaymentConfigFromJson(json);

  Map<String, dynamic> toJson() => _$PaymentConfigToJson(this);

  PaymentConfig copyWith({
    String? apiKey,
    PaymentEnvironment? environment,
    PaymentRegion? region,
    String? baseUrl,
    int? timeoutSeconds,
  }) {
    return PaymentConfig(
      apiKey: apiKey ?? this.apiKey,
      environment: environment ?? this.environment,
      region: region ?? this.region,
      baseUrl: baseUrl ?? this.baseUrl,
      timeoutSeconds: timeoutSeconds ?? this.timeoutSeconds,
    );
  }

  @override
  List<Object?> get props => [
        apiKey,
        environment,
        region,
        baseUrl,
        timeoutSeconds,
      ];

  /// Get default base URL based on environment
  String getDefaultBaseUrl() {
    switch (environment) {
      case PaymentEnvironment.sandbox:
        return 'https://api.sandbox.africapayments.com';
      case PaymentEnvironment.production:
        return 'https://api.africapayments.com';
    }
  }

  /// Get the effective base URL
  String get baseUrlEffective => baseUrl ?? getDefaultBaseUrl();
}
