/**
 * Natural Language Configuration Parser
 * Parse user intent from natural language to generate config
 */

export interface ParsedConfig {
  providers: string[];
  countries: string[];
  currencies: string[];
  defaults: {
    provider?: string;
    country?: string;
    currency?: string;
  };
  confidence: number;
  explanations: string[];
}

// Provider keywords mapping
const PROVIDER_KEYWORDS: Record<string, string[]> = {
  mpesa: ['mpesa', 'm-pesa', 'safaricom', 'vodacom'],
  paystack: ['paystack', 'pay stack', 'pay-stack'],
  intasend: ['intasend', 'inta send', 'inta-send'],
  mtn_momo: ['mtn', 'momo', 'mtn momo', 'mobile money'],
  airtel_money: ['airtel', 'airtel money', 'airtel-money'],
  flutterwave: ['flutterwave', 'flutter wave', 'rave'],
};

// Country keywords mapping
const COUNTRY_KEYWORDS: Record<string, string[]> = {
  KE: ['kenya', 'nairobi', 'kenyan'],
  NG: ['nigeria', 'lagos', 'abuja', 'nigerian'],
  GH: ['ghana', 'accra', 'ghanaian'],
  UG: ['uganda', 'kampala', 'ugandan'],
  TZ: ['tanzania', 'dar es salaam', 'tanzanian', 'dodoma'],
  ZA: ['south africa', 'johannesburg', 'cape town', 'south african'],
  RW: ['rwanda', 'kigali', 'rwandan'],
  CI: ['ivory coast', 'cote d\'ivoire', 'abidjan'],
  SN: ['senegal', 'dakar'],
  CM: ['cameroon', 'yaounde', 'douala'],
  ET: ['ethiopia', 'addis ababa'],
  ZM: ['zambia', 'lusaka'],
  MW: ['malawi', 'lilongwe'],
  MZ: ['mozambique', 'maputo'],
  BW: ['botswana', 'gaborone'],
};

// Currency mapping
const COUNTRY_CURRENCY: Record<string, string> = {
  KE: 'KES',
  NG: 'NGN',
  GH: 'GHS',
  UG: 'UGX',
  TZ: 'TZS',
  ZA: 'ZAR',
  RW: 'RWF',
  CI: 'XOF',
  SN: 'XOF',
  CM: 'XAF',
  ET: 'ETB',
  ZM: 'ZMW',
  MW: 'MWK',
  MZ: 'MZN',
  BW: 'BWP',
};

// Provider-country compatibility
const PROVIDER_COUNTRIES: Record<string, string[]> = {
  mpesa: ['KE', 'TZ', 'MZ'],
  paystack: ['NG', 'GH', 'ZA', 'KE'],
  intasend: ['KE', 'NG'],
  mtn_momo: ['UG', 'GH', 'CM', 'CI', 'RW', 'ZA', 'SN', 'BJ', 'CG', 'GN'],
  airtel_money: ['KE', 'UG', 'TZ', 'ZM', 'MW', 'RW', 'CG', 'CD', 'GA'],
  flutterwave: ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW', 'CM', 'CI', 'SN'],
};

/**
 * Parse natural language input to extract configuration intent
 */
export function parseNaturalLanguageConfig(input: string): ParsedConfig {
  const lowerInput = input.toLowerCase();
  const explanations: string[] = [];
  
  // Detect providers
  const detectedProviders: string[] = [];
  for (const [provider, keywords] of Object.entries(PROVIDER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        if (!detectedProviders.includes(provider)) {
          detectedProviders.push(provider);
          explanations.push(`Detected provider "${provider}" from keyword "${keyword}"`);
        }
        break;
      }
    }
  }
  
  // Detect countries
  const detectedCountries: string[] = [];
  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        if (!detectedCountries.includes(country)) {
          detectedCountries.push(country);
          explanations.push(`Detected country "${country}" from keyword "${keyword}"`);
        }
        break;
      }
    }
  }
  
  // Map countries to currencies
  const detectedCurrencies = detectedCountries.map(c => COUNTRY_CURRENCY[c]).filter(Boolean);
  
  // Determine defaults based on priority
  const defaults: ParsedConfig['defaults'] = {};
  
  // Set default country (first detected or KE)
  if (detectedCountries.length > 0) {
    defaults.country = detectedCountries[0];
    defaults.currency = COUNTRY_CURRENCY[defaults.country];
  }
  
  // Set default provider - prefer one that supports the default country
  if (detectedProviders.length > 0) {
    // Find a provider that supports the default country
    const suitableProvider = detectedProviders.find(p => {
      const supported = PROVIDER_COUNTRIES[p] || [];
      return defaults.country ? supported.includes(defaults.country) : true;
    });
    defaults.provider = suitableProvider || detectedProviders[0];
  }
  
  // Calculate confidence
  let confidence = 0;
  if (detectedProviders.length > 0) confidence += 0.5;
  if (detectedCountries.length > 0) confidence += 0.3;
  if (detectedProviders.length > 0 && detectedCountries.length > 0) {
    // Check if any provider supports any detected country
    const hasMatch = detectedProviders.some(p => {
      const supported = PROVIDER_COUNTRIES[p] || [];
      return detectedCountries.some(c => supported.includes(c));
    });
    if (hasMatch) confidence += 0.2;
  }
  
  return {
    providers: detectedProviders,
    countries: detectedCountries,
    currencies: [...new Set(detectedCurrencies)],
    defaults,
    confidence: Math.min(confidence, 1),
    explanations,
  };
}

