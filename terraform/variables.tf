# Claude Task Master Terraform Variables

# General Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "claude-task-master"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "owner" {
  description = "Owner of the infrastructure"
  type        = string
  default     = "claude-task-master-team"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# EKS Configuration
variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS worker nodes"
  type        = list(string)
  default     = ["t3.medium", "t3.large"]
}

variable "node_group_min_size" {
  description = "Minimum number of nodes in the EKS node group"
  type        = number
  default     = 1
}

variable "node_group_max_size" {
  description = "Maximum number of nodes in the EKS node group"
  type        = number
  default     = 10
}

variable "node_group_desired_size" {
  description = "Desired number of nodes in the EKS node group"
  type        = number
  default     = 3
}

variable "spot_instance_types" {
  description = "EC2 instance types for spot instances"
  type        = list(string)
  default     = ["t3.medium", "t3.large", "t3.xlarge"]
}

variable "spot_max_size" {
  description = "Maximum number of spot instances"
  type        = number
  default     = 5
}

variable "spot_desired_size" {
  description = "Desired number of spot instances"
  type        = number
  default     = 0
}

variable "ec2_key_pair_name" {
  description = "Name of the EC2 Key Pair for SSH access"
  type        = string
  default     = ""
}

# AWS Auth Configuration
variable "aws_auth_users" {
  description = "List of AWS users to add to aws-auth configmap"
  type = list(object({
    userarn  = string
    username = string
    groups   = list(string)
  }))
  default = []
}

# RDS PostgreSQL Configuration
variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15.4"
}

variable "postgres_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "postgres_allocated_storage" {
  description = "Initial allocated storage for RDS instance (GB)"
  type        = number
  default     = 20
}

variable "postgres_max_allocated_storage" {
  description = "Maximum allocated storage for RDS instance (GB)"
  type        = number
  default     = 100
}

variable "postgres_db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "claude_task_master"
}

variable "postgres_username" {
  description = "Username for the PostgreSQL database"
  type        = string
  default     = "postgres"
}

variable "postgres_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = true
  default     = ""
  
  validation {
    condition     = length(var.postgres_password) >= 8
    error_message = "PostgreSQL password must be at least 8 characters long."
  }
}

variable "postgres_backup_retention" {
  description = "Number of days to retain PostgreSQL backups"
  type        = number
  default     = 7
}

# ElastiCache Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 1
}

variable "redis_auth_token" {
  description = "Auth token for Redis cluster"
  type        = string
  sensitive   = true
  default     = ""
  
  validation {
    condition     = length(var.redis_auth_token) >= 16
    error_message = "Redis auth token must be at least 16 characters long."
  }
}

# Storage Configuration
variable "backup_retention_days" {
  description = "Number of days to retain backups in S3"
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 14
}

# Monitoring Configuration
variable "enable_monitoring" {
  description = "Enable enhanced monitoring"
  type        = bool
  default     = true
}

variable "enable_logging" {
  description = "Enable enhanced logging"
  type        = bool
  default     = true
}

variable "enable_alerting" {
  description = "Enable alerting"
  type        = bool
  default     = true
}

# Security Configuration
variable "enable_encryption" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "enable_network_policies" {
  description = "Enable Kubernetes network policies"
  type        = bool
  default     = true
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the cluster"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Application Configuration
variable "app_image_tag" {
  description = "Docker image tag for the application"
  type        = string
  default     = "latest"
}

variable "app_replicas" {
  description = "Number of application replicas"
  type        = number
  default     = 3
}

variable "app_cpu_request" {
  description = "CPU request for application pods"
  type        = string
  default     = "250m"
}

variable "app_cpu_limit" {
  description = "CPU limit for application pods"
  type        = string
  default     = "500m"
}

variable "app_memory_request" {
  description = "Memory request for application pods"
  type        = string
  default     = "256Mi"
}

variable "app_memory_limit" {
  description = "Memory limit for application pods"
  type        = string
  default     = "1Gi"
}

# Domain Configuration
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "claude-task-master.example.com"
}

variable "enable_ssl" {
  description = "Enable SSL/TLS certificates"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ARN of the SSL certificate"
  type        = string
  default     = ""
}

# Feature Flags
variable "enable_autoscaling" {
  description = "Enable horizontal pod autoscaling"
  type        = bool
  default     = true
}

variable "enable_spot_instances" {
  description = "Enable spot instances for cost optimization"
  type        = bool
  default     = false
}

variable "enable_multi_az" {
  description = "Enable multi-AZ deployment"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

# Cost Optimization
variable "enable_cost_optimization" {
  description = "Enable cost optimization features"
  type        = bool
  default     = true
}

variable "schedule_downtime" {
  description = "Schedule for non-production environment downtime (cron format)"
  type        = string
  default     = "0 22 * * 1-5"  # 10 PM weekdays
}

# Compliance and Governance
variable "compliance_tags" {
  description = "Additional tags for compliance and governance"
  type        = map(string)
  default     = {}
}

variable "data_classification" {
  description = "Data classification level"
  type        = string
  default     = "internal"
  
  validation {
    condition     = contains(["public", "internal", "confidential", "restricted"], var.data_classification)
    error_message = "Data classification must be one of: public, internal, confidential, restricted."
  }
}

