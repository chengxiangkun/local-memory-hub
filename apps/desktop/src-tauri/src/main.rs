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

use std::fs::{self, File, OpenOptions};
use std::io::Write as _;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

// 启动后后台检查更新:发现新版自动下载安装,完成后重启应用。
// 失败(离线/无更新/未配置)静默忽略,绝不影响启动。数据目录独立,升级不丢数据。
async fn check_for_updates(app: tauri::AppHandle) {
    let Ok(updater) = app.updater() else { return };
    match updater.check().await {
        Ok(Some(update)) => {
            if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                app.restart();
            }
        }
        _ => {}
    }
}

const WEB_ADDR: &str = "127.0.0.1:3100";
const WEB_URL: &str = "http://127.0.0.1:3100";

// 启动诊断:把关键步骤写到 <数据目录>/startup.log。即使 node 从未启动也会留下证据,
// 用于排查"双击无反应 / 拒绝连接"——能看出找了哪些 runtime 路径、node 在不在、spawn 成没成。
fn diag_data_dir() -> PathBuf {
    if let Ok(d) = std::env::var("LMH_DATA_DIR") {
        return PathBuf::from(d);
    }
    if cfg!(windows) {
        let base = std::env::var("APPDATA").unwrap_or_default();
        Path::new(&base).join("LocalMemoryHub")
    } else if cfg!(target_os = "macos") {
        let home = std::env::var("HOME").unwrap_or_default();
        Path::new(&home)
            .join("Library")
            .join("Application Support")
            .join("LocalMemoryHub")
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        Path::new(&home).join(".local").join("share").join("local-memory-hub")
    }
}

fn diag_log(msg: &str) {
    let dir = diag_data_dir();
    let _ = fs::create_dir_all(&dir);
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("startup.log"))
    {
        let _ = writeln!(f, "[{}] {}", secs, msg);
    }
}

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
// 在多个候选位置找 runtime/node(不同平台/打包器布局不同),逐个记日志,首个命中即用。
fn resolve_runtime(app: &tauri::App) -> (String, String) {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        diag_log(&format!("resource_dir = {}", res.display()));
        candidates.push(res.join("runtime"));
        candidates.push(res.join("resources").join("runtime"));
        if let Some(parent) = res.parent() {
            candidates.push(parent.join("runtime"));
        }
    } else {
        diag_log("resource_dir() unavailable");
    }
    if let Ok(exe) = std::env::current_exe() {
        diag_log(&format!("current_exe = {}", exe.display()));
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("runtime"));
            candidates.push(dir.join("resources").join("runtime"));
        }
    }
    for rt in &candidates {
        let node = rt.join(node_name());
        let exists = node.exists();
        diag_log(&format!("candidate: {} (node exists={})", node.display(), exists));
        if exists {
            return (
                node.to_string_lossy().to_string(),
                rt.to_string_lossy().to_string(),
            );
        }
    }
    diag_log("no bundled runtime found → fallback to dev node");
    (dev_node_bin(), dev_repo_root())
}

fn local_cli(arg: &str, wait: bool) {
    let (node, root) = RUNTIME
        .get()
        .cloned()
        .unwrap_or_else(|| (dev_node_bin(), dev_repo_root()));
    let script = format!("{}/apps/api/src/local-cli.js", root);
    diag_log(&format!(
        "local_cli({}): node={} script={} script_exists={}",
        arg,
        node,
        script,
        Path::new(&script).exists()
    ));
    let mut cmd = Command::new(&node);
    cmd.arg(&script).arg(arg).current_dir(&root);
    // 把 node 侧输出(含崩溃栈)落到 <数据目录>/local-cli-<arg>.log,便于排查 Windows 起不来。
    let _ = fs::create_dir_all(diag_data_dir());
    if let Ok(f) = File::create(diag_data_dir().join(format!("local-cli-{}.log", arg))) {
        if let Ok(f2) = f.try_clone() {
            cmd.stdout(Stdio::from(f)).stderr(Stdio::from(f2));
        }
    }
    if wait {
        match cmd.status() {
            Ok(s) => diag_log(&format!("local_cli({}) exit code = {:?}", arg, s.code())),
            Err(e) => diag_log(&format!("local_cli({}) spawn ERROR: {}", arg, e)),
        }
    } else {
        match cmd.spawn() {
            Ok(child) => diag_log(&format!("local_cli({}) spawned pid = {}", arg, child.id())),
            Err(e) => diag_log(&format!("local_cli({}) spawn ERROR: {}", arg, e)),
        }
    }
}

fn wait_web_ready(timeout_secs: u64) -> bool {
    for _ in 0..(timeout_secs * 2) {
        if TcpStream::connect(WEB_ADDR).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            diag_log("=== startup begin ===");
            let _ = RUNTIME.set(resolve_runtime(app));
            if let Some((n, r)) = RUNTIME.get() {
                diag_log(&format!("RUNTIME node={} root={}", n, r));
            }
            local_cli("start", false); // 后台拉起 API + Web
            let ready = wait_web_ready(40);
            diag_log(&format!("wait_web_ready(40) = {}", ready));
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(WEB_URL.parse().unwrap()))
                .title("Local Memory Hub")
                .inner_size(1280.0, 860.0)
                .resizable(true)
                .build()?;
            // 服务启动较慢时(首次/慢机器),窗口可能先显示"拒绝连接";
            // 后台继续等待,服务就绪后自动重载窗口,避免用户看到错误页。
            if !ready {
                let win = window.clone();
                tauri::async_runtime::spawn(async move {
                    for _ in 0..120 {
                        std::thread::sleep(Duration::from_millis(500));
                        if TcpStream::connect(WEB_ADDR).is_ok() {
                            let _ = win.eval("location.reload()");
                            break;
                        }
                    }
                });
            }
            // 后台检查更新(不阻塞启动)
            tauri::async_runtime::spawn(check_for_updates(app.handle().clone()));
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
