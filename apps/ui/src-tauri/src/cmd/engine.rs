use serde::Serialize;
use std::{
    env,
    fs::OpenOptions,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Default)]
pub struct EngineState {
    runtime: Mutex<Option<EngineRuntime>>,
}

struct EngineRuntime {
    info: EngineInfo,
    _child: EngineProcess,
}

struct EngineProcess {
    child: Child,
}

impl Drop for EngineProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    api_base_url: String,
    session_token: String,
}

struct EngineLaunch {
    program: PathBuf,
    prefix_args: Vec<String>,
    install_root: Option<PathBuf>,
}

#[tauri::command]
pub fn ensure_engine(app: AppHandle, state: State<'_, EngineState>) -> Result<EngineInfo, String> {
    let mut guard = state
        .runtime
        .lock()
        .map_err(|_| "Engine state lock is poisoned.".to_string())?;
    if let Some(runtime) = guard.as_ref() {
        if health_ready(&runtime.info.api_base_url, Duration::from_millis(300)) {
            return Ok(runtime.info.clone());
        }
    }

    let engine_launch = resolve_engine_launch(&app)?;
    let out_dir = if let Some(path) = env::var_os("TINKERQUARRY_APPDATA_DIR").map(PathBuf::from) {
        path
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("Could not resolve TinkerQuarry app data directory: {e}"))?
    }
    .join("engine-output");
    std::fs::create_dir_all(&out_dir).map_err(|e| {
        format!(
            "Could not create engine output directory {}: {e}",
            out_dir.display()
        )
    })?;
    let log_path = out_dir.join("engine.log");
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Could not open engine log {}: {e}", log_path.display()))?;
    let err_log = log.try_clone().map_err(|e| {
        format!(
            "Could not prepare engine stderr log {}: {e}",
            log_path.display()
        )
    })?;

    let port = reserve_loopback_port()?;
    let session_token = Uuid::new_v4().to_string();
    let api_base_url = format!("http://127.0.0.1:{port}/api");

    let mut command = Command::new(&engine_launch.program);
    command.args(&engine_launch.prefix_args);
    if let Some(root) = &engine_launch.install_root {
        command.current_dir(root);
        command.env("KIMCAD_INSTALL_ROOT", root);
    }
    command
        .arg("web")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--out")
        .arg(&out_dir);
    if env::var_os("TINKERQUARRY_ENGINE_DEMO").is_some() {
        command.arg("--demo");
    }
    let child = command
        .env("TINKERQUARRY_DEV_TOKEN", &session_token)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(err_log))
        .spawn()
        .map_err(|e| {
            format!(
                "Could not start KimCad engine at {}: {e}. Engine log: {}",
                engine_launch.program.display(),
                log_path.display()
            )
        })?;

    let info = EngineInfo {
        api_base_url,
        session_token,
    };
    // ENG-START (release-gate #4): the health budget is generous BUT a dead engine fails
    // fast. A cold first start — freshly written site-packages (post-install or post-build
    // staging), antivirus scanning every file as python imports it, a loaded or slow disk —
    // legitimately exceeds the old hard 30 s kill (the release gate's runtime smoke hit
    // exactly that right after the NSIS build; a user's first post-install launch is the
    // same case). Waiting the full budget on a process that already DIED is the opposite
    // error, so each poll first checks whether the child has exited and fails immediately
    // with the log tail when it has.
    let mut child = child;
    let start_deadline = Instant::now() + Duration::from_secs(120);
    loop {
        if health_ready(&info.api_base_url, Duration::from_millis(500)) {
            break;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "KimCad engine exited during startup ({status}). Engine log: {} — tail:\n{}",
                log_path.display(),
                log_tail(&log_path, 2048)
            ));
        }
        if Instant::now() >= start_deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "KimCad engine started but did not become healthy within 120 seconds. Engine log: {}",
                log_path.display()
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    *guard = Some(EngineRuntime {
        info: info.clone(),
        _child: EngineProcess { child },
    });
    Ok(info)
}

