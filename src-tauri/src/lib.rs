mod sources;
mod tray;
mod util;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::{Notify, Semaphore};
use util::{dedupe_sort, Scope};

/// Intervalo entre varreduras automáticas.
const CHECK_INTERVAL_MIN: i64 = 15;
/// Termos usados quando não há nenhum filtro ativo.
const DEFAULT_KEYWORDS: &[&str] = &["Jovem Aprendiz", "Auxiliar Administrativo", "Estágio", "Recursos Humanos", "Suporte TI", "Atendimento"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub title: String,
    pub company: String,
    /// Texto pronto para exibição: "Cidade (Modalidade)".
    pub location: String,
    pub city: String,
    /// "Presencial" | "Híbrido" | "Remoto"
    pub modality: String,
    pub r#type: String,
    pub published_at: String,
    pub url: String,
    /// "gupy" | "linkedin" | "indeed"
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub id: String,
    pub keyword: String,
    pub location: String,
    pub r#type: String,
    pub time_window: String,
    #[serde(default = "default_true")]
    pub active: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub source: String,
    pub ok: bool,
    pub count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorStatus {
    pub paused: bool,
    pub muted: bool,
    pub scanning: bool,
    pub next_check_at: Option<String>,
    pub last_check_at: Option<String>,
    pub sources: Vec<SourceStatus>,
}

pub struct AppState {
    filters: Mutex<Vec<Filter>>,
    notified_ids: Mutex<HashSet<String>>,
    cached_jobs: Mutex<Vec<Job>>,
    sources: Mutex<Vec<SourceStatus>>,
    paused: AtomicBool,
    muted: AtomicBool,
    scanning: AtomicBool,
    next_check_at: Mutex<Option<DateTime<Utc>>>,
    last_check_at: Mutex<Option<DateTime<Utc>>>,
    /// Acorda o worker (tray "Verificar agora" / retomar).
    wake: Notify,
    /// Impede varreduras simultâneas.
    scan_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    fn status(&self) -> MonitorStatus {
        MonitorStatus {
            paused: self.paused.load(Ordering::SeqCst),
            muted: self.muted.load(Ordering::SeqCst),
            scanning: self.scanning.load(Ordering::SeqCst),
            next_check_at: self.next_check_at.lock().unwrap().map(|d| d.to_rfc3339()),
            last_check_at: self.last_check_at.lock().unwrap().map(|d| d.to_rfc3339()),
            sources: self.sources.lock().unwrap().clone(),
        }
    }
}

fn emit_status(app: &AppHandle) {
    let _ = app.emit("monitor-status", app.state::<AppState>().status());
}

// ---------------- VARREDURA ----------------

/// Lista de buscas (palavra-chave + escopo) a partir de TODOS os filtros ativos.
fn queries(filters: &[Filter]) -> Vec<(String, Scope)> {
    let mut seen = HashSet::new();
    let mut out: Vec<(String, Scope)> = filters
        .iter()
        .filter(|f| f.active && !f.keyword.trim().is_empty())
        .map(|f| (f.keyword.trim().to_string(), Scope::from_location(&f.location)))
        .filter(|(k, s)| seen.insert(format!("{}|{:?}", util::norm(k), s)))
        .collect();
    if out.is_empty() {
        out = DEFAULT_KEYWORDS.iter().map(|k| (k.to_string(), Scope::Metro)).collect();
    }
    out
}

fn summarize(source: &str, results: Vec<Result<Vec<Job>, String>>, all: &mut Vec<Job>) -> SourceStatus {
    let mut count = 0;
    let mut errors = Vec::new();
    let total = results.len();
    for r in results {
        match r {
            Ok(jobs) => {
                count += jobs.len();
                all.extend(jobs);
            }
            Err(e) => errors.push(e),
        }
    }
    SourceStatus {
        source: source.into(),
        ok: errors.len() < total,
        count,
        error: errors.into_iter().next(),
    }
}

async fn scan(app: &AppHandle, custom_keyword: Option<String>) -> Vec<Job> {
    let state = app.state::<AppState>();
    let _guard = state.scan_lock.lock().await;
    state.scanning.store(true, Ordering::SeqCst);
    emit_status(app);

    let qs: Vec<(String, Scope)> = if let Some(ref kw) = custom_keyword {
        let trimmed = kw.trim();
        if !trimmed.is_empty() {
            vec![(trimmed.to_string(), Scope::Metro)]
        } else {
            queries(&state.filters.lock().unwrap().clone())
        }
    } else {
        queries(&state.filters.lock().unwrap().clone())
    };

    let client = sources::client();
    let sem = Semaphore::new(6);

    // 1. Executa primeiro as fontes HTTP rápidas (Gupy + LinkedIn) em paralelo
    let gupy_f = futures::future::join_all(qs.iter().map(|(k, s)| sources::gupy::search(&client, &sem, k, s)));
    let li_f = futures::future::join_all(qs.iter().map(|(k, s)| sources::linkedin::search(&client, &sem, k, s)));
    let (gupy_res, li_res) = tokio::join!(gupy_f, li_f);

    let mut all = Vec::new();
    let mut statuses = vec![
        summarize("gupy", gupy_res, &mut all),
        summarize("linkedin", li_res, &mut all),
    ];

    // Se houve busca com termo personalizado, preserva o histórico de vagas já encontradas
    if custom_keyword.is_some() {
        let cached = state.cached_jobs.lock().unwrap().clone();
        all.extend(cached);
    }

    let mid_jobs = dedupe_sort(all.clone());
    *state.cached_jobs.lock().unwrap() = mid_jobs.clone();
    *state.sources.lock().unwrap() = statuses.clone();
    // Emite IMEDIATAMENTE para o frontend! O usuário já vê as vagas em 1-2 segundos!
    let _ = app.emit("jobs-updated", &mid_jobs);
    emit_status(app);

    // 2. Executa Indeed de forma não-bloqueante com timeout curto
    let mut indeed_results = Vec::new();
    for (k, s) in &qs {
        let r = sources::indeed::search(app, k, s).await;
        let blocked = r.as_ref().err().is_some_and(|e| e.contains("bloque") || e.contains("anti-rob") || e.contains("tempo"));
        indeed_results.push(r);
        if blocked {
            break; // não insiste se o Indeed bloquear/der timeout
        }
    }
    statuses.push(summarize("indeed", indeed_results, &mut all));
    let final_jobs = dedupe_sort(all);

    // Notifica somente vagas novas (na primeira varredura apenas registra, para não inundar).
    let fresh: Vec<Job> = {
        let mut notified = state.notified_ids.lock().unwrap();
        let first_run = notified.is_empty();
        let fresh: Vec<Job> = final_jobs.iter().filter(|j| notified.insert(j.id.clone())).cloned().collect();
        if first_run { Vec::new() } else { fresh }
    };
    if !fresh.is_empty() && !state.muted.load(Ordering::SeqCst) {
        let (title, body) = if fresh.len() == 1 {
            (format!("Nova vaga: {}", fresh[0].title), format!("{} • {}", fresh[0].company, fresh[0].location))
        } else {
            (format!("{} novas vagas encontradas", fresh.len()), fresh.iter().take(3).map(|j| j.title.as_str()).collect::<Vec<_>>().join(" • "))
        };
        let _ = app.notification().builder().title(title).body(body).show();
    }

    *state.cached_jobs.lock().unwrap() = final_jobs.clone();
    *state.sources.lock().unwrap() = statuses;
    *state.last_check_at.lock().unwrap() = Some(Utc::now());
    state.scanning.store(false, Ordering::SeqCst);
    let _ = app.emit("jobs-updated", &final_jobs);
    emit_status(app);
    final_jobs
}

fn start_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let state = app.state::<AppState>();
            if !state.paused.load(Ordering::SeqCst) {
                scan(&app, None).await;
            }
            let next = Utc::now() + ChronoDuration::minutes(CHECK_INTERVAL_MIN);
            *state.next_check_at.lock().unwrap() = (!state.paused.load(Ordering::SeqCst)).then_some(next);
            emit_status(&app);
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_MIN as u64 * 60)) => {}
                _ = state.wake.notified() => {}
            }
        }
    });
}

