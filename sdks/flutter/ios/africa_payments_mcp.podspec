Pod::Spec.new do |s|
  s.name             = 'africa_payments_mcp'
  s.version          = '1.0.0'
  s.summary          = 'Africa Payments MCP SDK for Flutter'
  s.description      = <<-DESC
Official Africa Payments MCP SDK for Flutter - enabling mobile money payments across Africa.
                       DESC
  s.homepage         = 'https://github.com/africa-payments/africa-payments-mcp-flutter'
  s.license          = { :file => '../LICENSE' }
  s.author           = { 'Africa Payments' => 'dev@africapayments.com' }
  s.source           = { :path => '.' }
  s.source_files = 'Classes/**/*'
  s.public_header_files = 'Classes/**/*.h'
  s.dependency 'Flutter'
  s.platform = :ios, '12.0'

  # Flutter.framework does not contain a i386 slice.
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
  s.swift_version = '5.0'
end
