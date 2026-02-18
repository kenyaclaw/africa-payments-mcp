using UnityEngine;
using UnityEngine.UI;
using TMPro;
using AfricaPaymentsMcp.Models;
using AfricaPaymentsMcp.Services;

namespace AfricaPaymentsMcp.UI
{
    /// <summary>
    /// Modal dialog for collecting payment information
    /// </summary>
    public class PaymentModal : MonoBehaviour
    {
        [Header("UI References")]
        [SerializeField] private GameObject modalPanel;
        [SerializeField] private TextMeshProUGUI titleText;
        [SerializeField] private TextMeshProUGUI amountText;
        [SerializeField] private TextMeshProUGUI descriptionText;
        [SerializeField] private TMP_InputField phoneInput;
        [SerializeField] private Button payButton;
        [SerializeField] private Button closeButton;
        [SerializeField] private GameObject loadingPanel;
        [SerializeField] private GameObject successPanel;
        [SerializeField] private GameObject errorPanel;
        [SerializeField] private TextMeshProUGUI errorText;
        [SerializeField] private TextMeshProUGUI successDetailsText;

        [Header("Animation")]
        [SerializeField] private Animator animator;
        [SerializeField] private string showTrigger = "Show";
        [SerializeField] private string hideTrigger = "Hide";

        private static PaymentModal _instance;
        private PaymentConfig _config;
        private PaymentRequest _request;
        private System.Action<PaymentResponse, string> _callback;

        private void Awake()
        {
            if (_instance != null)
            {
                Destroy(gameObject);
                return;
            }
            _instance = this;

            // Setup button listeners
            if (payButton != null)
                payButton.onClick.AddListener(OnPayClick);
            
            if (closeButton != null)
                closeButton.onClick.AddListener(Hide);

            // Hide initially
            if (modalPanel != null)
                modalPanel.SetActive(false);
        }

        private void OnDestroy()
        {
            if (_instance == this)
                _instance = null;

            if (payButton != null)
                payButton.onClick.RemoveListener(OnPayClick);
            
            if (closeButton != null)
                closeButton.onClick.RemoveListener(OnPayClick);
        }

        /// <summary>
        /// Show the payment modal
        /// </summary>
        public static void Show(PaymentConfig config, PaymentRequest request, System.Action<PaymentResponse, string> callback)
        {
            if (_instance == null)
            {
                // Load from Resources if not in scene
                var prefab = Resources.Load<GameObject>("AfricaPayments/PaymentModal");
                if (prefab != null)
                {
                    var go = Instantiate(prefab);
                    _instance = go.GetComponent<PaymentModal>();
                }
            }

            if (_instance != null)
            {
                _instance.Setup(config, request, callback);
                _instance.Display();
            }
            else
            {
                Debug.LogError("[PaymentModal] No PaymentModal instance found!");
                callback?.Invoke(null, "Payment modal not available");
            }
        }

        private void Setup(PaymentConfig config, PaymentRequest request, System.Action<PaymentResponse, string> callback)
        {
            _config = config;
            _request = request;
            _callback = callback;

            // Update UI
            if (titleText != null)
                titleText.text = "Complete Payment";

            if (amountText != null)
                amountText.text = $"{request.Currency} {request.Amount:N2}";

            if (descriptionText != null)
            {
                descriptionText.text = string.IsNullOrEmpty(request.Description) 
                    ? $"Reference: {request.Reference}"
                    : request.Description;
            }

            // Reset state
            if (phoneInput != null)
            {
                phoneInput.text = "";
                phoneInput.interactable = true;
            }

            SetLoading(false);
            SetSuccess(false);
            SetError(false);
        }

        private void Display()
        {
            if (modalPanel != null)
                modalPanel.SetActive(true);

            if (animator != null)
                animator.SetTrigger(showTrigger);
        }

        public void Hide()
        {
            if (animator != null)
            {
                animator.SetTrigger(hideTrigger);
                Invoke(nameof(DisablePanel), 0.3f);
            }
            else
            {
                DisablePanel();
            }
        }

        private void DisablePanel()
        {
            if (modalPanel != null)
                modalPanel.SetActive(false);
        }

        private void OnPayClick()
        {
            if (phoneInput == null || string.IsNullOrEmpty(phoneInput.text))
            {
                ShowError("Please enter your phone number");
                return;
            }

            _request.PhoneNumber = phoneInput.text;
            
            SetLoading(true);

            // Initialize service if needed
            PaymentService.Instance.Initialize(_config);

            // Initiate payment
            PaymentService.Instance.InitiatePayment(_request, OnPaymentResponse);
        }

        private void OnPaymentResponse(PaymentResponse response, string error)
        {
            SetLoading(false);

            if (!string.IsNullOrEmpty(error))
            {
                ShowError(error);
                _callback?.Invoke(response, error);
                return;
            }

            if (response.IsSuccess)
            {
                SetSuccess(true, response);
                _callback?.Invoke(response, null);
            }
            else if (response.IsPending)
            {
                // Show pending state and start polling
                ShowPendingMessage();
                StartPolling(response.TransactionId);
            }
            else
            {
                ShowError(response.FailureReason ?? "Payment failed");
                _callback?.Invoke(response, response.FailureReason);
            }
        }

        private void StartPolling(string transactionId)
        {
            PaymentService.Instance.PollTransactionStatus(
                transactionId,
                interval: 5f,
                timeout: 300f,
                onUpdate: (response, error) =>
                {
                    if (response != null && !response.IsPending)
                    {
                        if (response.IsSuccess)
                        {
                            SetSuccess(true, response);
                        }
                        else
                        {
                            ShowError(response.FailureReason ?? "Payment failed");
                        }
                        _callback?.Invoke(response, error);
                    }
                }
            );
        }

        private void ShowPendingMessage()
        {
            if (errorText != null)
            {
                errorText.text = "Please check your phone and enter your PIN to complete the payment.";
                errorText.color = Color.blue;
            }
            if (errorPanel != null)
                errorPanel.SetActive(true);
        }

        private void SetLoading(bool loading)
        {
            if (loadingPanel != null)
                loadingPanel.SetActive(loading);

            if (payButton != null)
                payButton.interactable = !loading;

            if (phoneInput != null)
                phoneInput.interactable = !loading;
        }

        private void SetSuccess(bool success, PaymentResponse response = null)
        {
            if (successPanel != null)
                successPanel.SetActive(success);

            if (success && response != null && successDetailsText != null)
            {
                successDetailsText.text = $"Transaction ID: {response.TransactionId}";
            }
        }

        private void SetError(bool show)
        {
            if (errorPanel != null)
                errorPanel.SetActive(show);
        }

        private void ShowError(string message)
        {
            if (errorText != null)
            {
                errorText.text = message;
                errorText.color = Color.red;
            }
            SetError(true);
        }
    }
}
