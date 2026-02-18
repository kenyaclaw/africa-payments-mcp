# Africa Payments MCP - Terraform Modules

Infrastructure as Code (IaC) for deploying Africa Payments MCP on various cloud providers.

## Available Modules

| Provider | Module | Services |
|----------|--------|----------|
| AWS | `aws/` | ECS, RDS PostgreSQL, ElastiCache, ALB |
| GCP | `gcp/` | Cloud Run, Cloud SQL, Memorystore |
| Azure | `azure/` | Container Apps, PostgreSQL, Redis |
| Hetzner | `hetzner/` | VMs, Load Balancer, Docker Compose |

## Quick Start

### AWS

```hcl
module "africa_payments" {
  source = "./terraform-modules/aws"

  project_name = "africa-payments-mcp"
  environment  = "production"
  aws_region   = "us-east-1"

  container_image = "your-registry/africa-payments-mcp:latest"
  container_port  = 3000

  db_password = var.db_password
  
  container_secrets = {
    MPESA_CONSUMER_KEY    = "arn:aws:secretsmanager:..."
    PAYSTACK_SECRET_KEY   = "arn:aws:secretsmanager:..."
  }
}
```

### GCP

```hcl
module "africa_payments" {
  source = "./terraform-modules/gcp"

  gcp_project_id = "your-project-id"
  gcp_region     = "us-central1"
  
  project_name = "africa-payments-mcp"
  environment  = "production"

  container_image = "gcr.io/your-project/africa-payments-mcp:latest"
  
  db_password = var.db_password
  
  app_secrets = {
    MPESA_CONSUMER_KEY  = "your_key"
    PAYSTACK_SECRET_KEY = "your_secret"
  }
}
```

### Azure

```hcl
module "africa_payments" {
  source = "./terraform-modules/azure"

  azure_region = "East US"
  
  project_name = "africa-payments-mcp"
  environment  = "production"

  container_image = "your-registry.azurecr.io/africa-payments-mcp:latest"
  
  db_password = var.db_password
}
```

### Hetzner Cloud

```hcl
module "africa_payments" {
  source = "./terraform-modules/hetzner"

  hcloud_token = var.hcloud_token
  
  project_name = "africa-payments-mcp"
  environment  = "production"
  server_location = "nbg1"
  
  container_image = "your-registry/africa-payments-mcp:latest"
  
  db_password = var.db_password
  
  enable_load_balancer = true
}
```

## Module Comparison

| Feature | AWS | GCP | Azure | Hetzner |
|---------|-----|-----|-------|---------|
| Container Platform | ECS Fargate | Cloud Run | Container Apps | Docker on VMs |
| Database | RDS PostgreSQL | Cloud SQL | PostgreSQL Flexible | Self-hosted |
| Cache | ElastiCache | Memorystore | Azure Redis | Self-hosted |
| Load Balancer | ALB | Cloud Load Balancing | Built-in | Hetzner LB |
| Auto Scaling | Yes | Yes | Yes | Manual |
| SSL/TLS | ACM | Managed | Managed | certbot/nginx |
| Monitoring | CloudWatch | Cloud Monitoring | App Insights | Basic |
| Free Tier | 12 months | $300 credit | $200 credit | €20 credit |

## Provider Selection Guide

### Choose AWS if:
- You need enterprise-grade reliability
- You use other AWS services
- You need fine-grained control
- Cost is not the primary concern

### Choose GCP if:
- You want fully managed services
- You prefer pay-per-use pricing
- You need global load balancing
- You use Kubernetes/GKE

### Choose Azure if:
- You're in a Microsoft ecosystem
- You need Windows compatibility
- You want hybrid cloud options
- You need Active Directory integration

### Choose Hetzner if:
- Cost is a primary concern
- You prefer simplicity
- You're comfortable managing VMs
- You need EU data residency

## Usage Examples

### Production Deployment on AWS

