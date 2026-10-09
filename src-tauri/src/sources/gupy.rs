use crate::util::*;
use crate::Job;
use reqwest::Client;
use serde_json::Value;
use tokio::sync::Semaphore;

const API_BASE: &str = "https://portal.gupy.io/api/job-search/jobs";

/// Busca direta via API pública do Gupy com `limit=100`.
async fn fetch_api(client: &Client, sem: &Semaphore, url: &str) -> Option<(Vec<Value>, u64)> {
    let _permit = sem.acquire().await.ok()?;
    let resp = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let json: Value = resp.json().await.ok()?;
    let list = json["data"].as_array().cloned().unwrap_or_default();
    let total = json["pagination"]["total"].as_u64().unwrap_or(list.len() as u64);
    Some((list, total))
}

/// Fallback HTML caso a rota JSON direta falhe
async fn fallback_page(client: &Client, sem: &Semaphore, url: &str) -> Option<(Vec<Value>, u64)> {
    let _permit = sem.acquire().await.ok()?;
    let html = client.get(url).send().await.ok()?.text().await.ok()?;
    let i = html.find(r#"id="__NEXT_DATA__""#)?;
    let s = i + html[i..].find('{')?;
    let e = s + html[s..].find("</script>")?;
    let v: Value = serde_json::from_str(&html[s..e]).ok()?;
    let list = &v["props"]["pageProps"]["initialJobList"];
    Some((
        list["data"].as_array().cloned().unwrap_or_default(),
        list["pagination"]["total"].as_u64().unwrap_or(0),
    ))
}

async fn collect_jobs(client: &Client, sem: &Semaphore, base_query: &str) -> Vec<Value> {
    let url_100 = format!("{API_BASE}?{base_query}&limit=100&offset=0");
    if let Some((first_batch, _)) = fetch_api(client, sem, &url_100).await {
        let first_len = first_batch.len();
        let mut results = first_batch;
        // Se a primeira página veio cheia (100 itens), busca até mais 2 páginas (offset 100 e 200)
        if first_len >= 100 {
            for offset in [100, 200] {
                let url_offset = format!("{API_BASE}?{base_query}&limit=100&offset={offset}");
                if let Some((next_batch, _)) = fetch_api(client, sem, &url_offset).await {
                    if next_batch.is_empty() {
                        break;
                    }
                    let count = next_batch.len();
                    results.extend(next_batch);
                    if count < 100 {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
        return results;
    }

    // Fallback para página Next.js
    let legacy_url = format!("https://portal.gupy.io/job-search/term={}", base_query);
    if let Some((batch, _)) = fallback_page(client, sem, &legacy_url).await {
        return batch;
    }

    Vec::new()
}

fn to_job(v: &Value) -> Option<Job> {
    let title = v["name"].as_str()?.trim().to_string();
    let published = parse_date(v["publishedDate"].as_str().unwrap_or("")).unwrap_or_else(Utc::now);
    let modality = match v["workplaceType"].as_str().unwrap_or("") {
        "remote" => "Remoto",
        "hybrid" => "Híbrido",
        _ => "Presencial",
    };
    let city_raw = v["city"].as_str().unwrap_or("").trim();
    let city = if modality == "Remoto" && city_raw.is_empty() {
        "Brasil".to_string()
    } else if city_raw.is_empty() {
        "Pernambuco".to_string()
    } else {
        pretty_city(city_raw)
    };
    let id_str = v["id"]
        .as_i64()
        .map(|n| n.to_string())
        .or_else(|| v["id"].as_str().map(str::to_string))
        .unwrap_or_else(|| title.clone());

    let job_url = v["jobUrl"]
        .as_str()
        .filter(|u| !u.is_empty())
        .map(|u| u.replace("&amp;", "&"))
        .unwrap_or_else(|| format!("https://portal.gupy.io/job-search/term={}", enc(&title)));

    let description = v["description"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string);

    Some(make_job(
        format!("gupy-{id_str}"),
        title,
        v["careerPageName"].as_str().unwrap_or("").to_string(),
        city,
        modality,
        published,
        job_url,
        "gupy",
        description,
    ))
}

pub async fn search(client: &Client, sem: &Semaphore, keyword: &str, scope: &Scope) -> Result<Vec<Job>, String> {
    let kw_clean = strip_accents(keyword);
    let kw = enc(&kw_clean);
    let is_remote = |v: &Value| v["workplaceType"].as_str() == Some("remote");

    let raw: Vec<Value> = match scope {
        Scope::Metro => {
            // Busca vagas no estado de Pernambuco com limite expandido (100)
            let q_local = if kw.is_empty() {
                "state=Pernambuco".to_string()
            } else {
                format!("jobName={kw}&state=Pernambuco")
            };
            // Busca vagas remotas nacionais para a mesma palavra-chave
            let q_remote = if kw.is_empty() {
                "workplaceType=remote".to_string()
            } else {
                format!("jobName={kw}&workplaceType=remote")
            };

            let local = collect_jobs(client, sem, &q_local).await;
            let remote = collect_jobs(client, sem, &q_remote).await;

            if local.is_empty() && remote.is_empty() {
                // Tenta busca genérica por termo
                let q_gen = format!("jobName={kw}");
                collect_jobs(client, sem, &q_gen).await
            } else {
                local
                    .into_iter()
                    .filter(|v| is_remote(v) || {
                        let c = v["city"].as_str().unwrap_or("").trim();
                        c.is_empty() || in_radius(c)
                    })
                    .chain(remote.into_iter().filter(is_remote))
                    .collect()
            }
        }
        Scope::Remote => {
            let q_remote = if kw.is_empty() {
                "workplaceType=remote".to_string()
            } else {
                format!("jobName={kw}&workplaceType=remote")
            };
            collect_jobs(client, sem, &q_remote).await
        }
        Scope::Custom(loc) => {
            let q_loc = if kw.is_empty() {
                format!("city={}", enc(loc))
            } else {
                format!("jobName={kw}&city={}", enc(loc))
            };
            collect_jobs(client, sem, &q_loc).await
        }
    };

    Ok(raw.iter().filter_map(to_job).collect())
}
