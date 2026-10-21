pub mod sources;
mod tray;
pub mod util;

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
    /// "gupy" | "linkedin" | "indeed" | "vagas" | "trabalhabrasil" | "infojobs" | "catho"
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub salary: Option<String>,
    #[serde(default)]
    pub benefits: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    pub notify_all: bool,
    pub roles: Vec<String>,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalNotifySettings {
    #[serde(default)]
    pub telegram_enabled: bool,
    #[serde(default)]
    pub telegram_bot_token: String,
    #[serde(default)]
    pub telegram_chat_id: String,
    #[serde(default)]
    pub discord_enabled: bool,
    #[serde(default)]
    pub discord_webhook_url: String,
}

impl Default for ExternalNotifySettings {
    fn default() -> Self {
        Self {
            telegram_enabled: false,
            telegram_bot_token: String::new(),
            telegram_chat_id: String::new(),
            discord_enabled: false,
            discord_webhook_url: String::new(),
        }
    }
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
    pub notification_settings: NotificationSettings,
    pub external_notification_settings: ExternalNotifySettings,
}

pub struct AppState {
    filters: Mutex<Vec<Filter>>,
    notified_ids: Mutex<HashSet<String>>,
    cached_jobs: Mutex<Vec<Job>>,
    sources: Mutex<Vec<SourceStatus>>,
    paused: AtomicBool,
    muted: AtomicBool,
    scanning: AtomicBool,
    notify_all_roles: AtomicBool,
    notify_roles: Mutex<Vec<String>>,
    notify_keywords: Mutex<Vec<String>>,
    external_settings: Mutex<ExternalNotifySettings>,
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
            notification_settings: NotificationSettings {
                notify_all: self.notify_all_roles.load(Ordering::SeqCst),
                roles: self.notify_roles.lock().unwrap().clone(),
                keywords: self.notify_keywords.lock().unwrap().clone(),
            },
            external_notification_settings: self.external_settings.lock().unwrap().clone(),
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

fn load_cached_jobs_from_disk(app: &AppHandle) -> Vec<Job> {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let file = dir.join("jobs_cache.json");
        if let Ok(content) = std::fs::read_to_string(file) {
            if let Ok(jobs) = serde_json::from_str::<Vec<Job>>(&content) {
                return jobs;
            }
        }
    }
    Vec::new()
}

fn save_cached_jobs_to_disk(app: &AppHandle, jobs: &[Job]) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("jobs_cache.json");
        if let Ok(json) = serde_json::to_string(jobs) {
            let _ = std::fs::write(file, json);
        }
    }
}

