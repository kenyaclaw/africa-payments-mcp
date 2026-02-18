# Hetzner Cloud Terraform Module

Deploy Africa Payments MCP on Hetzner Cloud using VMs with Docker Compose and optional Load Balancer.

## Architecture

```
Internet → Load Balancer (optional) → VM(s) with Docker Compose
                                        ↓
                              PostgreSQL + Redis + App
```

## Usage

```hcl
module "africa_payments" {
  source = "./terraform-modules/hetzner"

  hcloud_token = var.hcloud_token
  
  project_name = "africa-payments-mcp"
  environment  = "production"
  
  container_image = "myregistry/africa-payments:latest"
  db_password     = var.db_password
  
  enable_load_balancer = true
  server_count         = 2
}
```

## Resources Created

- Network and subnet
- Cloud servers (VMs)
- Load balancer (optional)
- Floating IP (optional)
- Volumes for persistent data
- Firewall rules

## Deployment

```bash
export HCLOUD_TOKEN="your-token"
terraform init
terraform apply
```

## Post-Deployment

1. SSH into the server:
```bash
ssh root@<server-ip>
```

2. Check Docker containers:
```bash
docker ps
docker-compose -f /opt/app/docker-compose.yml logs -f
```

3. SSL certificate (if using nginx):
```bash
certbot --nginx -d your-domain.com
```
