# AWS Terraform Module

Deploy Africa Payments MCP on AWS using ECS Fargate, RDS PostgreSQL, and ElastiCache Redis.

## Architecture

```
Internet → ALB → ECS Fargate → RDS PostgreSQL
                          ↓
                    ElastiCache Redis
```

## Usage

```hcl
module "africa_payments" {
  source = "./terraform-modules/aws"

  project_name = "africa-payments-mcp"
  environment  = "production"
  aws_region   = "us-east-1"

  container_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/africa-payments:latest"
  
  db_password = var.db_password
  
  container_secrets = {
    MPESA_CONSUMER_KEY  = "arn:aws:secretsmanager:..."
    PAYSTACK_SECRET_KEY = "arn:aws:secretsmanager:..."
  }
}
```

## Resources Created

- VPC with public and private subnets
- Application Load Balancer
- ECS Cluster with Fargate service
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- CloudWatch Log Group
- Security Groups
- IAM Roles

## Inputs

| Name | Description | Default |
|------|-------------|---------|
| `project_name` | Project name | `africa-payments-mcp` |
| `environment` | Environment name | - |
| `container_image` | Docker image URL | - |
| `db_password` | Database password | - |
| `container_secrets` | Map of secrets from Secrets Manager | `{}` |

## Outputs

| Name | Description |
|------|-------------|
| `alb_dns_name` | Load balancer DNS name |
| `rds_endpoint` | Database endpoint |
| `redis_endpoint` | Redis endpoint |

## Deployment

```bash
terraform init
terraform plan
terraform apply
```