fn merge_batch(app: &AppHandle, source: &str, results: Vec<Result<Vec<Job>, String>>) -> Vec<Job> {
    let mut jobs = Vec::new();
    let status = summarize(source, results, &mut jobs);
    let state = app.state::<AppState>();
    {
        let mut s = state.sources.lock().unwrap();
        s.retain(|it| it.source != source);
        s.push(status);
    }
    if !jobs.is_empty() {
        let mut cached = state.cached_jobs.lock().unwrap();
        cached.extend(jobs.clone());
        let merged = dedupe_sort(std::mem::take(&mut *cached));
        *cached = merged.clone();
        save_cached_jobs_to_disk(app, &merged);
        let _ = app.emit("jobs-updated", &merged);
    }
    emit_status(app);
    jobs
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
    let sem = std::sync::Arc::new(Semaphore::new(32));

    // Executa as 6 fontes HTTP em paralelo com emissão progressiva instantânea
    let app1 = app.clone();
    let qs1 = qs.clone();
    let client1 = client.clone();
    let sem1 = sem.clone();
    let gupy_task = async move {
        let res = futures::future::join_all(qs1.iter().map(|(k, s)| sources::gupy::search(&client1, &sem1, k, s))).await;
        merge_batch(&app1, "gupy", res)
    };

    let app2 = app.clone();
    let qs2 = qs.clone();
    let client2 = client.clone();
    let sem2 = sem.clone();
    let li_task = async move {
        let res = futures::future::join_all(qs2.iter().map(|(k, s)| sources::linkedin::search(&client2, &sem2, k, s))).await;
        merge_batch(&app2, "linkedin", res)
    };

    let app3 = app.clone();
    let qs3 = qs.clone();
    let client3 = client.clone();
    let sem3 = sem.clone();
    let vagas_task = async move {
        let res = futures::future::join_all(qs3.iter().map(|(k, s)| sources::vagas::search(&client3, &sem3, k, s))).await;
        merge_batch(&app3, "vagas", res)
    };

    let app4 = app.clone();
    let qs4 = qs.clone();
    let client4 = client.clone();
    let sem4 = sem.clone();
    let tb_task = async move {
        let res = futures::future::join_all(qs4.iter().map(|(k, s)| sources::trabalhabrasil::search(&client4, &sem4, k, s))).await;
        merge_batch(&app4, "trabalhabrasil", res)
    };

    let app5 = app.clone();
    let qs5 = qs.clone();
    let client5 = client.clone();
    let sem5 = sem.clone();
    let ij_task = async move {
        let res = futures::future::join_all(qs5.iter().map(|(k, s)| sources::infojobs::search(&client5, &sem5, k, s))).await;
        merge_batch(&app5, "infojobs", res)
    };

    let app6 = app.clone();
    let qs6 = qs.clone();
    let client6 = client.clone();
    let sem6 = sem.clone();
    let catho_task = async move {
        let res = futures::future::join_all(qs6.iter().map(|(k, s)| sources::catho::search(&client6, &sem6, k, s))).await;
        merge_batch(&app6, "catho", res)
    };

    let (g_jobs, li_jobs, v_jobs, tb_jobs, ij_jobs, c_jobs) =
        tokio::join!(gupy_task, li_task, vagas_task, tb_task, ij_task, catho_task);

    let mut all = Vec::new();
    all.extend(g_jobs);
    all.extend(li_jobs);
    all.extend(v_jobs);
    all.extend(tb_jobs);
    all.extend(ij_jobs);
    all.extend(c_jobs);

    // Sempre preserva as vagas do cache persistente
    let cached = state.cached_jobs.lock().unwrap().clone();
    all.extend(cached);

    let final_jobs = dedupe_sort(all);

    // Notifica somente vagas novas (na primeira varredura apenas registra, para não inundar).
    let fresh: Vec<Job> = {
        let mut notified = state.notified_ids.lock().unwrap();
        let first_run = notified.is_empty();
        let fresh: Vec<Job> = final_jobs.iter().filter(|j| notified.insert(j.id.clone())).cloned().collect();
        if first_run { Vec::new() } else { fresh }
    };

    // Avisos programáveis: só notifica vagas que correspondem aos cargos/termos selecionados
    let fresh_to_notify: Vec<Job> = if state.notify_all_roles.load(Ordering::SeqCst) {
        fresh
    } else {
        let allowed_roles = state.notify_roles.lock().unwrap().clone();
        let custom_kws = state.notify_keywords.lock().unwrap().clone();
        if allowed_roles.is_empty() && custom_kws.is_empty() {
            fresh
        } else {
            fresh
                .into_iter()
                .filter(|j| {
                    let j_type = util::norm(&j.r#type);
                    let j_title = util::norm(&j.title);
                    let matches_role = allowed_roles.iter().any(|r| {
                        let r_n = util::norm(r);
                        j_type.contains(&r_n) || j_title.contains(&r_n)
                    });
                    let matches_kw = custom_kws.iter().any(|k| {
                        let k_n = util::norm(k);
                        !k_n.is_empty() && j_title.contains(&k_n)
                    });
                    matches_role || matches_kw
                })
                .collect()
        }
    };

    if !fresh_to_notify.is_empty() && !state.muted.load(Ordering::SeqCst) {
        // Notificação nativa no Windows / OS
        let (title, body) = if fresh_to_notify.len() == 1 {
            (format!("Nova vaga: {}", fresh_to_notify[0].title), format!("{} • {}", fresh_to_notify[0].company, fresh_to_notify[0].location))
        } else {
            (format!("{} novas vagas de seu interesse", fresh_to_notify.len()), fresh_to_notify.iter().take(3).map(|j| j.title.as_str()).collect::<Vec<_>>().join(" • "))
        };
        let _ = app.notification().builder().title(title).body(body).show();

        // Notificações externas configuradas (Telegram / Discord)
        let ext_cfg = state.external_settings.lock().unwrap().clone();
        if ext_cfg.telegram_enabled && !ext_cfg.telegram_bot_token.is_empty() && !ext_cfg.telegram_chat_id.is_empty() {
            let mut msg = format!("💼 <b>VagaFounder • {} Novas Vagas Encontradas!</b>\n\n", fresh_to_notify.len());
            for j in fresh_to_notify.iter().take(5) {
                let sal = j.salary.as_deref().unwrap_or("Salário a combinar");
                msg.push_str(&format!(
                    "🔹 <b>{}</b>\n🏢 <i>{}</i>\n📍 {}\n💵 {}\n🔗 <a href=\"{}\">Ver Vaga / Candidatar</a>\n\n",
                    j.title, j.company, j.location, sal, j.url
                ));
            }
            let client_c = client.clone();
            let token = ext_cfg.telegram_bot_token.clone();
            let chat_id = ext_cfg.telegram_chat_id.clone();
            tokio::spawn(async move {
                let _ = send_telegram_msg(&client_c, &token, &chat_id, &msg).await;
            });
        }

        if ext_cfg.discord_enabled && !ext_cfg.discord_webhook_url.is_empty() {
            let embeds: Vec<serde_json::Value> = fresh_to_notify.iter().take(5).map(|j| {
                serde_json::json!({
                    "title": j.title,
                    "url": j.url,
                    "color": 0x4f46e5,
                    "fields": [
                        { "name": "🏢 Empresa", "value": j.company, "inline": true },
                        { "name": "📍 Local", "value": j.location, "inline": true },
                        { "name": "💵 Salário", "value": j.salary.as_deref().unwrap_or("A combinar"), "inline": true },
                        { "name": "🌐 Plataforma", "value": j.source.to_uppercase(), "inline": true }
                    ]
                })
            }).collect();
            let client_c = client.clone();
            let wh = ext_cfg.discord_webhook_url.clone();
            tokio::spawn(async move {
                let _ = send_discord_msg(&client_c, &wh, "🔔 **VagaFounder: Novas Oportunidades!**", embeds).await;
            });
        }
    }

    *state.cached_jobs.lock().unwrap() = final_jobs.clone();
    save_cached_jobs_to_disk(app, &final_jobs);
    *state.last_check_at.lock().unwrap() = Some(Utc::now());
    state.scanning.store(false, Ordering::SeqCst);
    let _ = app.emit("jobs-updated", &final_jobs);
    emit_status(app);

    // Executa Indeed em background sem travar o retorno das 6 fontes rápidas
    let app_handle = app.clone();
    let qs_clone = qs.clone();
    tauri::async_runtime::spawn(async move {
        let mut indeed_results = Vec::new();
        for (k, s) in qs_clone.iter().take(2) {
            let r = sources::indeed::search(&app_handle, k, s).await;
            let blocked = r.as_ref().err().is_some_and(|e| e.contains("bloque") || e.contains("anti-rob") || e.contains("tempo"));
            indeed_results.push(r);
            if blocked {
                break;
            }
        }
        merge_batch(&app_handle, "indeed", indeed_results);
    });

    final_jobs
}

fn start_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Aguarda 15 segundos antes do primeiro ciclo em segundo plano para não competir com a inicialização
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let state = app.state::<AppState>();
            if !state.paused.load(Ordering::SeqCst) {
                // Tenta adquirir lock; se houver busca ativa do usuário, pula para o próximo ciclo sem travar
                if let Ok(_guard) = state.scan_lock.try_lock() {
                    drop(_guard);
                    scan(&app, None).await;
                }
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
fn get_notification_settings(state: State<'_, AppState>) -> NotificationSettings {
    NotificationSettings {
        notify_all: state.notify_all_roles.load(Ordering::SeqCst),
        roles: state.notify_roles.lock().unwrap().clone(),
        keywords: state.notify_keywords.lock().unwrap().clone(),
    }
}

#[tauri::command]
fn set_notification_settings(app: AppHandle, settings: NotificationSettings, state: State<'_, AppState>) -> NotificationSettings {
    state.notify_all_roles.store(settings.notify_all, Ordering::SeqCst);
    *state.notify_roles.lock().unwrap() = settings.roles.clone();
    *state.notify_keywords.lock().unwrap() = settings.keywords.clone();
    emit_status(&app);
    settings
}

#[tauri::command]
fn test_notification(app: AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("VagaFounder • Teste de Aviso")
        .body("Configurações de avisos programáveis ativas! Você receberá alertas das vagas selecionadas.")
        .show()
        .map_err(|e| e.to_string())
}

async fn send_telegram_msg(client: &reqwest::Client, token: &str, chat_id: &str, text: &str) -> Result<(), String> {
    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let payload = serde_json::json!({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": false
    });
    let res = client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Telegram retornou status {}", res.status()))
    }
}

async fn send_discord_msg(client: &reqwest::Client, webhook_url: &str, content: &str, embeds: Vec<serde_json::Value>) -> Result<(), String> {
    let payload = serde_json::json!({
        "content": content,
        "embeds": embeds
    });
    let res = client.post(webhook_url).json(&payload).send().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        Ok(())
    } else {
        Err(format!("Discord retornou status {}", res.status()))
    }
}

