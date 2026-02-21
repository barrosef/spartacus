resource "google_artifact_registry_repository" "backend" {
  provider = google

  project       = var.project_id
  location      = var.region
  repository_id = "spartacus-backend"
  description   = "Imagens Docker do backend Spartacus"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}
