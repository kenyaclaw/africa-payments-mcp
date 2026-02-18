variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
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

variable "server_location" {
  description = "Hetzner location (e.g., nbg1, fsn1, hel1, ash, hil)"
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server type (e.g., cx11, cpx11, cx21, cpx21, cx31)"
  type        = string
  default     = "cpx11"
}

variable "server_image" {
  description = "Server image (e.g., ubuntu-22.04, debian-12)"
  type        = string
  default     = "ubuntu-22.04"
}

variable "server_count" {
  description = "Number of servers to create"
  type        = number
  default     = 1
}

variable "network_zone" {
  description = "Network zone (e.g., eu-central, us-east, us-west)"
  type        = string
  default     = "eu-central"
}

variable "network_cidr" {
  description = "CIDR block for the network"
  type        = string
  default     = "10.0.0.0/16"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "allowed_ssh_ips" {
  description = "List of IPs allowed to SSH"
  type        = list(string)
  default     = ["0.0.0.0/0"]
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

variable "container_env" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
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

variable "redis_maxmemory" {
  description = "Redis maxmemory setting"
  type        = string
  default     = "256mb"
}

variable "data_volume_size" {
  description = "Size of data volume in GB"
  type        = number
  default     = 20
}

variable "enable_load_balancer" {
  description = "Enable Hetzner Load Balancer"
  type        = bool
  default     = false
}

variable "load_balancer_type" {
  description = "Load balancer type (lb11, lb21, lb31)"
  type        = string
  default     = "lb11"
}

variable "enable_https" {
  description = "Enable HTTPS on load balancer"
  type        = bool
  default     = false
}

variable "enable_floating_ip" {
  description = "Enable floating IP"
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Domain name for reverse DNS"
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
