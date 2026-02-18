# Africa Payments MCP - Hetzner Cloud Infrastructure
# Terraform module for deploying on Hetzner Cloud VMs with load balancer

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

# Local values
locals {
  name = "${var.project_name}-${var.environment}"
  labels = merge(var.labels, {
    environment = var.environment
    project     = var.project_name
    managed_by  = "terraform"
  })
}

# SSH Key
resource "hcloud_ssh_key" "main" {
  name       = local.name
  public_key = file(var.ssh_public_key_path)
  labels     = local.labels
}

# Network
resource "hcloud_network" "main" {
  name     = local.name
  ip_range = var.network_cidr
  labels   = local.labels
}

resource "hcloud_network_subnet" "main" {
  network_id   = hcloud_network.main.id
  type         = "cloud"
  network_zone = var.network_zone
  ip_range     = cidrsubnet(var.network_cidr, 8, 0)
}

# Firewall
resource "hcloud_firewall" "main" {
  name = local.name

  # SSH
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.allowed_ssh_ips
  }

  # HTTP
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Application port (internal only)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = tostring(var.container_port)
    source_ips = [var.network_cidr]
  }

  labels = local.labels
}

# Cloud-init template for server setup
locals {
  cloud_init = <<-EOF
    #cloud-config
    package_update: true
    package_upgrade: true
    
    packages:
      - docker.io
      - docker-compose
      - nginx
      - postgresql-client
      - redis-tools
      - fail2ban
      - ufw
      - certbot
      - python3-certbot-nginx
      - htop
      - vim
      - git
    
    runcmd:
      # Configure Docker
      - systemctl enable docker
      - systemctl start docker
      - usermod -aG docker root
      
      # Configure UFW
      - ufw default deny incoming
      - ufw default allow outgoing
      - ufw allow 22/tcp
      - ufw allow 80/tcp
      - ufw allow 443/tcp
      - ufw --force enable
      
      # Configure fail2ban
      - systemctl enable fail2ban
      - systemctl start fail2ban
      
      # Create app directory
      - mkdir -p /opt/app
      - mkdir -p /opt/app/data/postgres
      - mkdir -p /opt/app/data/redis
      - mkdir -p /opt/app/certs
      
    write_files:
      - path: /opt/app/docker-compose.yml
        content: |
          version: '3.8'
          
          services:
            app:
              image: ${var.container_image}
              container_name: ${var.project_name}
              restart: unless-stopped
              ports:
                - "${var.container_port}:${var.container_port}"
              environment:
                - NODE_ENV=${var.environment}
                - PORT=${var.container_port}
                - DATABASE_URL=postgresql://${var.db_username}:${var.db_password}@postgres:5432/${replace(var.project_name, "-", "_")}
                - REDIS_URL=redis://redis:6379
                %{for k, v in var.container_env}
                - ${k}=${v}
                %{endfor}
              networks:
                - app-network
              depends_on:
                - postgres
                - redis
              healthcheck:
                test: ["CMD", "curl", "-f", "http://localhost:${var.container_port}/health"]
                interval: 30s
                timeout: 10s
                retries: 3
                start_period: 40s
            
            postgres:
              image: postgres:15-alpine
              container_name: ${var.project_name}-postgres
              restart: unless-stopped
              environment:
                - POSTGRES_USER=${var.db_username}
                - POSTGRES_PASSWORD=${var.db_password}
                - POSTGRES_DB=${replace(var.project_name, "-", "_")}
              volumes:
                - /opt/app/data/postgres:/var/lib/postgresql/data
              networks:
                - app-network
              healthcheck:
                test: ["CMD-SHELL", "pg_isready -U ${var.db_username} -d ${replace(var.project_name, "-", "_")}"]
                interval: 10s
                timeout: 5s
                retries: 5
            
            redis:
              image: redis:7-alpine
              container_name: ${var.project_name}-redis
              restart: unless-stopped
              command: redis-server --appendonly yes --maxmemory ${var.redis_maxmemory} --maxmemory-policy allkeys-lru
              volumes:
                - /opt/app/data/redis:/data
              networks:
                - app-network
              healthcheck:
                test: ["CMD", "redis-cli", "ping"]
                interval: 10s
                timeout: 5s
                retries: 5
            
            nginx:
              image: nginx:alpine
              container_name: ${var.project_name}-nginx
              restart: unless-stopped
              ports:
                - "80:80"
                - "443:443"
              volumes:
                - /opt/app/nginx.conf:/etc/nginx/nginx.conf:ro
                - /opt/app/certs:/etc/nginx/certs:ro
              networks:
                - app-network
              depends_on:
                - app
          
          networks:
            app-network:
              driver: bridge
      
      - path: /opt/app/nginx.conf
        content: |
          events {
            worker_connections 1024;
          }
          
          http {
            upstream app {
              least_conn;
              server app:${var.container_port} max_fails=3 fail_timeout=30s;
            }
            
            server {
              listen 80;
              server_name _;
              
              location /.well-known/acme-challenge/ {
                root /var/www/certbot;
              }
              
              location / {
                return 301 https://$host$request_uri;
              }
            }
            
            server {
              listen 443 ssl http2;
              server_name _;
              
              ssl_certificate /etc/nginx/certs/fullchain.pem;
              ssl_certificate_key /etc/nginx/certs/privkey.pem;
              
              ssl_protocols TLSv1.2 TLSv1.3;
              ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
              ssl_prefer_server_ciphers off;
              
              add_header X-Frame-Options "SAMEORIGIN" always;
              add_header X-Content-Type-Options "nosniff" always;
              add_header X-XSS-Protection "1; mode=block" always;
              add_header Referrer-Policy "strict-origin-when-cross-origin" always;
              
              location / {
                proxy_pass http://app;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection 'upgrade';
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
                proxy_cache_bypass $http_upgrade;
                proxy_read_timeout 300s;
                proxy_connect_timeout 75s;
              }
              
              location /health {
                proxy_pass http://app/health;
                access_log off;
              }
            }
          }
    EOF
}

