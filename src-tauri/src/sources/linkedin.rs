use crate::util::*;
use crate::Job;
use reqwest::Client;
use scraper::{Html, Selector};
use tokio::sync::Semaphore;

const BASE: &str = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

struct Plan {
    location: String,
    /// Raio em milhas (50 mi ≈ 80 km).
    distance: Option<u32>,
    remote: bool,
    pages: u32,
}

fn parse(html: &str, plan: &Plan, metro_only: bool) -> (usize, Vec<Job>) {
    let doc = Html::parse_fragment(html);
    let card = Selector::parse(".base-search-card").unwrap();
    let title_s = Selector::parse(".base-search-card__title").unwrap();
    let company_s = Selector::parse(".base-search-card__subtitle").unwrap();
    let loc_s = Selector::parse(".job-search-card__location").unwrap();
    let link_s = Selector::parse("a.base-card__full-link").unwrap();
    let time_s = Selector::parse("time").unwrap();
    let text = |el: scraper::ElementRef, s: &Selector| {
        el.select(s).next().map(|e| e.text().collect::<String>().trim().to_string()).unwrap_or_default()
    };

    let mut cards = 0;
    let mut jobs = Vec::new();
    for el in doc.select(&card) {
        cards += 1;
        let title = text(el, &title_s);
        let url = el
            .select(&link_s)
            .next()
            .and_then(|e| e.value().attr("href"))
            .unwrap_or("")
            .split('?')
            .next()
            .unwrap_or("")
            .to_string();
        // ID estável: data-entity-urn="urn:li:jobPosting:123" ou o número no fim da URL.
        let id = el
            .value()
            .attr("data-entity-urn")
            .and_then(|u| u.rsplit(':').next())
            .map(str::to_string)
            .or_else(|| url.rsplit('-').next().filter(|s| s.chars().all(|c| c.is_ascii_digit())).map(str::to_string));
        let (Some(id), false) = (id, title.is_empty()) else { continue };

        let loc = text(el, &loc_s);
        if metro_only && !plan.remote && !(in_radius(&loc) || norm(&city_part(&loc)) == "pernambuco") {
            continue;
        }
        let published = el
            .select(&time_s)
            .next()
            .and_then(|t| t.value().attr("datetime"))
            .and_then(parse_date)
            .unwrap_or_else(Utc::now);


        let modality = if plan.remote { "Remoto" } else { infer_modality(&format!("{title} {loc}")).unwrap_or("Presencial") };
        let city = if plan.remote { "Brasil".to_string() } else { pretty_city(&loc) };
        jobs.push(make_job(format!("li-{id}"), title, text(el, &company_s), city, modality, published, url, "linkedin", None));
    }
    (cards, jobs)
}

pub async fn search(client: &Client, sem: &Semaphore, keyword: &str, scope: &Scope) -> Result<Vec<Job>, String> {
    let recife = "Recife, Pernambuco, Brasil".to_string();
    let remote = |pages| Plan { location: "Brasil".into(), distance: None, remote: true, pages };
    let plans = match scope {
        Scope::Metro => vec![Plan { location: recife, distance: Some(50), remote: false, pages: 5 }, remote(2)],
        Scope::Remote => vec![remote(4)],
        Scope::Custom(loc) => vec![Plan { location: loc.clone(), distance: Some(50), remote: false, pages: 3 }],
    };
    let metro_only = matches!(scope, Scope::Metro);
    let kw = enc(&strip_accents(keyword));

    let mut jobs = Vec::new();
    let mut last_err = None;
    let mut any_ok = false;
    for plan in &plans {
        for p in 0..plan.pages {
            let start_offset = p * 25;
            let mut url = format!(
                "{BASE}?keywords={kw}&location={}&start={start_offset}",
                enc(&plan.location),
            );
            if let Some(d) = plan.distance {
                url.push_str(&format!("&distance={d}"));
            }
            if plan.remote {
                url.push_str("&f_WT=2");
            }

            let resp = {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                client.get(&url).send().await
            };
            let html = match resp {
                Ok(r) if r.status().is_success() => r.text().await.unwrap_or_default(),
                Ok(r) => {
                    last_err = Some(format!("LinkedIn recusou a requisição (HTTP {})", r.status().as_u16()));
                    break;
                }
                Err(e) => {
                    last_err = Some(format!("LinkedIn indisponível: {e}"));
                    break;
                }
            };
            any_ok = true;
            let (cards, found) = parse(&html, plan, metro_only);
            jobs.extend(found);
            if cards == 0 {
                break; // sem mais vagas nesta busca
            }
        }
    }

    if !any_ok {
        return Err(last_err.unwrap_or_else(|| "LinkedIn não respondeu".into()));
    }
    Ok(jobs)
}
