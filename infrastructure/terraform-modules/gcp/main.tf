# Africa Payments MCP - GCP Infrastructure
# Terraform module for deploying on Cloud Run with Cloud SQL

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Local values
locals {
  name = "${var.project_name}-${var.environment}"
  tags = merge(var.labels, {
    environment = var.environment
    project     = var.project_name
    managed_by  = "terraform"
  })
}

# Enable APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "redis.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# VPC Network
resource "google_compute_network" "main" {
  name                    = local.name
  auto_create_subnetworks = false
  routing_mode            = "GLOBAL"

  depends_on = [google_project_service.apis]
}

# Subnet
resource "google_compute_subnetwork" "main" {
  name          = local.name
  ip_cidr_range = var.subnet_cidr
  network       = google_compute_network.main.id
  region        = var.gcp_region

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# VPC Connector for Cloud Run
resource "google_vpc_access_connector" "main" {
  name          = local.name
  network       = google_compute_network.main.name
  region        = var.gcp_region
  ip_cidr_range = "10.8.0.0/28"
  min_throughput = 200
  max_throughput = 1000
}

# Cloud SQL - PostgreSQL
resource "google_sql_database_instance" "main" {
  name             = local.name
  database_version = "POSTGRES_15"
  region           = var.gcp_region

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = var.db_disk_size
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    backup_configuration {
      enabled    = true
      start_time = "03:00"
      
      backup_retention_settings {
        retained_backups = var.environment == "production" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 4
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.main.id
    }
  }

  deletion_protection = var.environment == "production"

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "main" {
  name     = replace(var.project_name, "-", "_")
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "main" {
  name     = var.db_username
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# Cloud Memorystore (Redis)
resource "google_redis_instance" "main" {
  name               = local.name
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_size_gb
  region             = var.gcp_region
  authorized_network = google_compute_network.main.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  redis_version      = "REDIS_7_0"
  display_name       = "${local.name} Redis"

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
      }
    }
  }
}

# Secret Manager for sensitive values
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${local.name}-db-password"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

resource "google_secret_manager_secret" "app_secrets" {
  for_each = var.app_secrets

  secret_id = "${local.name}-${each.key}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "app_secrets" {
  for_each = var.app_secrets

  secret      = google_secret_manager_secret.app_secrets[each.key].id
  secret_data = each.value
}

# Service Account for Cloud Run
resource "google_service_account" "cloud_run" {
  account_id   = "${var.project_name}-${var.environment}"
  display_name = "Cloud Run service account for ${local.name}"
}

resource "google_project_iam_member" "cloud_run_secrets" {
  project = var.gcp_project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_sql" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_logs" {
  project = var.gcp_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_metrics" {
  project = var.gcp_project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Artifact Registry
resource "google_artifact_registry_repository" "main" {
  location      = var.gcp_region
  repository_id = local.name
  description   = "Docker repository for ${local.name}"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  name     = local.name
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instances = var.min_instances
      max_instances = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "ALL_TRAFFIC"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.container_cpu
          memory = var.container_memory
        }
        cpu_idle = var.environment != "production"
      }

      ports {
        container_port = var.container_port
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = tostring(var.container_port)
      }

      env {
        name  = "DATABASE_URL"
        value = "postgres://${var.db_username}:${var.db_password}@${google_sql_database_instance.main.private_ip_address}:5432/${replace(var.project_name, "-", "_")}"
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
      }

      dynamic "env" {
        for_each = var.container_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.app_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app_secrets[env.key].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 3
        period_seconds        = 3
        failure_threshold     = 3
        http_get {
          path = "/health"
          port = var.container_port
        }
      }

      liveness_probe {
        timeout_seconds   = 3
        period_seconds    = 10
        failure_threshold = 3
        http_get {
          path = "/health"
          port = var.container_port
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Cloud Run IAM - Allow unauthenticated access (managed by API key in app)
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.main.location
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud Run Domain Mapping (if custom domain provided)
resource "google_cloud_run_domain_mapping" "main" {
  count    = var.custom_domain != "" ? 1 : 0
  location = var.gcp_region
  name     = var.custom_domain

  metadata {
    namespace = var.gcp_project_id
  }

  spec {
    route_name       = google_cloud_run_v2_service.main.name
    certificate_mode = "AUTOMATIC"
  }
}

# Global Load Balancer (for custom domain with SSL)
resource "google_compute_global_address" "main" {
  count = var.custom_domain != "" ? 1 : 0
  name  = local.name
}

resource "google_compute_managed_ssl_certificate" "main" {
  count = var.custom_domain != "" ? 1 : 0
  name  = local.name

  managed {
    domains = [var.custom_domain]
  }
}

resource "google_compute_backend_service" "main" {
  count       = var.custom_domain != "" ? 1 : 0
  name        = local.name
  description = "Backend service for ${local.name}"

  backend {
    group = google_compute_region_network_endpoint_group.main[0].id
  }
}

resource "google_compute_region_network_endpoint_group" "main" {
  count                 = var.custom_domain != "" ? 1 : 0
  name                  = local.name
  network_endpoint_type = "SERVERLESS"
  region                = var.gcp_region

  cloud_run {
    service = google_cloud_run_v2_service.main.name
  }
}

resource "google_compute_url_map" "main" {
  count           = var.custom_domain != "" ? 1 : 0
  name            = local.name
  default_service = google_compute_backend_service.main[0].id
}

resource "google_compute_target_https_proxy" "main" {
  count   = var.custom_domain != "" ? 1 : 0
  name    = local.name
  url_map = google_compute_url_map.main[0].id
  ssl_certificates = [
    google_compute_managed_ssl_certificate.main[0].id
  ]
}

resource "google_compute_global_forwarding_rule" "main" {
  count      = var.custom_domain != "" ? 1 : 0
  name       = local.name
  target     = google_compute_target_https_proxy.main[0].id
  port_range = "443"
  ip_address = google_compute_global_address.main[0].address
}

# Alerting Policies
resource "google_monitoring_alert_policy" "high_latency" {
  count        = var.environment == "production" ? 1 : 0
  display_name = "${local.name} High Latency"
  combiner     = "OR"

  conditions {
    display_name = "Request Latency"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000  # 2 seconds

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_notification_channels

  alert_strategy {
    auto_close = "86400s"
  }
}

resource "google_monitoring_alert_policy" "error_rate" {
  count        = var.environment == "production" ? 1 : 0
  display_name = "${local.name} High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Error Rate"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_notification_channels
}
