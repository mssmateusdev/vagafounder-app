use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};

/// Guarda o item "Pausar/Retomar" para atualizar o texto quando o estado muda.
pub struct TrayHandles {
    pub pause: MenuItem<Wry>,
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn set_pause_label(app: &AppHandle, paused: bool) {
    if let Some(h) = app.try_state::<TrayHandles>() {
        let _ = h.pause.set_text(if paused { "Retomar Monitoramento" } else { "Pausar Monitoramento" });
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir Painel", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pausar Monitoramento", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "Verificar Vagas Agora", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &check, &sep, &quit])?;
    app.manage(TrayHandles { pause: pause.clone() });

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("VagaFounder - Monitor de Vagas")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "pause" => crate::toggle_paused(app),
            "check" => crate::request_check(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }
            | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => show_main(tray.app_handle()),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