# Servers
resource "hcloud_server" "main" {
  count       = var.server_count
  name        = "${local.name}-${count.index + 1}"
  server_type = var.server_type
  image       = var.server_image
  location    = var.server_location
  ssh_keys    = [hcloud_ssh_key.main.id]
  firewall_ids = [hcloud_firewall.main.id]
  
  network {
    network_id = hcloud_network.main.id
    ip         = cidrhost(hcloud_network_subnet.main.ip_range, count.index + 10)
  }
  
  labels = local.labels
  
  user_data = local.cloud_init
  
  depends_on = [hcloud_network_subnet.main]
}

# Volumes for persistent data
resource "hcloud_volume" "data" {
  count     = var.server_count
  name      = "${local.name}-data-${count.index + 1}"
  size      = var.data_volume_size
  server_id = hcloud_server.main[count.index].id
  format    = "ext4"
  labels    = local.labels
}

# Load Balancer
resource "hcloud_load_balancer" "main" {
  count              = var.enable_load_balancer ? 1 : 0
  name               = local.name
  load_balancer_type = var.load_balancer_type
  location           = var.server_location
  labels             = local.labels
}

resource "hcloud_load_balancer_network" "main" {
  count          = var.enable_load_balancer ? 1 : 0
  load_balancer_id = hcloud_load_balancer.main[0].id
  network_id     = hcloud_network.main.id
  ip             = cidrhost(hcloud_network_subnet.main.ip_range, 5)
}

# Load Balancer Targets
resource "hcloud_load_balancer_target" "main" {
  count            = var.enable_load_balancer ? length(hcloud_server.main) : 0
  type             = "server"
  load_balancer_id = hcloud_load_balancer.main[0].id
  server_id        = hcloud_server.main[count.index].id
  use_private_ip   = true
  
  depends_on = [hcloud_load_balancer_network.main]
}

# Load Balancer Services
resource "hcloud_load_balancer_service" "http" {
  count            = var.enable_load_balancer ? 1 : 0
  load_balancer_id = hcloud_load_balancer.main[0].id
  protocol         = "http"
  listen_port      = 80
  destination_port = var.container_port
  
  health_check {
    protocol = "http"
    port     = var.container_port
    interval = 15
    timeout  = 10
    retries  = 3
    http {
      path = "/health"
      status_codes = ["200"]
    }
  }
}

resource "hcloud_load_balancer_service" "https" {
  count            = var.enable_load_balancer && var.enable_https ? 1 : 0
  load_balancer_id = hcloud_load_balancer.main[0].id
  protocol         = "https"
  listen_port      = 443
  destination_port = var.container_port
  
  http {
    cookie_name     = "HCLBSTICKY"
    cookie_lifetime = 3600
  }
  
  health_check {
    protocol = "https"
    port     = var.container_port
    interval = 15
    timeout  = 10
    retries  = 3
    http {
      path = "/health"
      status_codes = ["200"]
    }
  }
}

# Floating IP (for single server or failover)
resource "hcloud_floating_ip" "main" {
  count         = var.enable_floating_ip ? 1 : 0
  type          = "ipv4"
  home_location = var.server_location
  server_id     = hcloud_server.main[0].id
  description   = "Floating IP for ${local.name}"
  labels        = local.labels
}

# DNS Records (if using Hetzner DNS)
resource "hcloud_rdns" "server" {
  count      = length(hcloud_server.main)
  server_id  = hcloud_server.main[count.index].id
  ip_address = hcloud_server.main[count.index].ipv4_address
  dns_ptr    = "${count.index + 1}.${var.domain_name}"
}

resource "hcloud_rdns" "floating_ip" {
  count          = var.enable_floating_ip ? 1 : 0
  floating_ip_id = hcloud_floating_ip.main[0].id
  ip_address     = hcloud_floating_ip.main[0].ip_address
  dns_ptr        = var.domain_name
}

# Primary IPs (for persistent public IPs)
resource "hcloud_primary_ip" "main" {
  count       = length(hcloud_server.main)
  name        = "${local.name}-${count.index + 1}"
  datacenter  = hcloud_server.main[count.index].datacenter
  type        = "ipv4"
  assignee_id = hcloud_server.main[count.index].id
  auto_delete = false
  labels      = local.labels
}
