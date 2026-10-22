use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SteamInstall {
    pub root: PathBuf,
    pub userdata_dirs: Vec<PathBuf>,
    pub shortcut_files: Vec<PathBuf>,
    pub libraryfolders_files: Vec<PathBuf>,
    pub appmanifest_dirs: Vec<PathBuf>,
}

pub fn is_steamos() -> bool {
    if !cfg!(target_os = "linux") {
        return false;
    }
    if Path::new("/etc/steamos-release").exists() {
        return true;
    }
    let Ok(contents) = fs::read_to_string("/etc/os-release") else {
        return false;
    };
    let mut id = String::new();
    let mut id_like = String::new();
    for line in contents.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim().trim_matches(|character| character == '\'' || character == '"');
        match key.trim() {
            "ID" => id = value.to_owned(),
            "ID_LIKE" => id_like = value.to_owned(),
            _ => {}
        }
    }
    id.eq_ignore_ascii_case("steamos")
        || id_like
            .split_whitespace()
            .any(|distro| distro.eq_ignore_ascii_case("steamos"))
}

pub fn discover_steam_roots() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(std::env::home_dir)
        .unwrap_or_default();
    let compat = std::env::var_os("STEAM_COMPAT_CLIENT_INSTALL_PATH").map(PathBuf::from);
    let mounts: Vec<PathBuf> = fs::read_dir("/run/media")
        .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default();
    let mut removable: Vec<PathBuf> = mounts
        .iter()
        .map(|mount| mount.join("SteamLibrary"))
        .filter(|library| library.exists())
        .collect();
    removable.extend(
        mounts
            .into_iter()
            .filter(|mount| mount.join("steamapps").exists()),
    );
    discover_steam_roots_with(&home, compat.as_deref(), &removable)
}

