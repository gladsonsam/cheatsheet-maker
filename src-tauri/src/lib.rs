use chrono::{DateTime, Utc};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};
use tauri::{AppHandle, Emitter, Manager};

const FOLDER_NAME: &str = "Cheatsheets";
const META_FILE: &str = ".cheatsheet-meta.json";

/// A cheatsheet as seen by the frontend. `id` and `name` are both the file's
/// stem (the file name without the `.md` extension) — identity is the file on
/// disk, which keeps things predictable when files are edited externally.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheatsheetFile {
    id: String,
    name: String,
    content: String,
    created_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    toolbar_settings: Option<Value>,
}

/// Sidecar metadata for a single cheatsheet. Stored in `.cheatsheet-meta.json`
/// keyed by file stem so the `.md` files themselves stay pure markdown.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetaEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    toolbar_settings: Option<Value>,
}

type MetaMap = HashMap<String, MetaEntry>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    dir: String,
}

/// Holds the filesystem watcher alive for the lifetime of the app.
#[allow(dead_code)]
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

fn storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|error| format!("Failed to resolve Documents directory: {error}"))?
        .join(FOLDER_NAME);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create storage directory: {error}"))?;
    Ok(dir)
}

fn meta_path(dir: &Path) -> PathBuf {
    dir.join(META_FILE)
}

fn read_meta(dir: &Path) -> MetaMap {
    let path = meta_path(dir);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_meta(dir: &Path, meta: &MetaMap) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(meta)
        .map_err(|error| format!("Failed to serialize metadata: {error}"))?;
    fs::write(meta_path(dir), raw).map_err(|error| format!("Failed to write metadata: {error}"))
}

