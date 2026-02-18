using System;
using UnityEngine;

namespace AfricaPaymentsMcp.Models
{
    /// <summary>
    /// Supported regions for payments
    /// </summary>
    public enum PaymentRegion
    {
        Kenya,
        Nigeria,
        Ghana,
        SouthAfrica,
        Tanzania,
        Uganda
    }

    /// <summary>
    /// API environment types
    /// </summary>
    public enum PaymentEnvironment
    {
        Sandbox,
        Production
    }

    /// <summary>
    /// Payment provider types
    /// </summary>
    public enum PaymentProvider
    {
        Mpesa,
        Mtn,
        Vodafone,
        Airtel,
        Bank,
        Card
    }

    /// <summary>
    /// Payment transaction status
    /// </summary>
    public enum PaymentStatus
    {
        Pending,
        Success,
        Failed,
        Cancelled
    }

    /// <summary>
    /// Configuration for the Africa Payments SDK
    /// </summary>
    [Serializable]
    public class PaymentConfig
    {
        [Tooltip("Your Africa Payments API key")]
        [SerializeField] private string apiKey;
        
        [Tooltip("API environment")]
        [SerializeField] private PaymentEnvironment environment = PaymentEnvironment.Sandbox;
        
        [Tooltip("Target region for payments")]
        [SerializeField] private PaymentRegion region = PaymentRegion.Kenya;
        
        [Tooltip("Optional custom API base URL")]
        [SerializeField] private string baseUrl;
        
        [Tooltip("Request timeout in seconds")]
        [SerializeField] private int timeoutSeconds = 30;
        
        [Tooltip("Enable debug logging")]
        [SerializeField] private bool debugLogging = false;

        public string ApiKey 
        { 
            get => apiKey; 
            set => apiKey = value; 
        }
        
        public PaymentEnvironment Environment 
        { 
            get => environment; 
            set => environment = value; 
        }
        
        public PaymentRegion Region 
        { 
            get => region; 
            set => region = value; 
        }
        
        public string BaseUrl 
        { 
            get => baseUrl; 
            set => baseUrl = value; 
        }
        
        public int TimeoutSeconds 
        { 
            get => timeoutSeconds; 
            set => timeoutSeconds = value; 
        }
        
        public bool DebugLogging 
        { 
            get => debugLogging; 
            set => debugLogging = value; 
        }

        /// <summary>
        /// Gets the effective base URL
        /// </summary>
        public string EffectiveBaseUrl
        {
            get
            {
                if (!string.IsNullOrEmpty(baseUrl))
                    return baseUrl;

                return environment == PaymentEnvironment.Production
                    ? "https://api.africapayments.com"
                    : "https://api.sandbox.africapayments.com";
            }
        }

        /// <summary>
        /// Gets the region code
        /// </summary>
        public string RegionCode
        {
            get
            {
                return region switch
                {
                    PaymentRegion.Kenya => "ke",
                    PaymentRegion.Nigeria => "ng",
                    PaymentRegion.Ghana => "gh",
                    PaymentRegion.SouthAfrica => "za",
                    PaymentRegion.Tanzania => "tz",
                    PaymentRegion.Uganda => "ug",
                    _ => "ke"
                };
            }
        }

        /// <summary>
        /// Validates the configuration
        /// </summary>
        public bool IsValid => !string.IsNullOrEmpty(apiKey);
    }
}
