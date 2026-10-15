use crate::util::*;
use crate::Job;
use reqwest::Client;
use scraper::{Html, Selector};
use tokio::sync::Semaphore;

pub async fn search(
    client: &Client,
    sem: &Semaphore,
    keyword: &str,
    scope: &Scope,
) -> Result<Vec<Job>, String> {
    let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

    let kw_clean = keyword.trim();
    let url = match scope {
        Scope::Metro => {
            if kw_clean.is_empty() {
                "https://www.infojobs.com.br/empregos-em-recife,-pe.aspx".to_string()
            } else {
                format!("https://www.infojobs.com.br/empregos-em-recife,-pe.aspx?palavra={}", enc(kw_clean))
            }
        }
        Scope::Remote => {
            if kw_clean.is_empty() {
                "https://www.infojobs.com.br/vagas-de-emprego-home-office.aspx".to_string()
            } else {
                format!("https://www.infojobs.com.br/vagas-de-emprego-home-office.aspx?palavra={}", enc(kw_clean))
            }
        }
        Scope::Custom(city) => {
            if kw_clean.is_empty() {
                format!("https://www.infojobs.com.br/vagas-de-emprego.aspx?cidade={}", enc(city))
            } else {
                format!("https://www.infojobs.com.br/vagas-de-emprego.aspx?palavra={}&cidade={}", enc(kw_clean), enc(city))
            }
        }
    };

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Infojobs HTTP: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Infojobs status {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Infojobs body: {e}"))?;
    let doc = Html::parse_document(&html);

    let card_sel = Selector::parse(".js_cardLink, div.js_vacancyLoad").unwrap();
    let title_sel = Selector::parse(".js_vacancyTitle, h2").unwrap();
    let company_sel = Selector::parse(".js_companyName, .text-body.small").unwrap();
    let loc_sel = Selector::parse(".text-muted.small").unwrap();

    let text_of = |el: scraper::ElementRef, s: &Selector| {
        el.select(s)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    };

    let mut jobs = Vec::new();
    for el in doc.select(&card_sel) {
        let title = text_of(el, &title_sel);
        if title.is_empty() {
            continue;
        }

        let href = el.value().attr("data-href").or_else(|| {
            el.select(&Selector::parse("a").unwrap())
                .next()
                .and_then(|a| a.value().attr("href"))
        }).unwrap_or_default();

        let id = el
            .value()
            .attr("data-id")
            .map(str::to_string)
            .or_else(|| {
                href.rsplit("__")
                    .next()
                    .and_then(|s| s.split('.').next())
                    .map(str::to_string)
            })
            .unwrap_or_default();

        let full_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://www.infojobs.com.br{}", href)
        };

        let company = text_of(el, &company_sel);
        let loc = text_of(el, &loc_sel);

        let city = if !loc.is_empty() { pretty_city(&loc) } else { "Recife".to_string() };
        let modality = infer_modality(&format!("{title} {loc}")).unwrap_or("Presencial");

        let job_id = if id.is_empty() {
            format!("ij-{}", full_url.rsplit('/').next().unwrap_or("job"))
        } else {
            format!("ij-{}", id)
        };

        let mut job = make_job(
            job_id,
            title,
            if company.is_empty() { "Empresa Confidencial".into() } else { company },
            city,
            modality,
            Utc::now(),
            full_url,
            "infojobs",
            None,
        );

        if let Some(s) = extract_salary(&job.title, None) {
            job.salary = Some(s);
        }

        let b = extract_benefits(&job.title, None);
        if !b.is_empty() {
            job.benefits = b;
        }

        jobs.push(job);
    }

    Ok(jobs)
}
