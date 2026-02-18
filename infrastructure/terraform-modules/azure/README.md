# Azure Terraform Module

Deploy Africa Payments MCP on Microsoft Azure using Container Apps, PostgreSQL Flexible Server, and Azure Cache for Redis.

## Architecture

```
Internet → Container Apps Environment → Container App
                ↓                           ↓
        PostgreSQL Flexible Server    Azure Redis Cache
```

## Usage

```hcl
module "africa_payments" {
  source = "./terraform-modules/azure"

  azure_region = "East US"
  
  project_name = "africa-payments-mcp"
  environment  = "production"

  container_image = "myregistry.azurecr.io/africa-payments:latest"
  
  db_password = var.db_password
}
```

## Resources Created

- Resource Group
- Virtual Network with subnets
- Container App Environment
- Container App
- PostgreSQL Flexible Server
- Azure Cache for Redis
- Key Vault
- Log Analytics Workspace

## Deployment

```bash
az login
terraform init
terraform apply
```
