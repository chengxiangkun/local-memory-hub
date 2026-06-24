// Local Memory Hub 桌面运行时。
//
// 生产态 sidecar:启动时拉起本地 API/Web(node local-cli start),等 Web 就绪后建窗口
// 加载 http://127.0.0.1:3100;退出时停服务。打包出的 .app/.exe 可"双击即用"。
//
// 运行时解析(优先自包含,回退开发态):
//   - 自包含:打进包内的 resources/runtime/(含 node 二进制 + 工程 + node_modules),
//     由 apps/desktop/stage-runtime.mjs 在构建前组装。脱离仓库也能跑。
//   - 开发态:LMH_NODE / 系统 node + LMH_HOME / 编译期仓库根。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const WEB_ADDR: &str = "127.0.0.1:3100";
const WEB_URL: &str = "http://127.0.0.1:3100";

// 解析后的 (node 可执行路径, 工程根目录),启动时确定一次,供 start/stop 共用。
static RUNTIME: OnceLock<(String, String)> = OnceLock::new();

fn node_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn dev_repo_root() -> String {
    if let Ok(home) = std::env::var("LMH_HOME") {
        return home;
    }
    let manifest = env!("CARGO_MANIFEST_DIR"); // <repo>/apps/desktop/src-tauri
    Path::new(manifest)
        .join("../../..")
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| manifest.to_string())
}

fn dev_node_bin() -> String {
    if let Ok(node) = std::env::var("LMH_NODE") {
        return node;
    }
    for candidate in ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
        if Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "node".to_string()
}

// 优先用打进包内的自包含运行时;否则回退到开发态。
fn resolve_runtime(app: &tauri::App) -> (String, String) {
    if let Ok(res) = app.path().resource_dir() {
        let rt = res.join("runtime");
        let node = rt.join(node_name());
        if node.exists() {
            return (
                node.to_string_lossy().to_string(),
                rt.to_string_lossy().to_string(),
            );
        }
    }
    (dev_node_bin(), dev_repo_root())
}

fn local_cli(arg: &str, wait: bool) {
    let (node, root) = RUNTIME
        .get()
        .cloned()
        .unwrap_or_else(|| (dev_node_bin(), dev_repo_root()));
    let mut cmd = Command::new(&node);
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
            let _ = RUNTIME.set(resolve_runtime(app));
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
