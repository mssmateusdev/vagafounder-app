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

    let kw_clean = norm(keyword).replace(' ', "-");
    let url = match scope {
        Scope::Metro => {
            if kw_clean.is_empty() {
                "https://www.catho.com.br/vagas/recife-pe/".to_string()
            } else {
                format!("https://www.catho.com.br/vagas/{}/recife-pe/", enc(&kw_clean))
            }
        }
        Scope::Remote => {
            if kw_clean.is_empty() {
                "https://www.catho.com.br/vagas/home-office/".to_string()
            } else {
                format!("https://www.catho.com.br/vagas/{}/home-office/", enc(&kw_clean))
            }
        }
        Scope::Custom(city) => {
            let city_clean = norm(city).replace(' ', "-");
            if kw_clean.is_empty() {
                format!("https://www.catho.com.br/vagas/{}/", enc(&city_clean))
            } else {
                format!("https://www.catho.com.br/vagas/{}/{}/", enc(&kw_clean), enc(&city_clean))
            }
        }
    };

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Catho HTTP: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Catho status {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Catho body: {e}"))?;
    let doc = Html::parse_document(&html);

    let card_sel = Selector::parse("article.offer").unwrap();
    let title_sel = Selector::parse("h2.title_offer a, h2 a").unwrap();
    let company_sel = Selector::parse("span.text-12").unwrap();
    let salary_sel = Selector::parse("span.icon.i_salary + strong, span.i_salary ~ strong").unwrap();

    let text_of = |el: scraper::ElementRef, s: &Selector| {
        el.select(s)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    };

    let mut jobs = Vec::new();
    for el in doc.select(&card_sel) {
        let link_el = el.select(&title_sel).next();
        let (Some(a), false) = (link_el, false) else { continue };

        let href = a.value().attr("href").unwrap_or_default();
        let title = a.value().attr("title").map(str::to_string).unwrap_or_else(|| {
            a.text().collect::<String>().trim().to_string()
        });

        if title.is_empty() || href.is_empty() {
            continue;
        }

        let full_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://www.catho.com.br{}", href)
        };

        let id = href.rsplit('/')
            .find(|part| !part.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("catho-{}", full_url.len()));

        let company = text_of(el, &company_sel);
        let salary_raw = text_of(el, &salary_sel);

        let modality = infer_modality(&format!("{title}")).unwrap_or("Presencial");

        let mut job = make_job(
            format!("catho-{}", id),
            title,
            if company.is_empty() { "Empresa Confidencial (Catho)".into() } else { company },
            "Recife".to_string(),
            modality,
            Utc::now(),
            full_url,
            "catho",
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
