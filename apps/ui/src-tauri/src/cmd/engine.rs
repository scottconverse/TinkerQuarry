use serde::Serialize;
use std::{
    env,
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

    let engine_bin = resolve_engine_binary(&app)?;
    let out_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve TinkerQuarry app data directory: {e}"))?
        .join("engine-output");
    std::fs::create_dir_all(&out_dir).map_err(|e| {
        format!(
            "Could not create engine output directory {}: {e}",
            out_dir.display()
        )
    })?;

    let port = reserve_loopback_port()?;
    let session_token = Uuid::new_v4().to_string();
    let api_base_url = format!("http://127.0.0.1:{port}/api");

    let child = Command::new(&engine_bin)
        .arg("web")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--out")
        .arg(&out_dir)
        .env("TINKERQUARRY_DEV_TOKEN", &session_token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            format!(
                "Could not start KimCad engine at {}: {e}",
                engine_bin.display()
            )
        })?;

    let info = EngineInfo {
        api_base_url,
        session_token,
    };
    if !health_ready(&info.api_base_url, Duration::from_secs(30)) {
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        return Err(
            "KimCad engine started but did not become healthy within 30 seconds.".to_string(),
        );
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

fn resolve_engine_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("TINKERQUARRY_ENGINE_BIN").map(PathBuf::from) {
        if is_executable_candidate(&path) {
            return Ok(path);
        }
        return Err(format!(
            "TINKERQUARRY_ENGINE_BIN points to a missing engine binary: {}",
            path.display()
        ));
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

    candidates
        .into_iter()
        .find(|path| is_executable_candidate(path))
        .or_else(|| Some(PathBuf::from("kimcad")))
        .ok_or_else(|| "Could not locate the KimCad engine binary.".to_string())
}

fn engine_binary_names() -> Vec<&'static str> {
    if cfg!(windows) {
        vec!["kimcad.exe", "kimcad.cmd", "kimcad.bat"]
    } else {
        vec!["kimcad"]
    }
}

fn is_executable_candidate(path: &Path) -> bool {
    path.is_file()
}
