variable "project_id" {
  type        = string
  description = "ID do projeto GCP"
}

variable "region" {
  type        = string
  default     = "us-east1"
  description = "Região padrão GCP (São Paulo)"
}

variable "github_repo" {
  type        = string
  description = "Repositório GitHub no formato 'org/repo' (ex: acme/spartacus)"
}
