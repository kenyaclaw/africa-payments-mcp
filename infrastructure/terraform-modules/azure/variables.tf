variable "azure_region" {
  description = "Azure region"
  type        = string
  default     = "East US"
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

variable "vnet_cidr" {
  description = "CIDR block for VNet"
  type        = string
  default     = "10.0.0.0/16"
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
  description = "CPU cores for the container (e.g., 0.5, 1.0, 2.0)"
  type        = number
  default     = 0.5
}

variable "container_memory" {
  description = "Memory for the container (e.g., '1Gi', '2Gi')"
  type        = string
  default     = "1Gi"
}

variable "container_env" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "min_replicas" {
  description = "Minimum number of container replicas"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of container replicas"
  type        = number
  default     = 10
}

variable "db_sku_name" {
  description = "SKU name for PostgreSQL"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  description = "Storage size for PostgreSQL in MB"
  type        = number
  default     = 32768
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

variable "redis_capacity" {
  description = "Redis capacity (0-6 for Basic/Standard, 1-5 for Premium)"
  type        = number
  default     = 0
}

variable "redis_family" {
  description = "Redis family (C for Basic/Standard, P for Premium)"
  type        = string
  default     = "C"
}

variable "redis_sku" {
  description = "Redis SKU (Basic, Standard, Premium)"
  type        = string
  default     = "Basic"
}

variable "app_secrets" {
  description = "Application secrets"
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "enable_file_storage" {
  description = "Enable Azure Files storage for persistent volumes"
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email for alerts"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
