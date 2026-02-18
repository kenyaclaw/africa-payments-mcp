output "server_ips" {
  description = "Public IPs of the servers"
  value       = hcloud_server.main[*].ipv4_address
}

output "server_private_ips" {
  description = "Private IPs of the servers"
  value       = [for s in hcloud_server.main : s.network[0].ip]
}

output "load_balancer_ip" {
  description = "Public IP of the load balancer"
  value       = var.enable_load_balancer ? hcloud_load_balancer.main[0].ipv4 : null
}

output "floating_ip" {
  description = "Floating IP address"
  value       = var.enable_floating_ip ? hcloud_floating_ip.main[0].ip_address : null
}

output "network_id" {
  description = "ID of the network"
  value       = hcloud_network.main.id
}

output "ssh_key_id" {
  description = "ID of the SSH key"
  value       = hcloud_ssh_key.main.id
}

output "server_names" {
  description = "Names of the servers"
  value       = hcloud_server.main[*].name
}

output "connection_string" {
  description = "SSH connection string for the first server"
  value       = "ssh root@${hcloud_server.main[0].ipv4_address}"
}