/**
 * Generate configuration object from parsed intent
 */
export function generateConfigFromParsed(parsed: ParsedConfig): any {
  const config: any = {
    providers: {},
    defaults: {
      currency: parsed.defaults.currency || 'KES',
      country: parsed.defaults.country || 'KE',
      provider: parsed.defaults.provider || 'mpesa',
    },
    server: {
      port: 3000,
      logLevel: 'info',
    },
  };
  
  // Generate provider configs
  for (const provider of parsed.providers) {
    config.providers[provider] = generateProviderConfig(provider);
  }
  
  return config;
}

function generateProviderConfig(provider: string): any {
  const baseConfig = {
    enabled: true,
    environment: 'sandbox',
  };
  
  switch (provider) {
    case 'mpesa':
      return {
        ...baseConfig,
        consumerKey: 'your-mpesa-consumer-key',
        consumerSecret: 'your-mpesa-consumer-secret',
        passkey: 'your-mpesa-passkey',
        shortCode: '174379',
        initiatorName: 'testapi',
        initiatorPassword: 'Safaricom999!*!',
        securityCredential: 'your-security-credential',
      };
    case 'paystack':
      return {
        ...baseConfig,
        secretKey: 'sk_test_your_paystack_secret_key',
        publicKey: 'pk_test_your_paystack_public_key',
        webhookSecret: 'whsec_your_webhook_secret',
      };
    case 'intasend':
      return {
        ...baseConfig,
        publishableKey: 'ISPubKey_test_your_publishable_key',
        secretKey: 'ISSecretKey_test_your_secret_key',
      };
    case 'mtn_momo':
      return {
        ...baseConfig,
        apiUser: 'your-momo-api-user',
        apiKey: 'your-momo-api-key',
        subscriptionKey: 'your-momo-subscription-key',
        targetEnvironment: 'sandbox',
      };
    case 'airtel_money':
      return {
        ...baseConfig,
        clientId: 'your-airtel-client-id',
        clientSecret: 'your-airtel-client-secret',
      };
    case 'flutterwave':
      return {
        ...baseConfig,
        publicKey: 'FLWPUBK_TEST-your-public-key',
        secretKey: 'FLWSECK_TEST-your-secret-key',
        encryptionKey: 'your-encryption-key',
      };
    default:
      return baseConfig;
  }
}

/**
 * Format parsed config for display
 */
export function formatParsedConfig(parsed: ParsedConfig): string {
  let output = '\n🎯 Configuration Intent Detected\n';
  output += '═'.repeat(40) + '\n\n';
  
  output += '📱 Providers:\n';
  if (parsed.providers.length > 0) {
    for (const provider of parsed.providers) {
      output += `   ✓ ${provider}\n`;
    }
  } else {
    output += '   ⚠️ No providers detected\n';
  }
  
  output += '\n🌍 Countries:\n';
  if (parsed.countries.length > 0) {
    for (const country of parsed.countries) {
      output += `   ✓ ${country} (${COUNTRY_CURRENCY[country]})\n`;
    }
  } else {
    output += '   ⚠️ No countries detected\n';
  }
  
  output += '\n⚙️ Suggested Defaults:\n';
  output += `   Provider: ${parsed.defaults.provider || 'Not detected'}\n`;
  output += `   Country: ${parsed.defaults.country || 'Not detected'}\n`;
  output += `   Currency: ${parsed.defaults.currency || 'Not detected'}\n`;
  
  output += `\n📊 Confidence: ${Math.round(parsed.confidence * 100)}%\n`;
  
  if (parsed.explanations.length > 0) {
    output += '\n💡 Detection Details:\n';
    for (const exp of parsed.explanations) {
      output += `   • ${exp}\n`;
    }
  }
  
  return output;
}
