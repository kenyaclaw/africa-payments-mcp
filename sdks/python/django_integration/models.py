"""Django models for Africa Payments."""

from django.db import models
from django.utils import timezone


class PaymentTransaction(models.Model):
    """Model to store payment transactions."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    transaction_id = models.CharField(
        max_length=100, unique=True, db_index=True
    )
    reference = models.CharField(max_length=255, db_index=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3)
    phone_number = models.CharField(max_length=20)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    receipt_url = models.URLField(blank=True)
    failure_reason = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Related object (generic)
    content_type = models.ForeignKey(
        "contenttypes.ContentType",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    object_id = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["reference", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.reference} - {self.status}"

    @property
    def is_successful(self) -> bool:
        """Check if payment was successful."""
        return self.status == self.Status.SUCCESS

    @property
    def is_pending(self) -> bool:
        """Check if payment is pending."""
        return self.status == self.Status.PENDING


class WebhookLog(models.Model):
    """Model to log webhook events."""

    event_id = models.CharField(max_length=255, db_index=True)
    event_type = models.CharField(max_length=100)
    payload = models.JSONField()
    signature = models.CharField(max_length=255, blank=True)
    processed = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.event_type} - {self.event_id}"