```hcl
terraform {
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "africa-payments/production"
    region = "us-east-1"
  }
}

provider "aws" {
  region = "us-east-1"
}

module "production" {
  source = "github.com/kenyaclaw/africa-payments-mcp//infrastructure/terraform-modules/aws"

  project_name = "africa-payments-mcp"
  environment  = "production"

  vpc_cidr             = "10.0.0.0/16"
  availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
  
  container_image      = "123456789012.dkr.ecr.us-east-1.amazonaws.com/africa-payments-mcp:latest"
  container_port       = 3000
  container_cpu        = 1024
  container_memory     = 2048
  
  service_desired_count = 3
  service_min_count     = 2
  service_max_count     = 10
  
  db_instance_class    = "db.t4g.medium"
  db_allocated_storage = 50
  db_password          = var.db_password
  
  redis_node_type = "cache.t4g.micro"
  
  acm_certificate_arn = "arn:aws:acm:..."
  
  tags = {
    Team = "Platform"
    CostCenter = "Engineering"
  }
}
```

### Staging Deployment on GCP

```hcl
terraform {
  backend "gcs" {
    bucket = "my-terraform-state"
    prefix = "africa-payments/staging"
  }
}

provider "google" {
  project = "my-project"
  region  = "us-central1"
}

module "staging" {
  source = "github.com/kenyaclaw/africa-payments-mcp//infrastructure/terraform-modules/gcp"

  gcp_project_id = "my-project"
  gcp_region     = "us-central1"
  
  project_name = "africa-payments-mcp"
  environment  = "staging"
  
  container_image = "gcr.io/my-project/africa-payments-mcp:staging"
  
  db_tier       = "db-f1-micro"
  db_disk_size  = 10
  db_password   = var.db_password
  
  min_instances = 0
  max_instances = 5
  
  app_secrets = {
    MPESA_CONSUMER_KEY = var.mpesa_key
    PAYSTACK_SECRET_KEY = var.paystack_key
  }
}
```

## Secrets Management

### AWS
Use AWS Secrets Manager:

```hcl
resource "aws_secretsmanager_secret" "db_password" {
  name = "africa-payments/production/db-password"
}

module "production" {
  # ...
  db_password = data.aws_secretsmanager_secret_version.db_password.secret_string
}
```

### GCP
Use Secret Manager:

```hcl
data "google_secret_manager_secret_version" "db_password" {
  secret = "africa-payments-db-password"
}

module "production" {
  # ...
  db_password = data.google_secret_manager_secret_version.db_password.secret_data
}
```

### Azure
Use Key Vault:

```hcl
data "azurerm_key_vault_secret" "db_password" {
  name         = "database-password"
  key_vault_id = azurerm_key_vault.main.id
}

module "production" {
  # ...
  db_password = data.azurerm_key_vault_secret.db_password.value
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy Infrastructure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Terraform Init
        run: terraform init
        
      - name: Terraform Plan
        run: terraform plan
        
      - name: Terraform Apply
        run: terraform apply -auto-approve
```

## Cost Estimation

### AWS (Production)
- ECS Fargate: ~$75/mo (2 tasks, 1 vCPU, 2GB each)
- RDS PostgreSQL: ~$50/mo (db.t4g.micro)
- ElastiCache: ~$30/mo (cache.t4g.micro)
- ALB: ~$20/mo + LCU charges
- **Total**: ~$175-250/mo

### GCP (Production)
- Cloud Run: ~$30/mo (2M requests)
- Cloud SQL: ~$25/mo (db-f1-micro)
- Memorystore: ~$30/mo (1GB)
- Load Balancer: ~$18/mo
- **Total**: ~$100-150/mo

### Azure (Production)
- Container Apps: ~$50/mo
- PostgreSQL: ~$25/mo (Basic)
- Redis: ~$40/mo (C1)
- **Total**: ~$115-150/mo

### Hetzner (Production)
- 2x CPX21 servers: ~$24/mo
- Load Balancer LB11: ~$7/mo
- Volumes: ~$5/mo
- **Total**: ~$36/mo

## Troubleshooting

### AWS
**Task failing to start**: Check CloudWatch logs at `/ecs/africa-payments-mcp-production`
**Database connection refused**: Check security group rules

### GCP
**Service not deploying**: Check Cloud Build logs
**Database connection failed**: Ensure Cloud SQL Admin API is enabled

### Azure
**Container not starting**: Check Container App logs
**Database access denied**: Check firewall rules

### Hetzner
**Cloud-init failing**: Check `/var/log/cloud-init.log`
**Docker not starting**: Check `systemctl status docker`

## Contributing

When adding new modules:

1. Create a new subdirectory with the provider name
2. Include `main.tf`, `variables.tf`, and `outputs.tf`
3. Add a README specific to that provider
4. Include usage examples
5. Test with `terraform validate` and `terraform plan`

## License

MIT - See LICENSE in project root
