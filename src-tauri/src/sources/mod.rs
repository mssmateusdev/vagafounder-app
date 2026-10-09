pub mod gupy;
pub mod indeed;
pub mod linkedin;

use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(15))
        .build()
        .expect("http client")
}
