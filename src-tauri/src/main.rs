#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter};

mod workspace;
mod api;
mod recent;

fn recent_menu(app: &AppHandle, entries: &[recent::RecentEntry]) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let mut builder = SubmenuBuilder::new(app, "Open Recent");
    if entries.is_empty() {
        let empty = MenuItemBuilder::with_id("recent-empty", "No Recent Items").enabled(false).build(app)?;
        builder = builder.item(&empty);
    } else {
        for entry in entries {
            let prefix = if entry.kind == "directory" { recent::MENU_DIRECTORY_PREFIX } else { recent::MENU_FILE_PREFIX };
            let item = MenuItemBuilder::with_id(format!("{prefix}{}", entry.path), entry.label()).build(app)?;
            builder = builder.item(&item);
        }
    }
    let clear = MenuItemBuilder::with_id("clear-recent", "Clear Recent").build(app)?;
    builder.separator().item(&clear).build()
}

fn build_menu(app: &AppHandle, recent_entries: &[recent::RecentEntry]) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let app_menu = SubmenuBuilder::new(app, "Prompt Debugger")
        .about(Some(AboutMetadata {
            name: Some("Prompt Debugger".into()),
            version: Some("0.2.0".into()),
            comments: Some("A focused workbench for debugging model prompts.".into()),
            ..Default::default()
        }))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let open = MenuItemBuilder::with_id("open-directory", "Open Directory…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let recent_submenu = recent_menu(app, recent_entries)?;
    let save = MenuItemBuilder::with_id("save", "Save Request")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let close = MenuItemBuilder::with_id("close-workspace", "Close Workspace")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&recent_submenu)
        .item(&save)
        .separator()
        .item(&close)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let sidebar = MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let next_tab = MenuItemBuilder::with_id("next-tab", "Next Tab")
        .accelerator("Ctrl+Tab")
        .build(app)?;
    let previous_tab = MenuItemBuilder::with_id("previous-tab", "Previous Tab")
        .accelerator("Ctrl+Shift+Tab")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&sidebar)
        .separator()
        .item(&next_tab)
        .item(&previous_tab)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let help = MenuItemBuilder::with_id("help", "Prompt Debugger Help").build(app)?;
    let help_menu = SubmenuBuilder::new(app, "Help").item(&help).build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
        .build()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(workspace::WorkspaceState::default())
        .manage(api::ApiState::default())
        .invoke_handler(tauri::generate_handler![
            workspace::open_workspace,
            workspace::list_workspace,
            workspace::close_workspace,
            workspace::read_workspace_file,
            workspace::write_request_file,
            workspace::save_response_file,
            workspace::create_workspace_entry,
            workspace::rename_workspace_entry,
            workspace::delete_workspace_entry,
            recent::record_recent,
            recent::clear_recent,
            api::send_chat_completion,
            api::cancel_chat_completion,
        ])
        .setup(|app| {
            recent::install(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("native-menu", event.id().as_ref());
        })
        .run(tauri::generate_context!())
        .expect("error while running Prompt Debugger");
}
