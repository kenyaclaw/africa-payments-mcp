variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "africa-payments-mcp"
}

variable "environment" {
  description = "Environment name (e.g., production, staging, development)"
  type        = string
}

variable "subnet_cidr" {
  description = "CIDR block for subnet"
  type        = string
  default     = "10.0.0.0/24"
}

variable "container_image" {
  description = "Docker image for the application"
  type        = string
}

variable "container_port" {
  description = "Port exposed by the container"
  type        = number
  default     = 3000
}

variable "container_cpu" {
  description = "CPU limit for the container (e.g., '1', '2')"
  type        = string
  default     = "1"
}

variable "container_memory" {
  description = "Memory limit for the container (e.g., '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "container_env" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 100
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 10
}

variable "db_username" {
  description = "Username for the database"
  type        = string
  default     = "payments"
}

variable "db_password" {
  description = "Password for the database"
  type        = string
  sensitive   = true
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

variable "app_secrets" {
  description = "Application secrets to store in Secret Manager"
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "custom_domain" {
  description = "Custom domain for the service (optional)"
  type        = string
  default     = ""
}

variable "alert_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
