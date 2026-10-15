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
                "https://www.vagas.com.br/vagas-em-recife".to_string()
            } else {
                format!("https://www.vagas.com.br/vagas-de-{}-em-recife", enc(&kw_slug))
            }
        }
        Scope::Remote => {
            if kw_slug.is_empty() {
                "https://www.vagas.com.br/vagas-de-home-office".to_string()
            } else {
                format!("https://www.vagas.com.br/vagas-de-{}-remoto", enc(&kw_slug))
            }
        }
        Scope::Custom(city) => {
            let city_slug = norm(city).replace(' ', "-");
            if kw_slug.is_empty() {
                format!("https://www.vagas.com.br/vagas-em-{}", enc(&city_slug))
            } else {
                format!("https://www.vagas.com.br/vagas-de-{}-em-{}", enc(&kw_slug), enc(&city_slug))
            }
        }
    };

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "pt-BR,pt;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Vagas.com HTTP: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Vagas.com status {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Vagas.com body: {e}"))?;
    let doc = Html::parse_document(&html);

    let card_sel = Selector::parse("li.vaga, article.vaga").unwrap();
    let link_sel = Selector::parse("a.link-detalhes-vaga").unwrap();
    let company_sel = Selector::parse(".emprVaga").unwrap();
    let loc_sel = Selector::parse(".vaga-local").unwrap();
    let desc_sel = Selector::parse(".detalhes").unwrap();

    let text_of = |el: scraper::ElementRef, s: &Selector| {
        el.select(s)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    };

    let mut jobs = Vec::new();
    for el in doc.select(&card_sel) {
        let link_el = el.select(&link_sel).next();
        let (Some(a), false) = (link_el, false) else { continue };

        let href = a.value().attr("href").unwrap_or_default();
        let id = a
            .value()
            .attr("data-id-vaga")
            .map(str::to_string)
            .or_else(|| {
                href.rsplit('/')
                    .next()
                    .map(str::to_string)
            })
            .unwrap_or_default();

        let title = a.value().attr("title").map(str::to_string).unwrap_or_else(|| {
            a.text().collect::<String>().trim().to_string()
        });

        if title.is_empty() || href.is_empty() {
            continue;
        }

        let full_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://www.vagas.com.br{}", href)
        };

        let company = text_of(el, &company_sel);
        let loc = text_of(el, &loc_sel);
        let desc = text_of(el, &desc_sel);

        let city = if !loc.is_empty() { pretty_city(&loc) } else { "Recife".to_string() };
        let modality = infer_modality(&format!("{title} {loc} {desc}")).unwrap_or("Presencial");

        let job_id = if id.is_empty() {
            format!("vagas-{}", full_url.rsplit('/').next().unwrap_or("job"))
        } else {
            format!("vagas-{}", id)
        };

        let mut job = make_job(
            job_id,
            title,
            if company.is_empty() { "Confidencial".into() } else { company },
            city,
            modality,
            Utc::now(),
            full_url,
            "vagas",
            if desc.is_empty() { None } else { Some(desc) },
        );

        if let Some(s) = extract_salary(&job.title, job.description.as_deref()) {
            job.salary = Some(s);
        }
        let b = extract_benefits(&job.title, job.description.as_deref());
        if !b.is_empty() {
            job.benefits = b;
        }

        jobs.push(job);
    }

    Ok(jobs)
}
