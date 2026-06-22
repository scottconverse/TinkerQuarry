use crate::types::Diagnostic;
use std::sync::Mutex;
use tauri::State;

// Global state for editor content (used by history system)
pub struct EditorState {
    pub current_code: Mutex<String>,
    pub diagnostics: Mutex<Vec<Diagnostic>>,
    pub working_dir: Mutex<Option<String>>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            current_code: Mutex::new(
                "// Type your OpenSCAD code here\ncube([10, 10, 10]);".to_string(),
            ),
            diagnostics: Mutex::new(Vec::new()),
            working_dir: Mutex::new(None),
        }
    }
}

/// Update editor state with current code (called when user types)
#[tauri::command]
pub fn update_editor_state(code: String, state: State<'_, EditorState>) -> Result<(), String> {
    *state.current_code.lock().unwrap() = code;
    Ok(())
}

/// Update working directory in editor state (called when file is opened/saved)
#[tauri::command]
pub fn update_working_dir(
    working_dir: Option<String>,
    state: State<'_, EditorState>,
) -> Result<(), String> {
    *state.working_dir.lock().unwrap() = working_dir;
    Ok(())
}
