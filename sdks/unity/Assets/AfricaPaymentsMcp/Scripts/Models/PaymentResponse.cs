using System;
using UnityEngine;

namespace AfricaPaymentsMcp.Models
{
    /// <summary>
    /// Response from a payment operation
    /// </summary>
    [Serializable]
    public class PaymentResponse
    {
        [SerializeField] private string transactionId;
        [SerializeField] private PaymentStatus status;
        [SerializeField] private string reference;
        [SerializeField] private double amount;
        [SerializeField] private string currency;
        [SerializeField] private string phoneNumber;
        [SerializeField] private string createdAt;
        [SerializeField] private string updatedAt;
        [SerializeField] private string receiptUrl;
        [SerializeField] private string failureReason;

        public string TransactionId 
        { 
            get => transactionId; 
            set => transactionId = value; 
        }
        
        public PaymentStatus Status 
        { 
            get => status; 
            set => status = value; 
        }
        
        public string Reference 
        { 
            get => reference; 
            set => reference = value; 
        }
        
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
        
        public string CreatedAt 
        { 
            get => createdAt; 
            set => createdAt = value; 
        }
        
        public string UpdatedAt 
        { 
            get => updatedAt; 
            set => updatedAt = value; 
        }
        
        public string ReceiptUrl 
        { 
            get => receiptUrl; 
            set => receiptUrl = value; 
        }
        
        public string FailureReason 
        { 
            get => failureReason; 
            set => failureReason = value; 
        }

        /// <summary>
        /// Checks if payment was successful
        /// </summary>
        public bool IsSuccess => status == PaymentStatus.Success;

        /// <summary>
        /// Checks if payment is pending
        /// </summary>
        public bool IsPending => status == PaymentStatus.Pending;

        /// <summary>
        /// Checks if payment failed
        /// </summary>
        public bool IsFailed => status == PaymentStatus.Failed;

        /// <summary>
        /// Creates a PaymentResponse from JSON
        /// </summary>
        public static PaymentResponse FromJson(string json)
        {
            var dict = MiniJSON.Json.Deserialize(json) as System.Collections.Generic.Dictionary<string, object>;
            if (dict == null) return null;

            var response = new PaymentResponse
            {
                transactionId = GetString(dict, "transactionId"),
                reference = GetString(dict, "reference"),
                amount = GetDouble(dict, "amount"),
                currency = GetString(dict, "currency"),
                phoneNumber = GetString(dict, "phoneNumber"),
                createdAt = GetString(dict, "createdAt"),
                updatedAt = GetString(dict, "updatedAt"),
                receiptUrl = GetString(dict, "receiptUrl"),
                failureReason = GetString(dict, "failureReason")
            };

            if (dict.TryGetValue("status", out var statusObj) && statusObj is string statusStr)
            {
                response.status = statusStr.ToLower() switch
                {
                    "pending" => PaymentStatus.Pending,
                    "success" => PaymentStatus.Success,
                    "failed" => PaymentStatus.Failed,
                    "cancelled" => PaymentStatus.Cancelled,
                    _ => PaymentStatus.Pending
                };
            }

            return response;
        }

        private static string GetString(System.Collections.Generic.Dictionary<string, object> dict, string key)
        {
            return dict.TryGetValue(key, out var value) ? value?.ToString() : null;
        }

        private static double GetDouble(System.Collections.Generic.Dictionary<string, object> dict, string key)
        {
            if (dict.TryGetValue(key, out var value))
            {
                if (value is double d) return d;
                if (value is float f) return f;
                if (double.TryParse(value?.ToString(), out var result)) return result;
            }
            return 0;
        }
    }

    /// <summary>
    /// Transaction history response
    /// </summary>
    [Serializable]
    public class TransactionHistory
    {
        public PaymentResponse[] transactions;
        public int total;
        public bool hasMore;
    }
}
