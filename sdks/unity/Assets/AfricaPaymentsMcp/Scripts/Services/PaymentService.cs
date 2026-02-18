using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using AfricaPaymentsMcp.Models;

namespace AfricaPaymentsMcp.Services
{
    /// <summary>
    /// Callback delegate for payment responses
    /// </summary>
    public delegate void PaymentCallback(PaymentResponse response, string error);

    /// <summary>
    /// Callback delegate for transaction history
    /// </summary>
    public delegate void TransactionHistoryCallback(TransactionHistory history, string error);

    /// <summary>
    /// Main service for handling payments
    /// </summary>
    public class PaymentService : MonoBehaviour
    {
        private static PaymentService _instance;
        public static PaymentService Instance
        {
            get
            {
                if (_instance == null)
                {
                    var go = new GameObject("AfricaPaymentsService");
                    _instance = go.AddComponent<PaymentService>();
                    DontDestroyOnLoad(go);
                }
                return _instance;
            }
        }

        [SerializeField] private PaymentConfig config;
        
        private readonly Dictionary<string, PaymentResponse> _pendingTransactions = new();
        private readonly List<Coroutine> _activePolls = new();

        public PaymentConfig Config 
        { 
            get => config; 
            set => config = value; 
        }

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }
            _instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void OnDestroy()
        {
            StopAllPolls();
        }

        /// <summary>
        /// Initialize the service with configuration
        /// </summary>
        public void Initialize(PaymentConfig configuration)
        {
            config = configuration;
            
            if (config.DebugLogging)
                Debug.Log($"[AfricaPayments] Initialized with region: {config.Region}");
        }

        /// <summary>
        /// Initiate a new payment
        /// </summary>
        public void InitiatePayment(PaymentRequest request, PaymentCallback callback)
        {
            if (config == null || !config.IsValid)
            {
                callback?.Invoke(null, "SDK not properly configured. Please set API key.");
                return;
            }

            if (!request.IsValid)
            {
                callback?.Invoke(null, "Invalid payment request. Please check all required fields.");
                return;
            }

            StartCoroutine(InitiatePaymentCoroutine(request, callback));
        }

        private IEnumerator InitiatePaymentCoroutine(PaymentRequest request, PaymentCallback callback)
        {
            var url = $"{config.EffectiveBaseUrl}/v1/payments";
            var jsonBody = request.ToJson();

            if (config.DebugLogging)
                Debug.Log($"[AfricaPayments] POST {url}\n{jsonBody}");

            using var www = new UnityWebRequest(url, "POST");
            var bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonBody);
            
            www.uploadHandler = new UploadHandlerRaw(bodyRaw);
            www.downloadHandler = new DownloadHandlerBuffer();
            www.SetRequestHeader("Content-Type", "application/json");
            www.SetRequestHeader("Authorization", $"Bearer {config.ApiKey}");
            www.SetRequestHeader("X-Region", config.RegionCode);
            www.timeout = config.TimeoutSeconds;

            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                var error = $"Payment failed: {www.error}";
                if (config.DebugLogging)
                    Debug.LogError($"[AfricaPayments] {error}");
                callback?.Invoke(null, error);
            }
            else
            {
                var response = PaymentResponse.FromJson(www.downloadHandler.text);
                
                if (config.DebugLogging)
                    Debug.Log($"[AfricaPayments] Response: {www.downloadHandler.text}");

                if (response != null && response.IsPending)
                {
                    _pendingTransactions[response.TransactionId] = response;
                }

                callback?.Invoke(response, null);
            }
        }

        /// <summary>
        /// Get transaction details
        /// </summary>
        public void GetTransaction(string transactionId, PaymentCallback callback)
        {
            StartCoroutine(GetTransactionCoroutine(transactionId, callback));
        }

        private IEnumerator GetTransactionCoroutine(string transactionId, PaymentCallback callback)
        {
            var url = $"{config.EffectiveBaseUrl}/v1/payments/{transactionId}";

            using var www = UnityWebRequest.Get(url);
            www.SetRequestHeader("Authorization", $"Bearer {config.ApiKey}");
            www.SetRequestHeader("X-Region", config.RegionCode);
            www.timeout = config.TimeoutSeconds;

            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                callback?.Invoke(null, www.error);
            }
            else
            {
                var response = PaymentResponse.FromJson(www.downloadHandler.text);
                callback?.Invoke(response, null);
            }
        }

        /// <summary>
        /// Get transaction history
        /// </summary>
        public void GetTransactionHistory(int limit, int offset, TransactionHistoryCallback callback)
        {
            StartCoroutine(GetTransactionHistoryCoroutine(limit, offset, callback));
        }

        private IEnumerator GetTransactionHistoryCoroutine(int limit, int offset, TransactionHistoryCallback callback)
        {
            var url = $"{config.EffectiveBaseUrl}/v1/payments?limit={limit}&offset={offset}";

            using var www = UnityWebRequest.Get(url);
            www.SetRequestHeader("Authorization", $"Bearer {config.ApiKey}");
            www.SetRequestHeader("X-Region", config.RegionCode);
            www.timeout = config.TimeoutSeconds;

            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                callback?.Invoke(null, www.error);
            }
            else
            {
                // Parse history response
                var history = new TransactionHistory
                {
                    transactions = System.Array.Empty<PaymentResponse>(),
                    total = 0,
                    hasMore = false
                };
                callback?.Invoke(history, null);
            }
        }

        /// <summary>
        /// Poll for transaction status updates
        /// </summary>
        public void PollTransactionStatus(string transactionId, float interval, float timeout, PaymentCallback onUpdate)
        {
            var poll = StartCoroutine(PollTransactionCoroutine(transactionId, interval, timeout, onUpdate));
            _activePolls.Add(poll);
        }

        private IEnumerator PollTransactionCoroutine(string transactionId, float interval, float timeout, PaymentCallback onUpdate)
        {
            var startTime = Time.time;
            
            while (Time.time - startTime < timeout)
            {
                PaymentResponse response = null;
                string error = null;
                
                yield return StartCoroutine(GetTransactionCoroutine(transactionId, (res, err) =>
                {
                    response = res;
                    error = err;
                }));

                if (error == null && response != null)
                {
                    onUpdate?.Invoke(response, null);

                    if (!response.IsPending)
                    {
                        _pendingTransactions.Remove(transactionId);
                        yield break;
                    }
                }

                yield return new WaitForSeconds(interval);
            }

            onUpdate?.Invoke(null, "Polling timed out");
        }

        /// <summary>
        /// Stop all active polls
        /// </summary>
        public void StopAllPolls()
        {
            foreach (var poll in _activePolls)
            {
                if (poll != null)
                    StopCoroutine(poll);
            }
            _activePolls.Clear();
            _pendingTransactions.Clear();
        }

        /// <summary>
        /// Verify if a payment was successful
        /// </summary>
        public void VerifyPayment(string transactionId, Action<bool> callback)
        {
            StartCoroutine(VerifyPaymentCoroutine(transactionId, callback));
        }

        private IEnumerator VerifyPaymentCoroutine(string transactionId, Action<bool> callback)
        {
            PaymentResponse response = null;
            
            yield return StartCoroutine(GetTransactionCoroutine(transactionId, (res, err) =>
            {
                response = res;
            }));

            callback?.Invoke(response?.IsSuccess ?? false);
        }
    }
}
