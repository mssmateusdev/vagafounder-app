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

    let kw_slug = norm(keyword).replace(' ', "-");
    let url = match scope {
        Scope::Metro => {
            if kw_slug.is_empty() {
                "https://www.trabalhabrasil.com.br/vagas-de-emprego-em-recife-pe".to_string()
            } else {
                format!("https://www.trabalhabrasil.com.br/vagas-empregos-em-recife-pe/{}", enc(&kw_slug))
            }
        }
        Scope::Remote => {
            if kw_slug.is_empty() {
                "https://www.trabalhabrasil.com.br/vagas-de-emprego-home-office".to_string()
            } else {
                format!("https://www.trabalhabrasil.com.br/vagas-empregos-home-office/{}", enc(&kw_slug))
            }
        }
        Scope::Custom(city) => {
            let city_slug = norm(city).replace(' ', "-");
            if kw_slug.is_empty() {
                format!("https://www.trabalhabrasil.com.br/vagas-de-emprego-em-{}", enc(&city_slug))
            } else {
                format!("https://www.trabalhabrasil.com.br/vagas-empregos-em-{}/{}", enc(&city_slug), enc(&kw_slug))
            }
        }
    };

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|e| format!("TrabalhaBrasil HTTP: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("TrabalhaBrasil status {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("TrabalhaBrasil body: {e}"))?;
    let doc = Html::parse_document(&html);

    let card_sel = Selector::parse("article.job-card").unwrap();
    let link_sel = Selector::parse("a.job-link").unwrap();
    let title_sel = Selector::parse("h2.job-title").unwrap();
    let company_sel = Selector::parse(".job-company span").unwrap();
    let loc_sel = Selector::parse(".job-location span").unwrap();
    let salary_sel = Selector::parse(".job-detail--salary span.salary, .salary").unwrap();
    let workplace_sel = Selector::parse(".job-detail--type span.workplace, .job-badge--remote").unwrap();

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

        let link_el = el.select(&link_sel).next();
        let href = link_el.and_then(|a| a.value().attr("href")).unwrap_or_default();
        let id = el
            .value()
            .attr("data-job-id")
            .map(str::to_string)
            .or_else(|| {
                href.rsplit('/')
                    .next()
                    .map(str::to_string)
            })
            .unwrap_or_default();

        let full_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://www.trabalhabrasil.com.br{}", href)
        };

        let company = text_of(el, &company_sel);
        let loc = text_of(el, &loc_sel);
        let salary_raw = text_of(el, &salary_sel);
        let workplace_raw = text_of(el, &workplace_sel);

        let city = if !loc.is_empty() { pretty_city(&loc) } else { "Recife".to_string() };
        let modality = infer_modality(&format!("{title} {workplace_raw}")).unwrap_or("Presencial");

        let job_id = if id.is_empty() {
            format!("tb-{}", full_url.rsplit('/').next().unwrap_or("job"))
        } else {
            format!("tb-{}", id)
        };

        let mut job = make_job(
            job_id,
            title,
            if company.is_empty() { "SINE / Trabalha Brasil".into() } else { company },
            city,
            modality,
            Utc::now(),
            full_url,
            "trabalhabrasil",
            None,
        );

        if !salary_raw.is_empty() {
            job.salary = Some(salary_raw);
        } else if let Some(s) = extract_salary(&job.title, None) {
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
