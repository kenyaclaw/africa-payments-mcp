using UnityEngine;
using UnityEngine.Purchasing;
using UnityEngine.Purchasing.Extension;
using AfricaPaymentsMcp.Models;
using AfricaPaymentsMcp.Services;

namespace AfricaPaymentsMcp.Utils
{
    /// <summary>
    /// Integration with Unity IAP for in-game purchases
    /// </summary>
    public class AfricaPaymentsIAP : MonoBehaviour, IDetailedStoreListener
    {
        [Header("Configuration")]
        [SerializeField] private PaymentConfig paymentConfig;
        [SerializeField] private bool useAfricaPaymentsForMobile = true;

        [Header("Product Catalog")]
        [SerializeField] private ProductCatalog catalog;

        private IStoreController _storeController;
        private IExtensionProvider _storeExtensionProvider;
        private System.Action<bool, string> _purchaseCallback;

        private void Start()
        {
            if (useAfricaPaymentsForMobile)
            {
                InitializeAfricaPayments();
            }
            else
            {
                InitializeUnityIAP();
            }
        }

        /// <summary>
        /// Initialize Africa Payments for mobile money
        /// </summary>
        private void InitializeAfricaPayments()
        {
            if (paymentConfig != null)
            {
                PaymentService.Instance.Initialize(paymentConfig);
            }
            else
            {
                Debug.LogError("[AfricaPaymentsIAP] PaymentConfig is not set!");
            }
        }

        /// <summary>
        /// Initialize Unity IAP (for other platforms)
        /// </summary>
        private void InitializeUnityIAP()
        {
            var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
            
            // Add products from catalog
            if (catalog != null)
            {
                foreach (var product in catalog.allProducts)
                {
                    builder.AddProduct(product.id, product.type);
                }
            }

            UnityPurchasing.Initialize(this, builder);
        }

        /// <summary>
        /// Purchase a product using Africa Payments (mobile money)
        /// </summary>
        public void PurchaseWithMobileMoney(
            string productId, 
            double amount, 
            string currency,
            string phoneNumber,
            System.Action<bool, string> callback)
        {
            _purchaseCallback = callback;

            var request = new PaymentRequest
            {
                Amount = amount,
                Currency = currency,
                PhoneNumber = phoneNumber,
                Reference = $"IAP-{productId}-{System.DateTime.Now.Ticks}",
                Description = $"Purchase: {productId}"
            };

            PaymentModal.Show(paymentConfig, request, (response, error) =>
            {
                if (response != null && response.IsSuccess)
                {
                    // Grant the product
                    GrantProduct(productId);
                    _purchaseCallback?.Invoke(true, response.TransactionId);
                }
                else
                {
                    _purchaseCallback?.Invoke(false, error ?? "Payment failed");
                }
            });
        }

        /// <summary>
        /// Purchase a product using Unity IAP
        /// </summary>
        public void PurchaseWithUnityIAP(string productId, System.Action<bool, string> callback)
        {
            _purchaseCallback = callback;

            if (_storeController == null)
            {
                callback?.Invoke(false, "Store not initialized");
                return;
            }

            var product = _storeController.products.WithID(productId);
            if (product != null && product.availableToPurchase)
            {
                _storeController.InitiatePurchase(product);
            }
            else
            {
                callback?.Invoke(false, "Product not available");
            }
        }

        /// <summary>
        /// Grant the purchased product to the player
        /// </summary>
        private void GrantProduct(string productId)
        {
            Debug.Log($"[AfricaPaymentsIAP] Granting product: {productId}");
            
            // Implement your product granting logic here
            // Examples:
            // - Add coins to player
            // - Unlock premium features
            // - Grant in-game items
            
            // Example:
            // PlayerInventory.Instance.AddItem(productId);
            // PlayerData.Instance.AddCoins(amount);
        }

        #region IDetailedStoreListener Implementation

        public void OnInitialized(IStoreController controller, IExtensionProvider extensions)
        {
            _storeController = controller;
            _storeExtensionProvider = extensions;
            Debug.Log("[AfricaPaymentsIAP] Unity IAP initialized");
        }

        public void OnInitializeFailed(InitializationFailureReason error)
        {
            Debug.LogError($"[AfricaPaymentsIAP] Unity IAP initialization failed: {error}");
        }

        public void OnInitializeFailed(InitializationFailureReason error, string message)
        {
            Debug.LogError($"[AfricaPaymentsIAP] Unity IAP initialization failed: {error} - {message}");
        }

        public PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs args)
        {
            Debug.Log($"[AfricaPaymentsIAP] Purchase succeeded: {args.purchasedProduct.definition.id}");
            
            GrantProduct(args.purchasedProduct.definition.id);
            _purchaseCallback?.Invoke(true, args.purchasedProduct.transactionID);
            
            return PurchaseProcessingResult.Complete;
        }

        public void OnPurchaseFailed(Product product, PurchaseFailureReason failureReason)
        {
            Debug.LogError($"[AfricaPaymentsIAP] Purchase failed: {product.definition.id} - {failureReason}");
            _purchaseCallback?.Invoke(false, failureReason.ToString());
        }

        public void OnPurchaseFailed(Product product, PurchaseFailureDescription failureDescription)
        {
            Debug.LogError($"[AfricaPaymentsIAP] Purchase failed: {product.definition.id} - {failureDescription.reason}");
            _purchaseCallback?.Invoke(false, failureDescription.message);
        }

        #endregion
    }

    /// <summary>
    /// Product catalog entry
    /// </summary>
    [System.Serializable]
    public class ProductCatalog
    {
        public ProductCatalogItem[] allProducts;
    }

    [System.Serializable]
    public class ProductCatalogItem
    {
        public string id;
        public ProductType type;
    }
}
