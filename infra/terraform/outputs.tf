output "backend_url" {
  description = "URL pública do serviço Cloud Run"
  value       = google_cloud_run_v2_service.backend.uri
}

output "artifact_registry_repo" {
  description = "URL do repositório Artifact Registry"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.name}"
}

output "wif_provider" {
  description = "Resource name completo do Workload Identity Pool Provider (usar como WIF_PROVIDER no GitHub)"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_actions_sa" {
  description = "Email da Service Account usada pelo GitHub Actions (usar como WIF_SERVICE_ACCOUNT no GitHub)"
  value       = google_service_account.github_actions.email
}

output "cloud_run_sa" {
  description = "Email da Service Account do Cloud Run"
  value       = google_service_account.cloud_run.email
}

output "firebase_hosting_url" {
  description = "URL padrão do Firebase Hosting (antes do domínio customizado)"
  value       = "https://${var.project_id}.web.app"
}
