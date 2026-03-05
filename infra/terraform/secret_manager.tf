resource "google_secret_manager_secret" "mailersend_api_key" {
  project   = var.project_id
  secret_id = "MAILERSEND_API_KEY"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Versão inicial com valor placeholder — evita erro no Cloud Run ao referenciar "latest".
# Substitua pelo valor real sem alterar o Terraform:
#   echo -n "mlsn.suachave" | gcloud secrets versions add MAILERSEND_API_KEY \
#     --project=spartacus-artes-marciais --data-file=-
resource "google_secret_manager_secret_version" "mailersend_api_key_placeholder" {
  secret      = google_secret_manager_secret.mailersend_api_key.id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    # Impede que o Terraform sobrescreva o valor real após o primeiro apply
    ignore_changes = [secret_data]
  }
}

# Permite que o Cloud Run SA leia o secret em runtime
resource "google_secret_manager_secret_iam_member" "cloud_run_read_mailersend" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.mailersend_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}