/// Deterministic root-discovery seam used by tests and alternate Steam layouts.
pub fn discover_steam_roots_with(
    home: &Path,
    compat_path: Option<&Path>,
    removable_roots: &[PathBuf],
) -> Vec<PathBuf> {
    let mut candidates = Vec::with_capacity(5 + removable_roots.len());
    if let Some(compat_path) = compat_path {
        candidates.push(compat_path.to_path_buf());
    }
    candidates.extend([
        home.join(".local/share/Steam"),
        home.join(".steam/steam"),
        home.join(".steam/root"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ]);
    candidates.extend(removable_roots.iter().cloned());
    resolve_existing_unique(candidates)
}

pub fn detect_steam_installs(roots: &[PathBuf]) -> Vec<SteamInstall> {
    let mut installs = Vec::with_capacity(roots.len());
    for root in roots {
        let Ok(root) = fs::canonicalize(root) else {
            continue;
        };

        let mut userdata_dirs = Vec::new();
        let mut shortcut_files = Vec::new();
        let userdata_root = root.join("userdata");
        if let Ok(entries) = fs::read_dir(&userdata_root) {
            for entry in entries.flatten() {
                let user_dir = entry.path();
                if !user_dir.is_dir() {
                    continue;
                }
                let Ok(user_dir) = fs::canonicalize(user_dir) else {
                    continue;
                };
                let shortcut_file = user_dir.join("config/shortcuts.vdf");
                userdata_dirs.push(user_dir);
                if shortcut_file.is_file() {
                    if let Ok(shortcut_file) = fs::canonicalize(shortcut_file) {
                        shortcut_files.push(shortcut_file);
                    }
                }
            }
        }

        let mut libraryfolders_files = Vec::new();
        for library_file in [
            root.join("config/libraryfolders.vdf"),
            root.join("steamapps/libraryfolders.vdf"),
        ] {
            if library_file.is_file() {
                if let Ok(library_file) = fs::canonicalize(library_file) {
                    libraryfolders_files.push(library_file);
                }
            }
        }

        let mut appmanifest_dirs = Vec::new();
        let steamapps = root.join("steamapps");
        if steamapps.is_dir() {
            if let Ok(steamapps) = fs::canonicalize(steamapps) {
                appmanifest_dirs.push(steamapps);
            }
        }
        installs.push(SteamInstall {
            root,
            userdata_dirs,
            shortcut_files,
            libraryfolders_files,
            appmanifest_dirs,
        });
    }
    installs
}

pub fn userdata_roots_from_candidates(roots: &[PathBuf]) -> Vec<PathBuf> {
    let candidates = roots.iter().map(|root| root.join("userdata"));
    let mut seen = HashSet::new();
    candidates
        .filter_map(|candidate| {
            let resolved = fs::canonicalize(candidate).ok()?;
            if !resolved.is_dir() || !seen.insert(resolved.clone()) {
                return None;
            }
            Some(resolved)
        })
        .collect()
}

fn resolve_existing_unique(candidates: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for candidate in candidates {
        let Ok(resolved) = fs::canonicalize(candidate) else {
            continue;
        };
        if resolved.exists() && seen.insert(resolved.clone()) {
            roots.push(resolved);
        }
    }
    roots
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!("metadata-steam-paths-{}-{id}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn root_order_follows_precedence_and_deduplicates_canonical_paths() {
        let temp = TempDir::new();
        let home = temp.0.join("home");
        let compat = temp.0.join("compat");
        let local = home.join(".local/share/Steam");
        let steam_link_target = temp.0.join("steam-target");
        let dot_steam = home.join(".steam/steam");
        let root_target = temp.0.join("root-target");
        let flatpak = home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam");
        let removable = temp.0.join("media/card/SteamLibrary");
        for path in [&compat, &local, &steam_link_target, &dot_steam, &root_target, &flatpak, &removable] {
            fs::create_dir_all(path).unwrap();
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&steam_link_target, home.join(".steam/root")).unwrap();
            std::os::unix::fs::symlink(&local, temp.0.join("compat-alias")).unwrap();
        }
        let mut removable_candidates = vec![removable.clone()];
        removable_candidates.push(temp.0.join("compat-alias"));
        let roots = discover_steam_roots_with(&home, Some(&compat), &removable_candidates);
        let mut expected = vec![compat.canonicalize().unwrap(), local.canonicalize().unwrap(), dot_steam.canonicalize().unwrap()];
        #[cfg(unix)]
        expected.push(steam_link_target.canonicalize().unwrap());
        #[cfg(not(unix))]
        expected.push(home.join(".steam/root").canonicalize().unwrap());
        expected.push(flatpak.canonicalize().unwrap());
        expected.push(removable.canonicalize().unwrap());
        assert_eq!(roots, expected);
    }

    #[test]
    fn install_discovery_collects_existing_shortcuts_libraries_and_manifests() {
        let temp = TempDir::new();
        let root = temp.0.join("Steam");
        let user = root.join("userdata/123");
        let shortcut = user.join("config/shortcuts.vdf");
        let config_library = root.join("config/libraryfolders.vdf");
        let apps_library = root.join("steamapps/libraryfolders.vdf");
        for file in [&shortcut, &config_library, &apps_library] {
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, []).unwrap();
        }
        fs::create_dir_all(root.join("steamapps")).unwrap();
        let installs = detect_steam_installs(&[root.clone()]);
        assert_eq!(installs.len(), 1);
        assert_eq!(installs[0].root, root.canonicalize().unwrap());
        assert_eq!(installs[0].userdata_dirs, vec![user.canonicalize().unwrap()]);
        assert_eq!(installs[0].shortcut_files, vec![shortcut.canonicalize().unwrap()]);
        assert_eq!(installs[0].libraryfolders_files, vec![config_library.canonicalize().unwrap(), apps_library.canonicalize().unwrap()]);
        assert_eq!(installs[0].appmanifest_dirs, vec![root.join("steamapps").canonicalize().unwrap()]);
        assert_eq!(userdata_roots_from_candidates(&[root.clone()]), vec![root.join("userdata").canonicalize().unwrap()]);
    }
}