fn reserve_loopback_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Could not reserve a loopback port for the engine: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not read reserved engine port: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn health_ready(api_base_url: &str, timeout: Duration) -> bool {
    let Some(addr) = api_base_url
        .strip_prefix("http://")
        .and_then(|rest| rest.strip_suffix("/api"))
        .and_then(|host_port| host_port.parse::<SocketAddr>().ok())
    else {
        return false;
    };

    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(200)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
            if stream
                .write_all(
                    b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                )
                .is_ok()
            {
                let mut response = [0_u8; 64];
                if let Ok(n) = stream.read(&mut response) {
                    if response[..n].starts_with(b"HTTP/1.0 200")
                        || response[..n].starts_with(b"HTTP/1.1 200")
                    {
                        return true;
                    }
                }
            }
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// Last `max_bytes` of the engine log, for a startup-death error message — the log is the
/// only place the crashed python's traceback lives (stdout+stderr both redirect there).
fn log_tail(path: &Path, max_bytes: usize) -> String {
    let Ok(bytes) = std::fs::read(path) else {
        return String::from("<unreadable>");
    };
    let start = bytes.len().saturating_sub(max_bytes);
    String::from_utf8_lossy(&bytes[start..]).into_owned()
}

fn resolve_engine_launch(app: &AppHandle) -> Result<EngineLaunch, String> {
    if let Some(path) = env::var_os("TINKERQUARRY_ENGINE_BIN").map(PathBuf::from) {
        if is_executable_candidate(&path) {
            return Ok(EngineLaunch {
                program: path,
                prefix_args: Vec::new(),
                install_root: None,
            });
        }
        return Err(format!(
            "TINKERQUARRY_ENGINE_BIN points to a missing engine binary: {}",
            path.display()
        ));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(launch) = staged_engine_launch(&resource_dir) {
            return Ok(launch);
        }
        if !cfg!(debug_assertions) {
            return Err(format!(
                "Packaged TinkerQuarry is missing its bundled engine resource under {}. Reinstall TinkerQuarry or rebuild the installer.",
                resource_dir.join("engine").display()
            ));
        }
    } else if !cfg!(debug_assertions) {
        return Err("Packaged TinkerQuarry could not resolve its resource directory.".to_string());
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.extend(engine_binary_names().into_iter().flat_map(|name| {
            [
                resource_dir.join(name),
                resource_dir.join("engine").join(name),
                resource_dir.join("bin").join(name),
            ]
        }));
    }

    if let Ok(cwd) = env::current_dir() {
        for ancestor in cwd.ancestors().take(6) {
            candidates.extend(engine_binary_names().into_iter().map(|name| {
                ancestor
                    .join("packages")
                    .join("engine")
                    .join(".venv")
                    .join("Scripts")
                    .join(name)
            }));
            candidates.extend(engine_binary_names().into_iter().map(|name| {
                ancestor
                    .join("packages")
                    .join("engine")
                    .join(".venv")
                    .join("bin")
                    .join(name)
            }));
        }
    }

    if let Some(program) = candidates
        .into_iter()
        .find(|path| is_executable_candidate(path))
    {
        return Ok(EngineLaunch {
            program,
            prefix_args: Vec::new(),
            install_root: None,
        });
    }

    if cfg!(debug_assertions) {
        Ok(EngineLaunch {
            program: PathBuf::from("kimcad"),
            prefix_args: Vec::new(),
            install_root: None,
        })
    } else {
        Err(
            "Packaged TinkerQuarry could not find its bundled engine. Reinstall TinkerQuarry or rebuild the installer.".to_string(),
        )
    }
}

fn staged_engine_launch(resource_dir: &Path) -> Option<EngineLaunch> {
    let engine_dir = resource_dir.join("engine");
    let launcher = engine_dir.join("kimcad_launcher.py");
    if !launcher.is_file() {
        return None;
    }
    for python in python_binary_names() {
        let program = engine_dir.join("python").join(python);
        if program.is_file() {
            return Some(EngineLaunch {
                program,
                prefix_args: vec![launcher.to_string_lossy().to_string()],
                install_root: Some(engine_dir),
            });
        }
    }
    None
}

fn engine_binary_names() -> Vec<&'static str> {
    if cfg!(windows) {
        vec!["kimcad.exe", "kimcad.cmd", "kimcad.bat"]
    } else {
        vec!["kimcad"]
    }
}

fn python_binary_names() -> Vec<&'static str> {
    if cfg!(windows) {
        vec!["python.exe", "pythonw.exe"]
    } else {
        vec!["python"]
    }
}

fn is_executable_candidate(path: &Path) -> bool {
    path.is_file()
}
