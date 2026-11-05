use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::{AppHandle, Manager, State};

pub const MAX_RECENT: usize = 10;
pub const MENU_FILE_PREFIX: &str = "recent-file:";
pub const MENU_DIRECTORY_PREFIX: &str = "recent-directory:";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub kind: String,
}

impl RecentEntry {
    pub fn label(&self) -> String {
        if self.kind == "directory" {
            return self.path.clone();
        }
        match Path::new(&self.path).parent().and_then(Path::file_name) {
            Some(parent) => format!("{}/{}", parent.to_string_lossy(), self.name),
            None => self.name.clone(),
        }
    }
}

#[derive(Default)]
pub struct RecentState(pub RwLock<Vec<RecentEntry>>);

pub fn push_entry(entries: &mut Vec<RecentEntry>, entry: RecentEntry) {
    entries.retain(|existing| existing.path != entry.path);
    entries.insert(0, entry);
    entries.truncate(MAX_RECENT);
}

pub fn read_entries(file: &Path) -> Vec<RecentEntry> {
    fs::read_to_string(file)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<RecentEntry>>(&raw).ok())
        .map(|mut entries| {
            entries.retain(|entry| !entry.path.is_empty() && matches!(entry.kind.as_str(), "file" | "directory"));
            entries.truncate(MAX_RECENT);
            entries
        })
        .unwrap_or_default()
}

pub fn write_entries(file: &Path, entries: &[RecentEntry]) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut raw = serde_json::to_string_pretty(entries).map_err(|error| error.to_string())?;
    raw.push('\n');
    fs::write(file, raw).map_err(|error| error.to_string())
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map(|dir| dir.join("recent.json")).map_err(|error| error.to_string())
}

fn refresh_menu(app: &AppHandle, entries: &[RecentEntry]) {
    if let Ok(menu) = crate::build_menu(app, entries) {
        let _ = app.set_menu(menu);
    }
}

#[tauri::command]
pub fn record_recent(
    app: AppHandle,
    path: String,
    kind: String,
    state: State<'_, RecentState>,
) -> Result<(), String> {
    if kind != "file" && kind != "directory" {
        return Err("Unknown recent entry type.".into());
    }
    let canonical = Path::new(&path).canonicalize().map_err(|_| "The selected path does not exist.".to_string())?;
    if kind == "file" {
        let supported = matches!(canonical.extension().and_then(|value| value.to_str()), Some("json" | "sse"));
        if !canonical.is_file() || !supported {
            return Err("Only JSON and SSE files can be recorded.".into());
        }
    } else if !canonical.is_dir() {
        return Err("The selected path is not a directory.".into());
    }
    let name = canonical
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| canonical.to_string_lossy().into_owned());
    let mut entries = state.0.read().map_err(|_| "Recent list lock failed.".to_string())?.clone();
    push_entry(&mut entries, RecentEntry {
        path: canonical.to_string_lossy().into_owned(),
        name,
        kind,
    });
    write_entries(&store_path(&app)?, &entries)?;
    *state.0.write().map_err(|_| "Recent list lock failed.".to_string())? = entries.clone();
    refresh_menu(&app, &entries);
    Ok(())
}

#[tauri::command]
pub fn clear_recent(app: AppHandle, state: State<'_, RecentState>) -> Result<(), String> {
    write_entries(&store_path(&app)?, &[])?;
    state.0.write().map_err(|_| "Recent list lock failed.".to_string())?.clear();
    refresh_menu(&app, &[]);
    Ok(())
}

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let file = store_path(app.handle()).map_err(std::io::Error::other)?;
    let entries = read_entries(&file);
    app.manage(RecentState(RwLock::new(entries.clone())));
    app.set_menu(crate::build_menu(app.handle(), &entries)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, kind: &str) -> RecentEntry {
        RecentEntry { path: path.into(), name: Path::new(path).file_name().unwrap().to_string_lossy().into_owned(), kind: kind.into() }
    }

    #[test]
    fn pushes_new_entries_to_the_front_and_dedupes() {
        let mut entries = vec![entry("/a/one.json", "file"), entry("/a/two.json", "file")];
        push_entry(&mut entries, entry("/a/one.json", "file"));
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "/a/one.json");
    }

    #[test]
    fn caps_the_list() {
        let mut entries = Vec::new();
        for index in 0..MAX_RECENT + 3 {
            push_entry(&mut entries, entry(&format!("/a/{index}.json"), "file"));
        }
        assert_eq!(entries.len(), MAX_RECENT);
        assert_eq!(entries[0].path, format!("/a/{}.json", MAX_RECENT + 2));
    }

    #[test]
    fn saves_and_loads_entries() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("config").join("recent.json");
        let entries = vec![entry("/a/one.json", "file"), entry("/a/folder", "directory")];
        write_entries(&file, &entries).unwrap();
        assert_eq!(read_entries(&file), entries);
    }

    #[test]
    fn ignores_missing_or_malformed_store() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("recent.json");
        assert!(read_entries(&file).is_empty());
        fs::write(&file, "not json").unwrap();
        assert!(read_entries(&file).is_empty());
        fs::write(&file, "[{\"path\":\"\",\"name\":\"x\",\"kind\":\"file\"}]").unwrap();
        assert!(read_entries(&file).is_empty());
    }

    #[test]
    fn labels_files_with_their_parent_folder() {
        assert_eq!(entry("/home/user/request.json", "file").label(), "user/request.json");
        assert_eq!(entry("/home/user/work", "directory").label(), "/home/user/work");
    }
}
