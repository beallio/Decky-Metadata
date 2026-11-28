const RELEASE_DOWNLOAD_PATH_PREFIX: &str = "/beallio/Decky-Metadata/releases/download/";

pub fn is_repository_release_download_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("github.com")
            && url.username().is_empty()
            && url.password().is_none()
            && url.port_or_known_default() == Some(443)
            && url.path().starts_with(RELEASE_DOWNLOAD_PATH_PREFIX)
    })

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_normalized_path_traversal_outside_repository() {
        assert!(is_repository_release_download_url(
            "https://github.com/beallio/Decky-Metadata/releases/download/v1.0.0/plugin.zip"
        ));
        assert!(!is_repository_release_download_url(
            "https://github.com/beallio/Decky-Metadata/releases/download/../../../attacker/evil/releases/download/v1.0.0/plugin.zip"
        ));
    }

    #[test]
    fn rejects_credentials_and_non_default_ports() {
        for url in [
            "https://user:pass@github.com/beallio/Decky-Metadata/releases/download/v1.0.0/plugin.zip",
            "https://github.com:8443/beallio/Decky-Metadata/releases/download/v1.0.0/plugin.zip",
        ] {
            assert!(!is_repository_release_download_url(url), "{url}");
        }
    }
}
