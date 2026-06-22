// Local Memory Hub 桌面运行时。
// dev: tauri 通过 beforeDevCommand 启动本地 API/Web 服务,窗口加载 http://127.0.0.1:3100。
// 退出 dev 时 tauri 会终止 beforeDevCommand 启动的进程树,完成服务清理。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Local Memory Hub 桌面应用启动失败");
}
