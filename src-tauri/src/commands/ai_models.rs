//! The AI page's on-device models (local_ai.rs): list, download, delete,
//! choose.

use crate::local_ai::{self, AiModelInfo};
use tauri::AppHandle;

/// Whether this Mac can run on-device models (Apple silicon).
#[tauri::command]
#[specta::specta]
pub fn ai_models_supported() -> bool {
    local_ai::supported()
}

#[tauri::command]
#[specta::specta]
pub fn list_ai_models(app: AppHandle) -> Vec<AiModelInfo> {
    local_ai::list(&app)
}

#[tauri::command]
#[specta::specta]
pub async fn download_ai_model(app: AppHandle, id: String) -> Result<(), String> {
    local_ai::download(app, id).await
}

#[tauri::command]
#[specta::specta]
pub fn cancel_ai_model_download(id: String) {
    local_ai::cancel(&id);
}

#[tauri::command]
#[specta::specta]
pub fn delete_ai_model(app: AppHandle, id: String) -> Result<(), String> {
    local_ai::delete(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn set_active_ai_model(app: AppHandle, id: String) -> Result<(), String> {
    local_ai::set_active(&app, &id)
}

/// This Mac's memory in GB, for the "fits this Mac" hint.
#[tauri::command]
#[specta::specta]
pub fn mac_memory_gb() -> u64 {
    local_ai::memory_gb()
}
