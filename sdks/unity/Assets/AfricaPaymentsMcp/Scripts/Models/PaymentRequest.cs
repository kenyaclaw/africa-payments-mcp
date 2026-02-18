using System;
using System.Collections.Generic;
using UnityEngine;

namespace AfricaPaymentsMcp.Models
{
    /// <summary>
    /// Request to initiate a payment
    /// </summary>
    [Serializable]
    public class PaymentRequest
    {
        [Tooltip("Payment amount")]
        [SerializeField] private double amount;
        
        [Tooltip("Currency code (e.g., KES, NGN)")]
        [SerializeField] private string currency = "KES";
        
        [Tooltip("Customer phone number")]
        [SerializeField] private string phoneNumber;
        
        [Tooltip("Unique order reference")]
        [SerializeField] private string reference;
        
        [Tooltip("Optional payment description")]
        [SerializeField] private string description;
        
        [Tooltip("Optional callback URL for webhooks")]
        [SerializeField] private string callbackUrl;
        
        [Tooltip("Optional metadata")]
        [SerializeField] private List<MetadataItem> metadata;

        public double Amount 
        { 
            get => amount; 
            set => amount = value; 
        }
        
        public string Currency 
        { 
            get => currency; 
            set => currency = value; 
        }
        
        public string PhoneNumber 
        { 
            get => phoneNumber; 
            set => phoneNumber = value; 
        }
        
        public string Reference 
        { 
            get => reference; 
            set => reference = value; 
        }
        
        public string Description 
        { 
            get => description; 
            set => description = value; 
        }
        
        public string CallbackUrl 
        { 
            get => callbackUrl; 
            set => callbackUrl = value; 
        }
        
        public List<MetadataItem> Metadata 
        { 
            get => metadata; 
            set => metadata = value; 
        }

        /// <summary>
        /// Gets a clean phone number (digits only)
        /// </summary>
        public string CleanPhoneNumber => System.Text.RegularExpressions.Regex.Replace(phoneNumber ?? "", "\\D", "");

        /// <summary>
        /// Validates the request
        /// </summary>
        public bool IsValid => amount > 0 && 
                              !string.IsNullOrEmpty(currency) && 
                              !string.IsNullOrEmpty(phoneNumber) && 
                              !string.IsNullOrEmpty(reference);

        /// <summary>
        /// Converts to JSON for API
        /// </summary>
        public string ToJson()
        {
            var dict = new System.Collections.Generic.Dictionary<string, object>
            {
                ["amount"] = amount,
                ["currency"] = currency,
                ["phoneNumber"] = CleanPhoneNumber,
                ["reference"] = reference
            };

            if (!string.IsNullOrEmpty(description))
                dict["description"] = description;
            
            if (!string.IsNullOrEmpty(callbackUrl))
                dict["callbackUrl"] = callbackUrl;

            return MiniJSON.Json.Serialize(dict);
        }
    }

    /// <summary>
    /// Metadata item for payment requests
    /// </summary>
    [Serializable]
    public class MetadataItem
    {
        public string key;
        public string value;
    }
}
