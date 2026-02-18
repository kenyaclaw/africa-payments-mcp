# Africa Payments MCP - Azure Infrastructure
# Terraform module for deploying on Azure Container Apps with PostgreSQL

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.75"
    }
  }
}

# Local values
locals {
  name = "${var.project_name}-${var.environment}"
  tags = merge(var.tags, {
    environment = var.environment
    project     = var.project_name
    managed_by  = "terraform"
  })
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = local.name
  location = var.azure_region
  tags     = local.tags
}

# Virtual Network
resource "azurerm_virtual_network" "main" {
  name                = local.name
  address_space       = [var.vnet_cidr]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

# Subnets
resource "azurerm_subnet" "containers" {
  name                 = "containers"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 0)]

  delegation {
    name = "containerapps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "database" {
  name                 = "database"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 1)]
  service_endpoints    = ["Microsoft.Sql"]
}

resource "azurerm_subnet" "redis" {
  name                 = "redis"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 2)]
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "production" ? 30 : 7
  tags                = local.tags
}

# Container Registry
resource "azurerm_container_registry" "main" {
  name                = replace(local.name, "-", "")
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.environment == "production" ? "Standard" : "Basic"
  admin_enabled       = false
  tags                = local.tags
}

# PostgreSQL Flexible Server
resource "azurerm_private_dns_zone" "postgres" {
  name                = "${local.name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = local.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  resource_group_name   = azurerm_resource_group.main.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = local.name
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "15"
  delegated_subnet_id    = azurerm_subnet.database.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres.id
  administrator_login    = var.db_username
  administrator_password = var.db_password
  zone                   = "1"
  storage_mb             = var.db_storage_mb
  sku_name               = var.db_sku_name
  backup_retention_days  = var.environment == "production" ? 35 : 7
  geo_redundant_backup_enabled = var.environment == "production"

  maintenance_window {
    day_of_week  = 0
    start_hour   = 3
    start_minute = 0
  }

  tags = local.tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = replace(var.project_name, "-", "_")
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Azure Cache for Redis
resource "azurerm_redis_cache" "main" {
  name                 = local.name
  location             = azurerm_resource_group.main.location
  resource_group_name  = azurerm_resource_group.main.name
  capacity             = var.redis_capacity
  family               = var.redis_family
  sku_name             = var.redis_sku
  enable_non_ssl_port  = false
  minimum_tls_version  = "1.2"
  subnet_id            = azurerm_subnet.redis.id
  
  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }

  tags = local.tags
}

# Key Vault for secrets
resource "azurerm_key_vault" "main" {
  name                = replace(local.name, "-", "")
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  
  soft_delete_retention_days = 7
  purge_protection_enabled   = var.environment == "production"

  network_acls {
    default_action = "Allow"
    bypass         = "AzureServices"
  }

  tags = local.tags
}

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault_access_policy" "current_user" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = data.azurerm_client_config.current.object_id

  secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "database-password"
  value        = var.db_password
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_key_vault_access_policy.current_user]
}

# Container App Environment
resource "azurerm_container_app_environment" "main" {
  name                       = local.name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.containers.id

  tags = local.tags
}

# Container App
resource "azurerm_container_app" "main" {
  name                         = local.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple"

  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = true
    target_port      = var.container_port
    transport        = "auto"
    
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  registry {
    server               = azurerm_container_registry.main.login_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "registry-password"
  }

  secret {
    name  = "registry-password"
    value = azurerm_container_registry.main.admin_password
  }

  dynamic "secret" {
    for_each = var.app_secrets
    content {
      name  = secret.key
      value = secret.value
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = var.project_name
      image  = var.container_image
      cpu    = var.container_cpu
      memory = var.container_memory

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
        value = "postgresql://${var.db_username}:${var.db_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${replace(var.project_name, "-", "_")}"
      }

      env {
        name  = "REDIS_URL"
        value = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:6380"
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
          name        = env.key
          secret_name = env.key
        }
      }

      liveness_probe {
        path      = "/health"
        port      = var.container_port
        interval_seconds = 10
        failure_count_threshold = 3
      }

      readiness_probe {
        path      = "/health"
        port      = var.container_port
        interval_seconds = 10
        failure_count_threshold = 3
      }
    }
  }

  tags = local.tags
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "Node.JS"
  retention_in_days   = var.environment == "production" ? 90 : 30

  tags = local.tags
}

# Container App Environment Storage for persistent volumes (if needed)
resource "azurerm_container_app_environment_storage" "main" {
  count                        = var.enable_file_storage ? 1 : 0
  name                         = local.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  account_name                 = azurerm_storage_account.main[0].name
  share_name                   = azurerm_storage_share.main[0].name
  access_key                   = azurerm_storage_account.main[0].primary_access_key
  access_mode                  = "ReadWrite"
}

# Storage Account (optional file storage)
resource "azurerm_storage_account" "main" {
  count                    = var.enable_file_storage ? 1 : 0
  name                     = replace(local.name, "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  tags = local.tags
}

resource "azurerm_storage_share" "main" {
  count                = var.enable_file_storage ? 1 : 0
  name                 = local.name
  storage_account_name = azurerm_storage_account.main[0].name
  quota                = 50
}

# Action Group for alerts
resource "azurerm_monitor_action_group" "main" {
  count               = var.environment == "production" ? 1 : 0
  name                = local.name
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "apmcp${var.environment}"

  email_receiver {
    name          = "admin"
    email_address = var.alert_email
  }
}

# Metric Alert for high CPU
resource "azurerm_monitor_metric_alert" "high_cpu" {
  count               = var.environment == "production" ? 1 : 0
  name                = "${local.name}-high-cpu"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.main.id]
  description         = "Alert when CPU usage is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "UsageNanoCores"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.main[0].id
  }
}

# Metric Alert for memory
resource "azurerm_monitor_metric_alert" "high_memory" {
  count               = var.environment == "production" ? 1 : 0
  name                = "${local.name}-high-memory"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.main.id]
  description         = "Alert when memory usage is high"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "WorkingSetBytes"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.main[0].id
  }
}