/// Turn an arbitrary cheatsheet name into a safe file stem.
fn sanitize_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Resolve a unique stem within `dir`, ignoring `ignore` (used when renaming so
/// a file does not collide with itself).
fn unique_stem(dir: &Path, desired: &str, ignore: Option<&str>) -> String {
    let base = sanitize_stem(desired);
    let exists = |stem: &str| {
        if Some(stem) == ignore {
            return false;
        }
        dir.join(format!("{stem}.md")).exists()
    };

    if !exists(&base) {
        return base;
    }
    let mut counter = 2;
    loop {
        let candidate = format!("{base} ({counter})");
        if !exists(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}

fn system_time_to_rfc3339(time: SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}

fn file_path(dir: &Path, stem: &str) -> PathBuf {
    dir.join(format!("{stem}.md"))
}

fn read_one(dir: &Path, stem: &str, meta: &MetaMap) -> Result<CheatsheetFile, String> {
    let path = file_path(dir, stem);
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {stem}.md: {error}"))?;
    let metadata = fs::metadata(&path).ok();

    let updated_at = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .map(system_time_to_rfc3339)
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    let entry = meta.get(stem);
    let created_at = entry
        .and_then(|e| e.created_at.clone())
        .or_else(|| {
            metadata
                .as_ref()
                .and_then(|m| m.created().ok())
                .map(system_time_to_rfc3339)
        })
        .unwrap_or_else(|| updated_at.clone());

    Ok(CheatsheetFile {
        id: stem.to_string(),
        name: stem.to_string(),
        content,
        created_at,
        updated_at,
        toolbar_settings: entry.and_then(|e| e.toolbar_settings.clone()),
    })
}

#[tauri::command]
fn get_storage_info(app: AppHandle) -> Result<StorageInfo, String> {
    let dir = storage_dir(&app)?;
    Ok(StorageInfo {
        dir: dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn load_files(app: AppHandle) -> Result<Vec<CheatsheetFile>, String> {
    let dir = storage_dir(&app)?;
    let meta = read_meta(&dir);

    let mut files = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|error| format!("Failed to read storage directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        match read_one(&dir, stem, &meta) {
            Ok(file) => files.push(file),
            Err(error) => eprintln!("Skipping {stem}: {error}"),
        }
    }

    files.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(files)
}

#[tauri::command]
fn create_file(
    app: AppHandle,
    name: String,
    content: String,
    toolbar_settings: Option<Value>,
) -> Result<CheatsheetFile, String> {
    let dir = storage_dir(&app)?;
    let stem = unique_stem(&dir, &name, None);
    fs::write(file_path(&dir, &stem), &content)
        .map_err(|error| format!("Failed to create {stem}.md: {error}"))?;

    let mut meta = read_meta(&dir);
    meta.insert(
        stem.clone(),
        MetaEntry {
            created_at: Some(Utc::now().to_rfc3339()),
            toolbar_settings,
        },
    );
    write_meta(&dir, &meta)?;

    read_one(&dir, &stem, &meta)
}

#[tauri::command]
fn save_file(
    app: AppHandle,
    id: String,
    content: String,
    toolbar_settings: Option<Value>,
) -> Result<(), String> {
    let dir = storage_dir(&app)?;
    let stem = sanitize_stem(&id);
    fs::write(file_path(&dir, &stem), content)
        .map_err(|error| format!("Failed to save {stem}.md: {error}"))?;

    let mut meta = read_meta(&dir);
    let entry = meta.entry(stem).or_default();
    if entry.created_at.is_none() {
        entry.created_at = Some(Utc::now().to_rfc3339());
    }
    if toolbar_settings.is_some() {
        entry.toolbar_settings = toolbar_settings;
    }
    write_meta(&dir, &meta)
}

#[tauri::command]
fn rename_file(app: AppHandle, id: String, new_name: String) -> Result<CheatsheetFile, String> {
    let dir = storage_dir(&app)?;
    let old_stem = sanitize_stem(&id);
    let new_stem = unique_stem(&dir, &new_name, Some(&old_stem));

    if old_stem != new_stem {
        fs::rename(file_path(&dir, &old_stem), file_path(&dir, &new_stem))
            .map_err(|error| format!("Failed to rename file: {error}"))?;

        let mut meta = read_meta(&dir);
        if let Some(entry) = meta.remove(&old_stem) {
            meta.insert(new_stem.clone(), entry);
        }
        write_meta(&dir, &meta)?;
    }

    let meta = read_meta(&dir);
    read_one(&dir, &new_stem, &meta)
}

#[tauri::command]
fn delete_file(app: AppHandle, id: String) -> Result<(), String> {
    let dir = storage_dir(&app)?;
    let stem = sanitize_stem(&id);
    let path = file_path(&dir, &stem);
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Failed to delete file: {error}"))?;
    }

    let mut meta = read_meta(&dir);
    if meta.remove(&stem).is_some() {
        write_meta(&dir, &meta)?;
    }
    Ok(())
}

#[tauri::command]
fn open_storage_dir(app: AppHandle) -> Result<(), String> {
    let dir = storage_dir(&app)?;
    open_in_file_manager(&dir)
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(path).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(path).spawn();

    result
        .map(|_| ())
        .map_err(|error| format!("Failed to open folder: {error}"))
}

/// One-time migration from the previous app-data storage layout
/// (`<app_data>/files.json` + `content/<id>.md`) into the new
/// Documents/Cheatsheets folder of named markdown files.
fn migrate_legacy_storage(app: &AppHandle, dir: &Path) {
    // Only migrate into an empty folder so we never clobber real files.
    let already_populated = fs::read_dir(dir)
        .map(|mut entries| {
            entries.any(|entry| {
                entry
                    .ok()
                    .map(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false);
    if already_populated {
        return;
    }

    let Ok(app_data) = app.path().app_data_dir() else {
        return;
    };
    let index_path = app_data.join("files.json");
    let Ok(raw) = fs::read_to_string(&index_path) else {
        return;
    };
    let Ok(records) = serde_json::from_str::<Vec<Value>>(&raw) else {
        return;
    };

    let mut meta = read_meta(dir);
    for record in records {
        let Some(id) = record.get("id") else { continue };
        let id_str = match id {
            Value::Number(n) => n.to_string(),
            Value::String(s) => s.clone(),
            _ => continue,
        };
        let name = record
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("Untitled");
        let legacy_content = app_data.join("content").join(format!("{id_str}.md"));
        let content = fs::read_to_string(&legacy_content).unwrap_or_default();

        let stem = unique_stem(dir, name, None);
        if fs::write(file_path(dir, &stem), content).is_ok() {
            meta.insert(
                stem,
                MetaEntry {
                    created_at: record
                        .get("createdAt")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    toolbar_settings: record.get("toolbarSettings").cloned(),
                },
            );
        }
    }
    let _ = write_meta(dir, &meta);
}

fn start_watcher(app: &AppHandle, dir: &Path) -> Result<RecommendedWatcher, String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        ) {
            return;
        }
        // Ignore changes that only touch our sidecar metadata file.
        let only_meta = !event.paths.is_empty()
            && event.paths.iter().all(|p| {
                p.file_name().and_then(|n| n.to_str()) == Some(META_FILE)
            });
        if only_meta {
            return;
        }
        let _ = handle.emit("cheatsheets-changed", ());
    })
    .map_err(|error| format!("Failed to create file watcher: {error}"))?;

    watcher
        .watch(dir, RecursiveMode::NonRecursive)
        .map_err(|error| format!("Failed to watch storage directory: {error}"))?;
    Ok(watcher)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            if let Ok(dir) = storage_dir(handle) {
                migrate_legacy_storage(handle, &dir);
                match start_watcher(handle, &dir) {
                    Ok(watcher) => {
                        app.manage(WatcherState(Mutex::new(Some(watcher))));
                    }
                    Err(error) => eprintln!("File watcher disabled: {error}"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_storage_info,
            load_files,
            create_file,
            save_file,
            rename_file,
            delete_file,
            open_storage_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
