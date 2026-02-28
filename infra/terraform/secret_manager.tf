resource "google_secret_manager_secret" "mailersend_api_key" {
  project   = var.project_id
  secret_id = "MAILERSEND_API_KEY"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Permite que o Cloud Run SA leia o secret em runtime
resource "google_secret_manager_secret_iam_member" "cloud_run_read_mailersend" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.mailersend_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}
