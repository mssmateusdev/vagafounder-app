pub mod catho;
pub mod gupy;
pub mod indeed;
pub mod infojobs;
pub mod linkedin;
pub mod trabalhabrasil;
pub mod vagas;

use std::sync::OnceLock;
use std::time::Duration;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Retorna o cliente HTTP global reutilizável com pool de conexões ativo e keep-alive persistente.
pub fn client() -> reqwest::Client {
    HTTP_CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .pool_max_idle_per_host(30)
                .pool_idle_timeout(Duration::from_secs(90))
                .tcp_nodelay(true)
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(6))
                .build()
                .expect("http client")
        })
        .clone()
}
