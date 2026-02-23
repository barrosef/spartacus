resource "google_cloud_run_v2_service" "backend" {
  project  = var.project_id
  name     = "spartacus-backend"
  location = var.region

  # allow_unauthenticated = true é configurado via IAM binding abaixo
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      max_instance_count = 3
    }

    containers {
      # Imagem placeholder — será atualizada pelo pipeline CI/CD no primeiro deploy
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # CPU alocada apenas durante requisições (free tier friendly)
        cpu_idle = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.backend,
  ]
}

# Permite acesso público (auth é feita pelo Firebase no nível da aplicação)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
