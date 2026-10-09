//! O Indeed bloqueia requisições HTTP diretas (Cloudflare → 403).
//! Por isso a busca é feita em uma janela WebView2 oculta (motor de navegador real):
//! um script de inicialização lê os cards de vaga da página e devolve o JSON
//! navegando para `https://vagafounder.invalid/r#<json>`, navegação essa que é
//! interceptada (e cancelada) em `on_navigation`.

use crate::util::*;
use crate::Job;
use chrono::{TimeZone, Utc};
use serde_json::Value;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static COUNTER: AtomicU32 = AtomicU32::new(0);

const SCRIPT: &str = r#"
(function () {
  if (location.hostname.indexOf('indeed.') === -1) return;
  var tries = 0;
  function send(p) { location.href = 'https://vagafounder.invalid/r#' + encodeURIComponent(JSON.stringify(p)); }
  function collect() {
    var out = [];
    try {
      var m = window.mosaic && window.mosaic.providerData && window.mosaic.providerData['mosaic-provider-jobcards'];
      var res = m && m.metaData && m.metaData.mosaicProviderJobCardsModel && m.metaData.mosaicProviderJobCardsModel.results;
      if (res && res.length) {
        res.forEach(function (r) {
          out.push({ jk: r.jobkey, t: r.displayTitle || r.title || '', c: r.company || r.truncatedCompany || '',
                     l: r.formattedLocation || '', p: r.pubDate || r.createDate || 0, rm: !!r.remoteLocation });
        });
        return out;
      }
    } catch (e) {}
    document.querySelectorAll('[data-jk]').forEach(function (el) {
      var t = el.querySelector('h2 span[title]') || el.querySelector('h2');
      var c = el.querySelector('[data-testid="company-name"]');
      var l = el.querySelector('[data-testid="text-location"]');
      out.push({ jk: el.getAttribute('data-jk'), t: t ? (t.getAttribute('title') || t.textContent) : '',
                 c: c ? c.textContent : '', l: l ? l.textContent : '', p: 0, rm: false });
    });
    return out;
  }
  function tick() {
    tries++;
    if (document.readyState !== 'loading') {
      var r = collect();
      if (r.length) return send({ ok: true, jobs: r });
      if (document.querySelector('.jobsearch-NoResult-messageContainer, #jobsearch-NoResult')) return send({ ok: true, jobs: [] });
    }
    if (tries > 40) return send({ ok: false, error: document.title || 'timeout' });
    setTimeout(tick, 500);
  }
  setTimeout(tick, 800);
})();
"#;

fn search_url(keyword: &str, scope: &Scope, start: u32) -> String {
    let kw = strip_accents(keyword);
    let start_param = if start > 0 { format!("&start={start}") } else { String::new() };
    match scope {
        Scope::Metro => format!("https://br.indeed.com/jobs?q={}&l={}&radius=100&sort=date{}", enc(&kw), enc("Recife, PE"), start_param),
        Scope::Remote => format!("https://br.indeed.com/jobs?q={}&l={}&sort=date{}", enc(&kw), enc("Remoto"), start_param),
        Scope::Custom(loc) => format!("https://br.indeed.com/jobs?q={}&l={}&radius=50&sort=date{}", enc(&kw), enc(loc), start_param),
    }
}

async fn fetch_payload(app: &AppHandle, url: &str) -> Result<Value, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let label = format!("indeed-{}", COUNTER.fetch_add(1, Ordering::SeqCst));

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.parse().map_err(|e| format!("URL inválida: {e}"))?))
        .title("Indeed")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .initialization_script(SCRIPT)
        .on_navigation(move |u| {
            if u.host_str() == Some("vagafounder.invalid") {
                let data = u.fragment().map(|f| urlencoding::decode(f).map(|c| c.into_owned()).unwrap_or_default());
                if let (Some(data), Some(sender)) = (data, tx.lock().ok().and_then(|mut g| g.take())) {
                    let _ = sender.send(data);
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("Falha ao abrir janela do Indeed: {e}"))?;

    let result = tokio::time::timeout(Duration::from_secs(6), rx).await;
    let _ = window.close();

    let raw = result.map_err(|_| "Indeed não respondeu a tempo (possível verificação anti-robô)".to_string())?
        .map_err(|_| "Janela do Indeed fechada".to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Resposta inválida do Indeed: {e}"))
}

pub async fn search(app: &AppHandle, keyword: &str, scope: &Scope) -> Result<Vec<Job>, String> {
    let mut all_raw_jobs = Vec::new();

    // Primeira página (start=0)
    let payload = fetch_payload(app, &search_url(keyword, scope, 0)).await?;
    if payload["ok"].as_bool() != Some(true) {
        return Err(format!("Indeed bloqueou a busca ({})", payload["error"].as_str().unwrap_or("desconhecido")));
    }

    if let Some(jobs) = payload["jobs"].as_array() {
        all_raw_jobs.extend(jobs.clone());

        // Se a primeira página trouxe vagas, tenta uma segunda página rapidamente
        if !jobs.is_empty() {
            if let Ok(next_payload) = fetch_payload(app, &search_url(keyword, scope, 10)).await {
                if next_payload["ok"].as_bool() == Some(true) {
                    if let Some(next_jobs) = next_payload["jobs"].as_array() {
                        all_raw_jobs.extend(next_jobs.clone());
                    }
                }
            }
        }
    }

    let metro_only = matches!(scope, Scope::Metro);
    let jobs = all_raw_jobs
        .iter()
        .filter_map(|j| {
            let jk = j["jk"].as_str()?;
            let title = j["t"].as_str()?.trim().to_string();
            let loc = j["l"].as_str().unwrap_or("").trim();
            let remote = j["rm"].as_bool().unwrap_or(false) || infer_modality(loc) == Some("Remoto");
            if metro_only && !remote && !in_radius(loc) {
                return None;
            }
            let published = j["p"]
                .as_i64()
                .filter(|ms| *ms > 0)
                .and_then(|ms| Utc.timestamp_millis_opt(ms).single())
                .unwrap_or_else(Utc::now);
            let modality = if remote { "Remoto" } else { infer_modality(&format!("{title} {loc}")).unwrap_or("Presencial") };
            let city = if remote && loc.is_empty() { "Brasil".to_string() } else { pretty_city(loc) };
            Some(make_job(
                format!("indeed-{jk}"),
                title,
                j["c"].as_str().unwrap_or("").to_string(),
                city,
                modality,
                published,
                format!("https://br.indeed.com/viewjob?jk={jk}"),
                "indeed",
                None,
            ))
        })
        .collect();
    Ok(jobs)
}
