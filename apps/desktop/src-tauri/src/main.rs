// Local Memory Hub 桌面运行时。
//
// 生产态 sidecar:应用启动时拉起本地 API/Web 服务(node local-cli start),等待 Web
// 就绪后再创建窗口加载 http://127.0.0.1:3100;退出时停掉服务。这样打包出的 .app 可
// "双击即用",无需先手动起服务。
//
// 路径解析(GUI 启动时 PATH 精简,需显式定位):
//   - node:LMH_NODE 环境变量 → 常见绝对路径 → "node"
//   - 仓库根:LMH_HOME 环境变量 → 编译期 CARGO_MANIFEST_DIR 上溯三级
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::Command;
use std::time::Duration;
use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

const WEB_ADDR: &str = "127.0.0.1:3100";
const WEB_URL: &str = "http://127.0.0.1:3100";

fn repo_root() -> String {
    if let Ok(home) = std::env::var("LMH_HOME") {
        return home;
    }
    let manifest = env!("CARGO_MANIFEST_DIR"); // <repo>/apps/desktop/src-tauri
    std::path::Path::new(manifest)
        .join("../../..")
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| manifest.to_string())
}

fn node_bin() -> String {
    if let Ok(node) = std::env::var("LMH_NODE") {
        return node;
    }
    for candidate in ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "node".to_string()
}

fn local_cli(arg: &str, wait: bool) {
    let root = repo_root();
    let mut cmd = Command::new(node_bin());
    cmd.arg(format!("{}/apps/api/src/local-cli.js", root))
        .arg(arg)
        .current_dir(&root);
    if wait {
        let _ = cmd.status();
    } else {
        let _ = cmd.spawn();
    }
}

fn wait_web_ready(timeout_secs: u64) {
    for _ in 0..(timeout_secs * 2) {
        if TcpStream::connect(WEB_ADDR).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            local_cli("start", false); // 后台拉起 API + Web
            wait_web_ready(20);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(WEB_URL.parse().unwrap()))
                .title("Local Memory Hub")
                .inner_size(1280.0, 860.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Local Memory Hub 桌面应用构建失败")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                local_cli("stop", true); // 退出时停掉本地服务
            }
        });
}
