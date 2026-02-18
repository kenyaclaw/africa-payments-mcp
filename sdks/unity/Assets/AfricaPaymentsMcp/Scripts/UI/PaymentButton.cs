using UnityEngine;
using UnityEngine.UI;
using TMPro;
using AfricaPaymentsMcp.Models;
using AfricaPaymentsMcp.Services;

namespace AfricaPaymentsMcp.UI
{
    /// <summary>
    /// UI button for initiating payments
    /// </summary>
    [RequireComponent(typeof(Button))]
    public class PaymentButton : MonoBehaviour
    {
        [Header("Configuration")]
        [SerializeField] private PaymentConfig config;
        
        [Header("Payment Details")]
        [SerializeField] private double amount = 1000;
        [SerializeField] private string currency = "KES";
        [SerializeField] private string reference;
        [SerializeField] private string description;
        
        [Header("UI")]
        [SerializeField] private TextMeshProUGUI buttonText;
        [SerializeField] private string customButtonText;
        [SerializeField] private GameObject loadingIndicator;
        
        [Header("Events")]
        public PaymentResponseEvent onPaymentSuccess;
        public PaymentResponseEvent onPaymentFailed;
        public PaymentResponseEvent onPaymentPending;

        private Button _button;
        private bool _isProcessing;

        private void Awake()
        {
            _button = GetComponent<Button>();
            _button.onClick.AddListener(OnButtonClick);
            
            UpdateButtonText();
            
            if (loadingIndicator != null)
                loadingIndicator.SetActive(false);
        }

        private void OnDestroy()
        {
            if (_button != null)
                _button.onClick.RemoveListener(OnButtonClick);
        }

        private void UpdateButtonText()
        {
            if (buttonText == null) return;

            var text = string.IsNullOrEmpty(customButtonText) 
                ? $"Pay {currency} {amount:N0}" 
                : customButtonText;
                
            buttonText.text = text;
        }

        private void OnButtonClick()
        {
            if (_isProcessing) return;
            
            if (string.IsNullOrEmpty(reference))
            {
                reference = $"ORDER-{System.DateTime.Now:yyyyMMddHHmmss}";
            }

            var request = new PaymentRequest
            {
                Amount = amount,
                Currency = currency,
                PhoneNumber = "", // Will be entered in modal
                Reference = reference,
                Description = description
            };

            // Show payment modal instead of direct payment
            PaymentModal.Show(config, request, OnPaymentResponse);
        }

        private void OnPaymentResponse(PaymentResponse response, string error)
        {
            _isProcessing = false;
            SetLoading(false);

            if (!string.IsNullOrEmpty(error))
            {
                Debug.LogError($"[PaymentButton] Error: {error}");
                onPaymentFailed?.Invoke(response);
                return;
            }

            if (response.IsSuccess)
            {
                onPaymentSuccess?.Invoke(response);
            }
            else if (response.IsPending)
            {
                onPaymentPending?.Invoke(response);
            }
            else
            {
                onPaymentFailed?.Invoke(response);
            }
        }

        private void SetLoading(bool loading)
        {
            _isProcessing = loading;
            _button.interactable = !loading;
            
            if (loadingIndicator != null)
                loadingIndicator.SetActive(loading);
                
            if (buttonText != null)
                buttonText.gameObject.SetActive(!loading);
        }

        /// <summary>
        /// Set payment configuration
        /// </summary>
        public void SetConfig(PaymentConfig newConfig)
        {
            config = newConfig;
        }

        /// <summary>
        /// Set payment amount
        /// </summary>
        public void SetAmount(double newAmount)
        {
            amount = newAmount;
            UpdateButtonText();
        }
    }

    /// <summary>
    /// UnityEvent for PaymentResponse
    /// </summary>
    [System.Serializable]
    public class PaymentResponseEvent : UnityEngine.Events.UnityEvent<PaymentResponse> { }
}
