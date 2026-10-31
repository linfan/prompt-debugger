use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct WorkspaceState(pub Mutex<Option<PathBuf>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    name: String,
    path: String,
    full_path: String,
    kind: String,
    children: Vec<WorkspaceNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    root: String,
    name: String,
    tree: Vec<WorkspaceNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub path: String,
    pub full_path: String,
    pub name: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    pub path: Option<String>,
    pub full_path: String,
    pub name: String,
}

fn supported_file(path: &Path) -> bool {
    matches!(path.extension().and_then(|value| value.to_str()), Some("json" | "sse"))
}

fn relative_path(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map_err(|_| "Path is outside the workspace.".to_string())?
        .to_str()
        .map(|value| value.replace('\\', "/"))
        .ok_or_else(|| "Path is not valid UTF-8.".to_string())
}

fn scan_directory(root: &Path, directory: &Path) -> Result<Vec<WorkspaceNode>, String> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(directory).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let kind = if metadata.is_dir() {
            "directory"
        } else if metadata.is_file() && supported_file(&path) {
            "file"
        } else {
            continue;
        };
        let children = if metadata.is_dir() {
            scan_directory(root, &path)?
        } else {
            Vec::new()
        };
        nodes.push(WorkspaceNode {
            name: name.to_string_lossy().into_owned(),
            path: relative_path(root, &path)?,
            full_path: path.to_string_lossy().into_owned(),
            kind: kind.into(),
            children,
        });
    }
    nodes.sort_by(|a, b| {
        (a.kind != "directory", a.name.to_lowercase()).cmp(&(b.kind != "directory", b.name.to_lowercase()))
    });
    Ok(nodes)
}

fn snapshot(root: &Path) -> Result<WorkspaceSnapshot, String> {
    Ok(WorkspaceSnapshot {
        root: root.to_string_lossy().into_owned(),
        name: root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into_owned(),
        tree: scan_directory(root, root)?,
    })
}

fn validate_relative(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path.is_absolute() || path.as_os_str().is_empty() {
        return Err("A non-empty relative path is required.".into());
    }
    if !path.components().all(|part| matches!(part, Component::Normal(_))) {
        return Err("Path traversal is not allowed.".into());
    }
    Ok(path.to_path_buf())
}

fn existing_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = validate_relative(relative)?;
    let candidate = root.join(relative);
    let metadata = fs::symlink_metadata(&candidate).map_err(|_| "The selected path does not exist.".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not supported.".into());
    }
    let canonical = candidate.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(root) {
        return Err("Path is outside the workspace.".into());
    }
    Ok(canonical)
}

fn parent_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() {
        return Ok(root.to_path_buf());
    }
    let path = existing_path(root, relative)?;
    if !path.is_dir() {
        return Err("The parent is not a directory.".into());
    }
    Ok(path)
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', '\0'])
        && !name.starts_with('.')
}

fn current_root(state: &State<WorkspaceState>) -> Result<PathBuf, String> {
    state.0.lock().map_err(|_| "Workspace lock failed.".to_string())?
        .clone().ok_or_else(|| "No workspace is open.".to_string())
}

#[tauri::command]
pub fn open_workspace(root: String, state: State<WorkspaceState>) -> Result<WorkspaceSnapshot, String> {
    let root = Path::new(&root).canonicalize().map_err(|_| "Directory does not exist.".to_string())?;
    if !root.is_dir() {
        return Err("Select a directory, not a file.".into());
    }
    let result = snapshot(&root)?;
    *state.0.lock().map_err(|_| "Workspace lock failed.".to_string())? = Some(root);
    Ok(result)
}

#[tauri::command]
pub fn list_workspace(state: State<WorkspaceState>) -> Result<WorkspaceSnapshot, String> {
    snapshot(&current_root(&state)?)
}

