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
