#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewWindow};

struct BackendProcess(Mutex<Option<Child>>);

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 8765;

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

fn backend_ready() -> bool {
    let address = format!("{BACKEND_HOST}:{BACKEND_PORT}");
    let Ok(mut stream) = TcpStream::connect_timeout(
        &address.parse().expect("valid loopback address"),
        Duration::from_millis(350),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let request = b"GET /api/summary HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }
    let mut body = String::new();
    let _ = stream.read_to_string(&mut body);
    let _ = stream.shutdown(Shutdown::Both);
    body.contains("200") && body.contains("voice-hub")
}

fn spawn_backend(
    resource_dir: Option<PathBuf>,
    data_dir: PathBuf,
) -> Result<Option<Child>, String> {
    if backend_ready() {
        return Ok(None);
    }

    let mut command;
    if let Ok(path) = std::env::var("VOICE_HUB_DESKTOP_BACKEND") {
        command = Command::new(path);
    } else if cfg!(debug_assertions) {
        let venv_python = project_root()
            .join("backend")
            .join(".venv")
            .join("Scripts")
            .join("python.exe");
        let mut command = Command::new(if venv_python.is_file() {
            venv_python.as_os_str()
        } else {
            std::ffi::OsStr::new("python")
        });
        command
            .arg("-m")
            .arg("uvicorn")
            .arg("app.main:app")
            .arg("--app-dir")
            .arg(project_root().join("backend"));
        return command
            .arg("--host")
            .arg(BACKEND_HOST)
            .arg("--port")
            .arg(BACKEND_PORT.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(Some)
            .map_err(|error| format!("无法启动 Voice Hub 后端：{error}"));
    } else {
        let root = resource_dir.ok_or_else(|| "找不到桌面版资源目录".to_string())?;
        let runtime = root.join("backend-runtime");
        let frontend = runtime.join("frontend").join("dist");
        command = Command::new(runtime.join("VoiceHub.exe"));
        std::fs::create_dir_all(&data_dir)
            .map_err(|error| format!("无法创建桌面版数据目录：{error}"))?;
        command
            .env("VOICE_HUB_DESKTOP_ROOT", &data_dir)
            .env("VOICE_STUDIO_FRONTEND_DIST", frontend);
    }

    command
        .arg("--port")
        .arg(BACKEND_PORT.to_string())
        .arg("--no-browser")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if cfg!(debug_assertions) {
        command.current_dir(project_root());
    }

    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x08000000);

    command
        .spawn()
        .map(Some)
        .map_err(|error| format!("无法启动 Voice Hub 后端：{error}"))
}

fn reveal_when_ready(window: WebviewWindow) {
    thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if backend_ready() {
                let _ = window.show();
                let _ = window.set_focus();
                return;
            }
            thread::sleep(Duration::from_millis(250));
        }
        // Show the window even when the backend reports an error so the user can see it.
        let _ = window.show();
        let _ = window.set_focus();
    });
}

fn stop_backend(state: &BackendProcess) {
    let Ok(mut child) = state.0.lock() else {
        return;
    };
    if let Some(mut child) = child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir = app.path().resource_dir().ok();
            let data_dir = app.path().app_data_dir()?;
            let child = spawn_backend(resource_dir, data_dir).map_err(std::io::Error::other)?;
            app.manage(BackendProcess(Mutex::new(child)));
            if let Some(window) = app.get_webview_window("main") {
                reveal_when_ready(window);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Voice Hub desktop shell")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(state) = app.try_state::<BackendProcess>() {
                    stop_backend(&state);
                }
            }
        });
}
