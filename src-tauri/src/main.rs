#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

mod workspace;
mod api;

fn build_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let app_menu = SubmenuBuilder::new(app, "Prompt Editor")
        .about(Some(AboutMetadata {
            name: Some("Prompt Editor".into()),
            version: Some("0.1.0".into()),
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
    let save = MenuItemBuilder::with_id("save", "Save Request")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let close = MenuItemBuilder::with_id("close-workspace", "Close Workspace")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open)
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
    let request = MenuItemBuilder::with_id("show-request", "Request")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let response = MenuItemBuilder::with_id("show-response", "Response")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&sidebar)
        .separator()
        .item(&request)
        .item(&response)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    let help = MenuItemBuilder::with_id("help", "Prompt Editor Help").build(app)?;
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
            workspace::create_workspace_entry,
            workspace::rename_workspace_entry,
            workspace::delete_workspace_entry,
            api::send_chat_completion,
            api::cancel_chat_completion,
        ])
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("native-menu", event.id().as_ref());
        })
        .run(tauri::generate_context!())
        .expect("error while running Prompt Editor");
}
