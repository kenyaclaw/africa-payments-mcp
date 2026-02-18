# GCP Terraform Module

Deploy Africa Payments MCP on Google Cloud Platform using Cloud Run, Cloud SQL, and Memorystore.

## Architecture

```
Internet → Cloud Load Balancer → Cloud Run → Cloud SQL
                                      ↓
                                 Memorystore Redis
```

## Usage

```hcl
module "africa_payments" {
  source = "./terraform-modules/gcp"

  gcp_project_id = "my-project"
  gcp_region     = "us-central1"
  
  project_name = "africa-payments-mcp"
  environment  = "production"

  container_image = "gcr.io/my-project/africa-payments:latest"
  
  db_password = var.db_password
}
```

## Resources Created

- VPC Network
- Cloud Run service
- Cloud SQL PostgreSQL instance
- Memorystore Redis instance
- Secret Manager secrets
- Service accounts

## Deployment

```bash
gcloud auth application-default login
terraform init
terraform apply
```