/// Chamado pelo tray: dispara uma varredura imediata no worker.
pub fn request_check(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.paused.store(false, Ordering::SeqCst);
    tray::set_pause_label(app, false);
    state.wake.notify_one();
}

fn apply_paused(app: &AppHandle, paused: bool) {
    let state = app.state::<AppState>();
    state.paused.store(paused, Ordering::SeqCst);
    tray::set_pause_label(app, paused);
    if paused {
        *state.next_check_at.lock().unwrap() = None;
        emit_status(app);
    } else {
        state.wake.notify_one();
    }
}

pub fn toggle_paused(app: &AppHandle) {
    let paused = !app.state::<AppState>().paused.load(Ordering::SeqCst);
    apply_paused(app, paused);
}

// ---------------- COMANDOS ----------------

#[tauri::command]
fn get_jobs(state: State<'_, AppState>) -> Vec<Job> {
    state.cached_jobs.lock().unwrap().clone()
}

#[tauri::command]
async fn scan_now(app: AppHandle, keyword: Option<String>) -> Result<Vec<Job>, String> {
    Ok(scan(&app, keyword).await)
}

#[tauri::command]
async fn fetch_jobs(app: AppHandle, keyword: Option<String>) -> Result<Vec<Job>, String> {
    Ok(scan(&app, keyword).await)
}

