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

// 启动动画页:写到 <数据目录>/splash.html,返回其 file:// URL。
// 窗口先加载它(秒开,显示 spinner + 文案 + 已等待秒数),后端就绪后再切到真实界面,
// 避免"打开后一片空白干等"。
fn splash_url() -> Option<tauri::Url> {
    let dir = diag_data_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("splash.html");
    let html = r#"<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0e1116;color:#e9eef2;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
.box{text-align:center}
.logo{width:76px;height:76px;border-radius:20px;background:#15a06b;margin:0 auto 22px;display:flex;align-items:center;justify-content:center;font-size:38px;box-shadow:0 8px 30px rgba(21,160,107,.35)}
h1{font-size:20px;margin:0 0 8px;font-weight:600}
p{margin:0;color:#9aa8b7;font-size:13px}
.spin{width:32px;height:32px;border:3px solid rgba(52,211,153,.22);border-top-color:#34d399;border-radius:50%;margin:20px auto 0;animation:r .8s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}
small{color:#5b6876;font-size:12px}
</style></head><body><div class="box">
<div class="logo">📖</div>
<h1>Local Memory Hub</h1>
<p id="msg">正在启动本地服务,请稍候…</p>
<div class="spin"></div>
<p style="margin-top:16px"><small id="t"></small></p>
<script>let s=0;setInterval(function(){s++;var t=document.getElementById('t');if(t)t.textContent='已等待 '+s+' 秒';},1000);</script>
</div></body></html>"#;
    if fs::write(&path, html).is_ok() {
        return tauri::Url::from_file_path(&path).ok();
    }
    None
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
        .map(|p| strip_verbatim(&p).to_string_lossy().to_string())
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

// 去掉 Windows 的 \\?\ verbatim 扩展路径前缀。
// resource_dir()/canonicalize() 在 Windows 返回 \\?\ 路径,它只认反斜杠、不做归一化;
// 一旦后续拼接出正斜杠就成非法路径(node 解析主模块会一路 lstat 到盘符报 EISDIR)。
fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    p.to_path_buf()
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
                strip_verbatim(&node).to_string_lossy().to_string(),
                strip_verbatim(rt).to_string_lossy().to_string(),
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
    // 按组件 join(用平台正确分隔符),不要手拼正斜杠 —— 否则在 Windows \\?\ 路径上会拼出非法路径。
    let script = Path::new(&root)
        .join("apps")
        .join("api")
        .join("src")
        .join("local-cli.js")
        .to_string_lossy()
        .to_string();
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
    // Windows:隐藏 node 子进程的控制台黑窗(CREATE_NO_WINDOW=0x08000000)。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            diag_log("=== startup begin ===");
            let _ = RUNTIME.set(resolve_runtime(app));
            if let Some((n, r)) = RUNTIME.get() {
                diag_log(&format!("RUNTIME node={} root={}", n, r));
            }
            // 立即建窗口并显示启动动画(秒开,不再空白干等);找不到 splash 时直接指向真实地址。
            let start_url = splash_url()
                .unwrap_or_else(|| WEB_URL.parse().expect("WEB_URL 解析失败"));
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(start_url))
                .title("Local Memory Hub")
                .inner_size(1280.0, 860.0)
                .resizable(true)
                .build()?;

            local_cli("start", false); // 后台拉起 API + Web

            // 后台轮询:服务就绪 → 切到真实界面;超时 → 在动画页上给明确提示。
            let win = window.clone();
            tauri::async_runtime::spawn(async move {
                let mut ready = false;
                for _ in 0..240 {
                    // 最多 ~120s
                    std::thread::sleep(Duration::from_millis(500));
                    if TcpStream::connect(WEB_ADDR).is_ok() {
                        ready = true;
                        break;
                    }
                }
                diag_log(&format!("web ready = {}", ready));
                if ready {
                    let _ = win.eval(&format!("window.location.replace('{}')", WEB_URL));
                } else {
                    let _ = win.eval(
                        "var m=document.getElementById('msg');\
                         if(m){m.textContent='启动超时:本地服务未就绪。请重启应用;若仍失败,把数据目录下的 startup.log / local-cli-start.log 发给作者。';m.style.color='#f87171';}\
                         var sp=document.querySelector('.spin'); if(sp) sp.style.display='none';",
                    );
                }
            });

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
