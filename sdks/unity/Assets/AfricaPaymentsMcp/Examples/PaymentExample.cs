using UnityEngine;
using UnityEngine.UI;
using TMPro;
using AfricaPaymentsMcp.Models;
using AfricaPaymentsMcp.Services;
using AfricaPaymentsMcp.UI;

namespace AfricaPaymentsMcp.Examples
{
    /// <summary>
    /// Example script demonstrating Africa Payments SDK usage
    /// </summary>
    public class PaymentExample : MonoBehaviour
    {
        [Header("Configuration")]
        [SerializeField] private PaymentConfig config;

        [Header("UI References")]
        [SerializeField] private TextMeshProUGUI statusText;
        [SerializeField] private TextMeshProUGUI transactionText;
        [SerializeField] private Button payButton;
        [SerializeField] private Button historyButton;
        [SerializeField] private GameObject loadingPanel;

        private void Start()
        {
            // Initialize the payment service
            PaymentService.Instance.Initialize(config);

            // Setup button listeners
            if (payButton != null)
                payButton.onClick.AddListener(OnPayClick);
            
            if (historyButton != null)
                historyButton.onClick.AddListener(OnHistoryClick);

            UpdateStatus("Ready");
        }

        /// <summary>
        /// Example 1: Direct payment initiation
        /// </summary>
        private void OnPayClick()
        {
            var request = new PaymentRequest
            {
                Amount = 1000,
                Currency = "KES",
                PhoneNumber = "254712345678",
                Reference = $"DEMO-{System.DateTime.Now.Ticks}",
                Description = "Demo payment"
            };

            SetLoading(true);
            UpdateStatus("Initiating payment...");

            PaymentService.Instance.InitiatePayment(request, (response, error) =>
            {
                SetLoading(false);

                if (!string.IsNullOrEmpty(error))
                {
                    UpdateStatus($"Error: {error}");
                    return;
                }

                UpdateStatus($"Status: {response.Status}");
                UpdateTransaction($"TX: {response.TransactionId}\nRef: {response.Reference}");

                if (response.IsPending)
                {
                    // Start polling for status
                    PollForStatus(response.TransactionId);
                }
            });
        }

        /// <summary>
        /// Example 2: Poll for transaction status
        /// </summary>
        private void PollForStatus(string transactionId)
        {
            UpdateStatus("Polling for status...");

            PaymentService.Instance.PollTransactionStatus(
                transactionId,
                interval: 3f,
                timeout: 60f,
                onUpdate: (response, error) =>
                {
                    if (response != null)
                    {
                        UpdateStatus($"Status: {response.Status}");

                        if (!response.IsPending)
                        {
                            if (response.IsSuccess)
                            {
                                UpdateStatus("Payment successful! ✅");
                                UpdateTransaction($"Receipt: {response.ReceiptUrl}");
                            }
                            else
                            {
                                UpdateStatus($"Payment failed: {response.FailureReason}");
                            }
                        }
                    }
                }
            );
        }

        /// <summary>
        /// Example 3: Show payment modal
        /// </summary>
        public void ShowPaymentModal()
        {
            var request = new PaymentRequest
            {
                Amount = 2500,
                Currency = "KES",
                Reference = $"MODAL-{System.DateTime.Now.Ticks}",
                Description = "Modal payment demo"
            };

            PaymentModal.Show(config, request, (response, error) =>
            {
                if (response?.IsSuccess == true)
                {
                    UpdateStatus("Modal payment successful! ✅");
                    UpdateTransaction($"TX: {response.TransactionId}");
                }
                else
                {
                    UpdateStatus($"Modal payment failed: {error}");
                }
            });
        }

        /// <summary>
        /// Example 4: Get transaction history
        /// </summary>
        private void OnHistoryClick()
        {
            SetLoading(true);
            UpdateStatus("Fetching history...");

            PaymentService.Instance.GetTransactionHistory(10, 0, (history, error) =>
            {
                SetLoading(false);

                if (!string.IsNullOrEmpty(error))
                {
                    UpdateStatus($"Error: {error}");
                    return;
                }

                UpdateStatus($"Found {history.total} transactions");
                
                if (history.transactions.Length > 0)
                {
                    var tx = history.transactions[0];
                    UpdateTransaction($"Latest: {tx.Reference}\n{tx.Currency} {tx.Amount}\nStatus: {tx.Status}");
                }
            });
        }

        /// <summary>
        /// Example 5: Verify a transaction
        /// </summary>
        public void VerifyTransaction(string transactionId)
        {
            PaymentService.Instance.VerifyPayment(transactionId, isSuccess =>
            {
                if (isSuccess)
                {
                    Debug.Log("Transaction is valid and successful!");
                }
                else
                {
                    Debug.Log("Transaction not found or not successful");
                }
            });
        }

        private void UpdateStatus(string message)
        {
            if (statusText != null)
                statusText.text = message;
            Debug.Log($"[PaymentExample] {message}");
        }

        private void UpdateTransaction(string message)
        {
            if (transactionText != null)
                transactionText.text = message;
        }

        private void SetLoading(bool loading)
        {
            if (loadingPanel != null)
                loadingPanel.SetActive(loading);
            
            if (payButton != null)
                payButton.interactable = !loading;
            
            if (historyButton != null)
                historyButton.interactable = !loading;
        }

        private void OnDestroy()
        {
            if (payButton != null)
                payButton.onClick.RemoveListener(OnPayClick);
            
            if (historyButton != null)
                historyButton.onClick.RemoveListener(OnHistoryClick);
        }
    }
}
