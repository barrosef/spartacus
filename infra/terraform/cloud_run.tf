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

      liveness_probe {
        http_get {
          path = "/health"
        }
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name = "MAILERSEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.mailersend_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.backend,
    google_secret_manager_secret.mailersend_api_key,
  ]
}

# Override da Org Policy para permitir allUsers neste projeto.
# A autenticação real é feita pelo Firebase Auth no nível da aplicação FastAPI.
resource "google_project_organization_policy" "allow_all_iam_members" {
  project    = var.project_id
  constraint = "constraints/iam.allowedPolicyMemberDomains"

  list_policy {
    allow {
      all = true
    }
  }

  depends_on = [google_project_service.apis]
}

# Permite acesso público (auth é feita pelo Firebase no nível da aplicação)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [google_project_organization_policy.allow_all_iam_members]
}