#[tauri::command]
fn get_external_notify_settings(state: State<'_, AppState>) -> ExternalNotifySettings {
    state.external_settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_external_notify_settings(app: AppHandle, settings: ExternalNotifySettings, state: State<'_, AppState>) -> ExternalNotifySettings {
    *state.external_settings.lock().unwrap() = settings.clone();
    emit_status(&app);
    settings
}

#[tauri::command]
async fn test_external_notification(service: String, state: State<'_, AppState>) -> Result<String, String> {
    let client = sources::client();
    let cfg = state.external_settings.lock().unwrap().clone();
    match service.to_lowercase().as_str() {
        "telegram" => {
            if cfg.telegram_bot_token.trim().is_empty() || cfg.telegram_chat_id.trim().is_empty() {
                return Err("Token do Bot ou ID do Chat não foram preenchidos.".into());
            }
            let text = "💼 <b>VagaFounder</b>\n\n✅ <b>Teste de Conexão com Telegram Bem-sucedido!</b>\nVocê receberá os alertas de novas vagas aqui.";
            send_telegram_msg(&client, &cfg.telegram_bot_token, &cfg.telegram_chat_id, text).await?;
            Ok("Mensagem de teste enviada com sucesso para o Telegram!".into())
        }
        "discord" => {
            if cfg.discord_webhook_url.trim().is_empty() {
                return Err("URL do Webhook do Discord não foi preenchida.".into());
            }
            let embeds = vec![serde_json::json!({
                "title": "💼 VagaFounder • Teste de Conexão",
                "description": "✅ Webhook do Discord conectado com sucesso! As novas oportunidades aparecerão aqui.",
                "color": 0x4f46e5
            })];
            send_discord_msg(&client, &cfg.discord_webhook_url, "🔔 **VagaFounder Conectado!**", embeds).await?;
            Ok("Mensagem de teste enviada com sucesso para o Discord!".into())
        }
        _ => Err("Serviço de notificação não suportado.".into()),
    }
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

#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
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
            notify_all_roles: AtomicBool::new(true),
            notify_roles: Mutex::new(Vec::new()),
            notify_keywords: Mutex::new(Vec::new()),
            external_settings: Mutex::new(ExternalNotifySettings::default()),
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
            get_notification_settings,
            set_notification_settings,
            test_notification,
            get_external_notify_settings,
            set_external_notify_settings,
            test_external_notification,
            get_filters,
            save_filter,
            delete_filter,
            open_url,
            get_job_description,
            minimize_window,
            hide_to_tray,
            exit_app
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
            let handle = app.handle();
            let initial = load_cached_jobs_from_disk(handle);
            if !initial.is_empty() {
                let state = handle.state::<AppState>();
                *state.cached_jobs.lock().unwrap() = initial;
            }
            tray::setup(handle)?;
            start_worker(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar VagaFounder");
}