#[tauri::command]
fn get_status(state: State<'_, AppState>) -> MonitorStatus {
    state.status()
}

#[tauri::command]
fn set_paused(app: AppHandle, paused: bool) {
    apply_paused(&app, paused);
}

#[tauri::command]
fn set_muted(app: AppHandle, muted: bool) {
    app.state::<AppState>().muted.store(muted, Ordering::SeqCst);
    emit_status(&app);
}

#[tauri::command]
fn get_filters(state: State<'_, AppState>) -> Vec<Filter> {
    state.filters.lock().unwrap().clone()
}

#[tauri::command]
fn save_filter(filter: Filter, state: State<'_, AppState>) -> Vec<Filter> {
    let mut filters = state.filters.lock().unwrap();
    match filters.iter().position(|f| f.id == filter.id) {
        Some(i) => filters[i] = filter,
        None => filters.push(filter),
    }
    filters.clone()
}

#[tauri::command]
fn delete_filter(id: String, state: State<'_, AppState>) -> Vec<Filter> {
    let mut filters = state.filters.lock().unwrap();
    filters.retain(|f| f.id != id);
    filters.clone()
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = url.replace("&amp;", "&");
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("URL inválida".into());
    }
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_job_description(app: AppHandle, id: String, _url: String, source: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    // 1. Se já estiver no cache (ex: Gupy ou buscado anteriormente), devolve imediatamente
    if let Some(cached) = state.cached_jobs.lock().unwrap().iter().find(|j| j.id == id) {
        if let Some(ref d) = cached.description {
            if !d.trim().is_empty() {
                return Ok(d.clone());
            }
        }
    }

    let client = sources::client();
    let s = source.to_lowercase();
    if s.contains("linkedin") {
        let li_id = id.strip_prefix("li-").unwrap_or(&id);
        let detail_url = format!("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{li_id}");
        let resp = client.get(&detail_url).send().await.map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            let html = resp.text().await.unwrap_or_default();
            if let Some(start_idx) = html.find("show-more-less-html__markup") {
                if let Some(tag_close) = html[start_idx..].find('>') {
                    let body_start = start_idx + tag_close + 1;
                    if let Some(body_end) = html[body_start..].find("</div>") {
                        let desc_html = html[body_start..body_start + body_end].trim().to_string();
                        if let Some(cached) = state.cached_jobs.lock().unwrap().iter_mut().find(|j| j.id == id) {
                            cached.description = Some(desc_html.clone());
                        }
                        return Ok(desc_html);
                    }
                }
            }
        }
        return Err("Não foi possível carregar a descrição completa do LinkedIn no momento.".into());
    } else if s.contains("gupy") {
        return Err("Descrição não disponibilizada nesta vaga pela empresa no Gupy.".into());
    } else if s.contains("indeed") {
        return Err("O Indeed requer validação direta na plataforma. Acesse o link oficial para conferir a descrição completa.".into());
    }

    Err("Fonte sem suporte a extração sob demanda.".into())
}

fn initial_filters() -> Vec<Filter> {
    let loc = "Recife (até 80 km)";
    [
        ("1", "Jovem Aprendiz", "Jovem Aprendiz"),
        ("2", "Auxiliar Administrativo", "CLT"),
        ("3", "Estágio", "Estágio"),
        ("4", "Recursos Humanos", "CLT"),
        ("5", "Suporte TI", "CLT"),
        ("6", "Atendimento", "CLT"),
    ]
    .into_iter()
    .map(|(id, kw, ty)| Filter {
        id: id.into(),
        keyword: kw.into(),
        location: loc.into(),
        r#type: ty.into(),
        time_window: "30d".into(),
        active: true,
    })
    .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| tray::show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .manage(AppState {
            filters: Mutex::new(initial_filters()),
            notified_ids: Mutex::new(HashSet::new()),
            cached_jobs: Mutex::new(Vec::new()),
            sources: Mutex::new(Vec::new()),
            paused: AtomicBool::new(false),
            muted: AtomicBool::new(false),
            scanning: AtomicBool::new(false),
            next_check_at: Mutex::new(None),
            last_check_at: Mutex::new(None),
            wake: Notify::new(),
            scan_lock: tokio::sync::Mutex::new(()),
        })
        .invoke_handler(tauri::generate_handler![
            get_jobs,
            scan_now,
            fetch_jobs,
            get_status,
            set_paused,
            set_muted,
            get_filters,
            save_filter,
            delete_filter,
            open_url,
            get_job_description
        ])
        // Fechar a janela principal apenas a esconde na bandeja; "Sair" no tray encerra.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            tray::setup(app.handle())?;
            start_worker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar VagaFounder");
}