#[tauri::command]
pub fn close_workspace(state: State<WorkspaceState>) -> Result<(), String> {
    *state.0.lock().map_err(|_| "Workspace lock failed.".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn read_workspace_file(path: String, state: State<WorkspaceState>) -> Result<WorkspaceFile, String> {
    let root = current_root(&state)?;
    let file = existing_path(&root, &path)?;
    if !file.is_file() || !supported_file(&file) {
        return Err("Only JSON and SSE files can be opened.".into());
    }
    Ok(WorkspaceFile {
        path,
        full_path: file.to_string_lossy().into_owned(),
        name: file.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        content: fs::read_to_string(file).map_err(|error| error.to_string())?,
    })
}

#[tauri::command]
pub fn write_request_file(path: String, content: String, state: State<WorkspaceState>) -> Result<(), String> {
    let root = current_root(&state)?;
    let file = existing_path(&root, &path)?;
    if !file.is_file() || file.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err("Requests can only be saved to JSON files.".into());
    }
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    if !value.is_object() {
        return Err("A request must be a JSON object.".into());
    }
    fs::write(file, content).map_err(|error| error.to_string())
}

fn write_response_file(root: Option<&Path>, raw_path: &str, content: &str) -> Result<SavedFile, String> {
    let target = Path::new(raw_path);
    if !target.is_absolute() {
        return Err("An absolute save path is required.".into());
    }
    let name = target.file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Enter a valid file name.".to_string())?
        .to_string();
    match target.extension().and_then(|value| value.to_str()) {
        Some("json") => {
            serde_json::from_str::<serde_json::Value>(content)
                .map_err(|error| format!("Response is not valid JSON: {error}"))?;
        }
        Some("sse") => {}
        _ => return Err("Save responses as .json or .sse files.".into()),
    }
    let parent = target.parent()
        .ok_or_else(|| "Invalid save path.".to_string())?
        .canonicalize()
        .map_err(|_| "The save directory does not exist.".to_string())?;
    if !parent.is_dir() {
        return Err("The save directory does not exist.".into());
    }
    let file = parent.join(&name);
    if fs::symlink_metadata(&file).map(|metadata| metadata.file_type().is_symlink()).unwrap_or(false) {
        return Err("Symbolic links are not supported.".into());
    }
    fs::write(&file, content).map_err(|error| error.to_string())?;
    let relative = root
        .and_then(|root| file.strip_prefix(root).ok())
        .map(|path| path.to_string_lossy().replace('\\', "/"));
    Ok(SavedFile {
        path: relative,
        full_path: file.to_string_lossy().into_owned(),
        name,
    })
}

#[tauri::command]
pub fn save_response_file(path: String, content: String, state: State<WorkspaceState>) -> Result<SavedFile, String> {
    let root = state.0.lock().map_err(|_| "Workspace lock failed.".to_string())?.clone();
    write_response_file(root.as_deref(), &path, &content)
}

#[tauri::command]
pub fn create_workspace_entry(
    parent: String,
    name: String,
    kind: String,
    state: State<WorkspaceState>,
) -> Result<WorkspaceSnapshot, String> {
    let root = current_root(&state)?;
    if !valid_name(&name) {
        return Err("Enter a valid name without path separators.".into());
    }
    let parent_path = parent_path(&root, &parent)?;
    let target = parent_path.join(&name);
    if target.exists() {
        return Err("An entry with this name already exists.".into());
    }
    match kind.as_str() {
        "directory" => fs::create_dir(&target).map_err(|error| error.to_string())?,
        "file" => {
            if !supported_file(&target) {
                return Err("Files must use a .json or .sse extension.".into());
            }
            let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&target)
                .map_err(|error| error.to_string())?;
            if target.extension().and_then(|value| value.to_str()) == Some("json") {
                file.write_all(b"{}\n").map_err(|error| error.to_string())?;
            }
        }
        _ => return Err("Unknown entry type.".into()),
    }
    snapshot(&root)
}

#[tauri::command]
pub fn rename_workspace_entry(
    path: String,
    new_name: String,
    state: State<WorkspaceState>,
) -> Result<WorkspaceSnapshot, String> {
    let root = current_root(&state)?;
    if !valid_name(&new_name) {
        return Err("Enter a valid name without path separators.".into());
    }
    let source = existing_path(&root, &path)?;
    if source.is_file() && !supported_file(Path::new(&new_name)) {
        return Err("Files must keep a .json or .sse extension.".into());
    }
    let target = source.parent().ok_or_else(|| "Invalid parent directory.".to_string())?.join(new_name);
    if target.exists() {
        return Err("An entry with this name already exists.".into());
    }
    fs::rename(source, target).map_err(|error| error.to_string())?;
    snapshot(&root)
}

#[tauri::command]
pub fn delete_workspace_entry(path: String, state: State<WorkspaceState>) -> Result<WorkspaceSnapshot, String> {
    let root = current_root(&state)?;
    let target = existing_path(&root, &path)?;
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|error| error.to_string())?;
    } else {
        fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    snapshot(&root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        assert!(existing_path(&root, "../outside").is_err());
        assert!(existing_path(&root, "/etc/passwd").is_err());
        assert!(validate_relative("").is_err());
    }

    #[test]
    fn scans_only_supported_files_and_manages_entries() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        fs::write(root.join("request.json"), "{}").unwrap();
        fs::write(root.join("notes.txt"), "hidden").unwrap();
        fs::create_dir(root.join("empty")).unwrap();
        let tree = scan_directory(&root, &root).unwrap();
        assert_eq!(tree.len(), 2);
        assert!(tree.iter().all(|node| node.name != "notes.txt"));
        let request = tree.iter().find(|node| node.name == "request.json").unwrap();
        assert!(request.full_path.ends_with("request.json"));
        assert!(Path::new(&request.full_path).is_absolute());
        assert!(existing_path(&root, "request.json").unwrap().is_file());
        fs::rename(root.join("request.json"), root.join("renamed.sse")).unwrap();
        assert!(existing_path(&root, "renamed.sse").unwrap().is_file());
        fs::remove_file(root.join("renamed.sse")).unwrap();
        assert!(existing_path(&root, "renamed.sse").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_links() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        std::os::unix::fs::symlink("/etc/passwd", root.join("link.json")).unwrap();
        assert!(existing_path(&root, "link.json").is_err());
    }

    #[test]
    fn saves_responses_and_validates_content() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let saved = write_response_file(Some(&root), root.join("response.json").to_str().unwrap(), "{\"choices\":[]}").unwrap();
        assert_eq!(saved.path.as_deref(), Some("response.json"));
        assert!(saved.full_path.ends_with("response.json"));
        assert!(root.join("response.json").is_file());
        assert!(write_response_file(Some(&root), root.join("bad.json").to_str().unwrap(), "not json").is_err());
        assert!(write_response_file(Some(&root), root.join("bad.txt").to_str().unwrap(), "{}").is_err());
        let outside = tempfile::tempdir().unwrap();
        let outside_root = outside.path().canonicalize().unwrap();
        let saved = write_response_file(Some(&root), outside_root.join("response.sse").to_str().unwrap(), "data: {}\n\n").unwrap();
        assert!(saved.path.is_none());
        assert!(outside_root.join("response.sse").is_file());
    }
}
