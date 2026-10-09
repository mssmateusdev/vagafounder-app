use crate::Job;
pub use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use std::collections::HashSet;

/// Janela máxima de publicação aceita (dias).
pub const MAX_AGE_DAYS: i64 = 30;

/// Municípios de PE num raio de ~80 km de Recife (normalizados: minúsculo, sem acento).
const METRO: &[&str] = &[
    "recife", "jaboatao dos guararapes", "jaboatao", "olinda", "paulista", "camaragibe",
    "sao lourenco da mata", "cabo de santo agostinho", "ipojuca", "moreno", "igarassu",
    "abreu e lima", "ilha de itamaraca", "itamaraca", "itapissuma", "aracoiaba", "goiana",
    "vitoria de santo antao", "escada", "pombos", "cha grande", "cha de alegria",
    "gloria do goita", "paudalho", "carpina", "nazare da mata", "lagoa de itaenga",
    "lagoa do carro", "tracunhaem", "feira nova", "buenos aires", "limoeiro", "sirinhaem",
    "ribeirao", "primavera", "condado", "itaquitinga", "vicencia", "suape",
];

pub fn strip_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'ã' | 'â' | 'ä' => 'a',
            'Á' | 'À' | 'Ã' | 'Â' | 'Ä' => 'A',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'ó' | 'ò' | 'õ' | 'ô' | 'ö' => 'o',
            'Ó' | 'Ò' | 'Õ' | 'Ô' | 'Ö' => 'O',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'ç' => 'c',
            'Ç' => 'C',
            other => other,
        })
        .collect()
}

pub fn norm(s: &str) -> String {
    strip_accents(s).to_lowercase().trim().to_string()
}

pub fn enc(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

/// "Jaboatão dos Guararapes, Pernambuco, Brazil" -> "Jaboatão dos Guararapes"
pub fn city_part(loc: &str) -> String {
    let first = loc.split(',').next().unwrap_or("");
    let first = first.split(" - ").next().unwrap_or("");
    let first = first.split('(').next().unwrap_or("");
    first.trim().to_string()
}

/// Nome de cidade legível para exibição.
pub fn pretty_city(loc: &str) -> String {
    let c = city_part(loc);
    match norm(&c).as_str() {
        "greater recife" | "regiao metropolitana do recife" | "recife e regiao" => "Grande Recife".into(),
        "brazil" | "brasil" | "" => "Brasil".into(),
        _ => c,
    }
}

/// Verdadeiro se a localidade está dentro do raio de ~80 km de Recife.
pub fn in_radius(loc: &str) -> bool {
    let n = norm(loc);
    if n.contains("recife") || n.contains("pernambuco") {
        return true;
    }
    let c = norm(&city_part(loc));
    METRO.iter().any(|m| c == *m || n.contains(m))
}

pub fn infer_modality(text: &str) -> Option<&'static str> {
    let t = norm(text);
    if t.contains("remoto") || t.contains("home office") || t.contains("remote") || t.contains("teletrabalho") {
        Some("Remoto")
    } else if t.contains("hibrido") || t.contains("hybrid") {
        Some("Híbrido")
    } else {
        None
    }
}

pub fn classify(title: &str) -> String {
    let t = norm(title);
    let has = |ws: &[&str]| ws.iter().any(|w| t.contains(w));
    let word = |w: &str| t.split(|c: char| !c.is_alphanumeric()).any(|x| x == w);

    let kind = if has(&["aprendiz"]) {
        "Jovem Aprendiz"
    } else if has(&["estagi", "internship"]) || word("intern") {
        "Estágio"
    } else if word("rh") || word("dp") || has(&["recursos humanos", "departamento pessoal", "recrutamento", "gestao de pessoas", "talent"]) {
        "Recursos Humanos (RH)"
    } else if has(&["desenvolvedor", "developer", "software", "programador", "frontend", "front-end", "backend", "back-end", "fullstack", "full stack"]) {
        "Tecnologia & Dev"
    } else if has(&["suporte", "helpdesk", "help desk", "service desk", "tecnico de ti", "tecnico de informatica", "infraestrutura"]) || word("ti") {
        "Suporte de TI"
    } else if has(&["auxiliar", "assistente", "administrativ"]) {
        "Auxiliar Administrativo"
    } else if has(&["atendente", "atendimento", "recepcion", "recepcao", "caixa"]) {
        "Atendimento / Recepção"
    } else if word("pj") {
        "PJ"
    } else {
        "CLT"
    };
    kind.to_string()
}

/// Aceita RFC3339 ou data simples (YYYY-MM-DD, como o LinkedIn retorna).
pub fn parse_date(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    let d = NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok()?;
    // Meio-dia em Brasília (15h UTC), sem passar do instante atual.
    let dt = Utc.from_utc_datetime(&d.and_hms_opt(15, 0, 0)?);
    Some(dt.min(Utc::now()))
}

pub fn within_age(dt: &DateTime<Utc>) -> bool {
    Utc::now().signed_duration_since(*dt).num_days() <= MAX_AGE_DAYS
}

#[allow(clippy::too_many_arguments)]
pub fn make_job(
    id: String,
    title: String,
    company: String,
    city: String,
    modality: &str,
    published: DateTime<Utc>,
    url: String,
    source: &str,
    description: Option<String>,
) -> Job {
    Job {
        id,
        r#type: classify(&title),
        location: format!("{} ({})", city, modality),
        title,
        company: if company.trim().is_empty() { "Empresa não informada".into() } else { company.trim().to_string() },
        city,
        modality: modality.to_string(),
        published_at: published.to_rfc3339(),
        url,
        source: source.to_string(),
        description,
    }
}

/// Remove duplicadas e ordena da mais recente para a mais antiga.
pub fn dedupe_sort(jobs: Vec<Job>) -> Vec<Job> {
    let mut seen = HashSet::new();
    let mut out: Vec<Job> = jobs
        .into_iter()
        .filter(|j| {
            let key = if !j.id.is_empty() {
                j.id.clone()
            } else if !j.url.is_empty() {
                j.url.clone()
            } else {
                format!("{}|{}|{}", norm(&j.title), norm(&j.company), norm(&j.location))
            };
            seen.insert(key)
        })
        .collect();
    out.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    out
}

/// Escopo geográfico derivado do campo "localização" de um filtro.
#[derive(Clone, Debug)]
pub enum Scope {
    /// Até 80 km de Recife (presencial/híbrido) + remoto em todo o Brasil.
    Metro,
    /// Somente remoto.
    Remote,
    /// Outra cidade informada pelo usuário.
    Custom(String),
}

impl Scope {
    pub fn from_location(loc: &str) -> Scope {
        let n = norm(loc);
        if n.contains("remot") {
            Scope::Remote
        } else if n.is_empty() || n.contains("recife") || n.contains("jaboatao") || n.contains("pernambuco") || n.contains("80 km") {
            Scope::Metro
        } else {
            Scope::Custom(loc.trim().to_string())
        }
    }
}
