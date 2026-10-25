use crate::{
    http::{Http, Redirects},
    updater::models::JsonResponse,
};
use reqwest::Method;
use serde_json::json;
use std::{collections::HashMap, time::Duration};

const RELEASES_URL: &str = "https://api.github.com/repos/beallio/Decky-Metadata/releases";
const RELEASE_TAG_URL: &str = "https://api.github.com/repos/beallio/Decky-Metadata/releases/tags/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct GitHubReleaseClient {
    http: Http,
    user_agent: String,
}

impl GitHubReleaseClient {
    pub fn new(http: Http, installed_version: &str) -> Self {
        Self {
            http,
            user_agent: format!("Decky-Metadata/{installed_version}"),
        }
    }

    pub async fn list_releases(&self) -> JsonResponse {
        self.fetch_json(RELEASES_URL).await
    }

    pub async fn get_release(&self, tag: &str) -> JsonResponse {
        self.fetch_json(&format!("{RELEASE_TAG_URL}{tag}")).await
    }

    pub async fn get_manifest(&self, url: &str) -> JsonResponse {
        self.fetch_json(url).await
    }

    async fn fetch_json(&self, url: &str) -> JsonResponse {
        let headers = [
            ("Accept", "application/vnd.github+json"),
            ("X-GitHub-Api-Version", "2026-03-10"),
            ("User-Agent", self.user_agent.as_str()),
        ];
        match self
            .http
            .request(
                Method::GET,
                url,
                &headers,
                None,
                REQUEST_TIMEOUT,
                usize::MAX,
                Redirects::Default,
            )
            .await
        {
            Ok(response) => {
                let status = response.status;
                let headers = response
                    .headers
                    .iter()
                    .filter_map(|(name, value)| {
                        value
                            .to_str()
                            .ok()
                            .map(|value| (name.as_str().to_ascii_lowercase(), value.to_owned()))
                    })
                    .collect();
                match response.json() {
                    Ok(body) => JsonResponse {
                        status,
                        headers,
                        body,
                    },
                    Err(error) if (200..300).contains(&status) => JsonResponse {
                        status: 500,
                        headers: HashMap::new(),
                        body: json!({"error": error}),
                    },
                    Err(_) => JsonResponse {
                        status,
                        headers,
                        body: json!({}),
                    },
                }
            }
            Err(error) => JsonResponse {
                status: 500,
                headers: HashMap::new(),
                body: json!({"error": error}),
            },
        }
    }
}
