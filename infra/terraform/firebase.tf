resource "google_firebase_project" "spartacus" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.apis]
}

resource "google_firestore_database" "default" {
  provider = google-beta
  project  = var.project_id

  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_firebase_project.spartacus]
}

# ─── Firebase Auth (Identity Toolkit) ─────────────────────────────────────────
# Habilita o Firebase Auth via Identity Platform.
# O Google Sign-In como provider OAuth é ativado no Firebase Console
# (Authentication → Sign-in method → Google) — operação única, não requer Terraform.
resource "google_identity_platform_config" "auth" {
  provider = google-beta
  project  = var.project_id

  sign_in {
    allow_duplicate_emails = false
  }

  depends_on = [
    google_firebase_project.spartacus,
    google_project_service.apis,
  ]
}

# ─── Firebase Hosting ──────────────────────────────────────────────────────────
resource "google_firebase_hosting_site" "backoffice" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.project_id

  depends_on = [google_firebase_project.spartacus]
}
