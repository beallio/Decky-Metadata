use crc32fast::Hasher as Crc32Hasher;
use std::fs::File;
#[cfg(test)]
use std::fs;
use std::io::{Read, Take};
use std::path::{Path, PathBuf};

pub const MAX_SHORTCUTS_VDF_BYTES: u64 = 2 * 1024 * 1024;
pub const MAX_SHORTCUTS_VDF_DEPTH: usize = 32;
pub const MAX_SHORTCUTS_VDF_ENTRIES: usize = 2048;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VdfValue {
    Object(Vec<(String, VdfValue)>),
    String(String),
    Signed(i32),
    Unsigned(u64),
}

impl VdfValue {
    fn python_string(&self) -> String {
        match self {
            Self::Object(fields) if fields.is_empty() => String::new(),
            Self::Object(_) => self.python_repr(),
            Self::String(value) => value.clone(),
            Self::Signed(0) | Self::Unsigned(0) => String::new(),
            Self::Signed(value) => value.to_string(),
            Self::Unsigned(value) => value.to_string(),
        }
    }

    fn python_repr(&self) -> String {
        match self {
            Self::Object(fields) => {
                let mut output = String::from("{");
                for (index, (key, value)) in fields.iter().enumerate() {
                    if index > 0 {
                        output.push_str(", ");
                    }
                    output.push_str(&python_string_repr(key));
                    output.push_str(": ");
                    output.push_str(&value.python_repr());
                }
                output.push('}');
                output
            }
            Self::String(value) => python_string_repr(value),
            Self::Signed(value) => value.to_string(),
            Self::Unsigned(value) => value.to_string(),
        }
    }

    fn unsigned_shortcut_id(&self) -> Option<u32> {
        match self {
            Self::Signed(value) => Some(*value as u32),
            Self::Unsigned(value) => Some(*value as u32),
            Self::String(value) => parse_wrapped_shortcut_id(value),
            Self::Object(_) => None,
        }
    }

    fn explicit_id(&self) -> Option<u32> {
        match self {
            Self::Signed(value) => Some(*value as u32),
            Self::Unsigned(value) => Some(*value as u32),
            Self::String(value) => parse_wrapped_shortcut_id(value),
            Self::Object(_) => None,
        }
    }

}
fn python_string_repr(value: &str) -> String {
    let quote = if value.contains('\'') && !value.contains('"') { '"' } else { '\'' };
    let mut output = String::with_capacity(value.len() + 2);
    output.push(quote);
    for character in value.chars() {
        match character {
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character == quote => {
                output.push('\\');
                output.push(character);
            }
            character if character.is_control() => {
                let (escape, digits) = match character as u32 {
                    value if value <= 0xff => ("\\x", 2),
                    value if value <= 0xffff => ("\\u", 4),
                    _ => ("\\U", 8),
                };
                output.push_str(escape);
                push_hex(&mut output, character as u32, digits);
            }
            character => output.push(character),
        }
    }
    output.push(quote);
    output
}

fn push_hex(output: &mut String, value: u32, digits: usize) {
    for shift in (0..digits).rev() {
        let digit = ((value >> (shift * 4)) & 0xf) as u8;
        output.push(char::from_digit(digit as u32, 16).expect("hex digit"));
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shortcut {
    pub name: String,
    pub exe: String,
    pub exe_raw: String,
    pub start_dir: String,
    pub launch_options: String,
    pub shortcut_path: String,
    pub icon: String,
    pub appid_raw: Option<VdfValue>,
    pub app_id: u32,
    pub source: &'static str,
    pub steam_user_id: String,
    pub shortcut_file: PathBuf,
}

pub fn shortcut_app_id(exe: &str, name: &str) -> u32 {
    let mut hasher = Crc32Hasher::new();
    hasher.update(exe.as_bytes());
    hasher.update(name.as_bytes());
    hasher.finalize() | 0x8000_0000
}

pub fn normalize_shortcut_app_id(value: Option<&VdfValue>, exe: &str, name: &str) -> u32 {
    value
        .and_then(VdfValue::unsigned_shortcut_id)
        .or_else(|| (!exe.is_empty() || !name.is_empty()).then(|| shortcut_app_id(exe, name)))
        .unwrap_or(0)
}

pub fn parse_shortcuts_vdf(data: &[u8], path: &Path) -> Vec<Shortcut> {
    if data.len() as u64 > MAX_SHORTCUTS_VDF_BYTES {
        return Vec::new();
    }
    let (root, _) = match parse_object(data, 0, 0) {
        Ok(parsed) => parsed,
        Err(_) => return parse_text_fallback(data, path),
    };
    let container = object_get(&root, "shortcuts").unwrap_or(&root);
    let VdfValue::Object(entries) = container else {
        return parse_text_fallback(data, path);
    };

    let steam_user_id = steam_user_id_from_shortcut_path(path);
    let mut shortcuts = Vec::with_capacity(entries.len().min(MAX_SHORTCUTS_VDF_ENTRIES));
    for (_, value) in entries {
        if shortcuts.len() >= MAX_SHORTCUTS_VDF_ENTRIES {
            break;
        }
        let VdfValue::Object(fields) = value else {
            continue;
        };
        let name = vdf_get(fields, &["appname", "AppName", "name"])
            .map(VdfValue::python_string)
            .unwrap_or_default()
            .trim()
            .to_owned();
        if name.is_empty() {
            continue;
        }
        let exe_raw = vdf_get(fields, &["exe", "Exe"])
            .map(VdfValue::python_string)
            .unwrap_or_default()
            .trim()
            .to_owned();
        let exe = strip_surrounding_quotes(&exe_raw);
        let start_dir = field_text(fields, &["startdir", "StartDir"]);
        let launch_options = field_text(fields, &["launchoptions", "LaunchOptions"]);
        let shortcut_path = field_text(fields, &["shortcutpath", "ShortcutPath"]);
        let icon = field_text(fields, &["icon", "Icon"]);
        let appid_raw = vdf_get(fields, &["appid", "AppID"]).cloned();
        let app_id = normalize_shortcut_app_id(appid_raw.as_ref(), &exe, &name);
        shortcuts.push(Shortcut {
            name,
            exe,
            exe_raw,
            start_dir,
            launch_options,
            shortcut_path,
            icon,
            appid_raw,
            app_id,
            source: "steam_shortcuts_vdf",
            steam_user_id: steam_user_id.clone(),
            shortcut_file: path.to_path_buf(),
        });
    }
    shortcuts
}

pub fn read_shortcuts_vdf(path: &Path) -> Vec<Shortcut> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let Ok(metadata) = file.metadata() else {
        return Vec::new();
    };
    if metadata.len() == 0 || metadata.len() > MAX_SHORTCUTS_VDF_BYTES {
        return Vec::new();
    }
    let mut bounded: Take<File> = file.take(MAX_SHORTCUTS_VDF_BYTES + 1);
    let mut data = Vec::with_capacity(metadata.len() as usize);
    if bounded.read_to_end(&mut data).is_err() || data.len() as u64 > MAX_SHORTCUTS_VDF_BYTES {
        return Vec::new();
    }
    parse_shortcuts_vdf(&data, path)
}

pub fn name_eligibility(app_id: u32, shortcuts: &[Shortcut]) -> &'static str {
    if app_id == 0 {
        return "shortcut_not_found";
    }
    for shortcut in shortcuts {
        let raw = shortcut.appid_raw.as_ref();
        let raw_is_missing = raw.is_none() || matches!(raw, Some(VdfValue::String(value)) if value.is_empty());
        if raw_is_missing {
            if shortcut.app_id == app_id {
                return "derived_shortcut_id";
            }
            continue;
        }
        if raw.and_then(VdfValue::explicit_id) == Some(app_id) {
            return "ready";
        }
    }
    "shortcut_not_found"
}

pub fn steam_user_id_from_shortcut_path(path: &Path) -> String {
    let parts = path.components().map(|part| part.as_os_str().to_string_lossy());
    let mut userdata = false;
    for part in parts {
        if userdata {
            return part.into_owned();
        }
        userdata = part.as_ref() == "userdata";
    }
    String::new()
}

pub fn strip_surrounding_quotes(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn field_text(fields: &[(String, VdfValue)], names: &[&str]) -> String {
    vdf_get(fields, names)
        .map(VdfValue::python_string)
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn object_get<'a>(object: &'a VdfValue, key: &str) -> Option<&'a VdfValue> {
    let VdfValue::Object(fields) = object else {
        return None;
    };
    fields
        .iter()
        .rev()
        .find(|(name, _)| name.as_str() == key)
        .map(|(_, value)| value)
}

fn vdf_get<'a>(fields: &'a [(String, VdfValue)], names: &[&str]) -> Option<&'a VdfValue> {
    for name in names {
        if let Some((_, value)) = fields
            .iter()
            .rev()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
        {
            return Some(value);
        }
    }
    None
}


fn parse_wrapped_shortcut_id(value: &str) -> Option<u32> {
    let bytes = value.trim().as_bytes();
    let (negative, start) = match bytes.first() {
        Some(b'-') => (true, 1),
        Some(b'+') => (false, 1),
        _ => (false, 0),
    };
    if start == bytes.len() {
        return None;
    }
    let mut id = 0_u32;
    for (index, byte) in bytes.iter().enumerate().skip(start) {
        if byte.is_ascii_digit() {
            id = id.wrapping_mul(10).wrapping_add((byte - b'0') as u32);
        } else if *byte != b'_'
            || index == start
            || index + 1 == bytes.len()
            || !bytes[index - 1].is_ascii_digit()
            || !bytes[index + 1].is_ascii_digit()
        {
            return None;
        }
    }
    Some(if negative { 0_u32.wrapping_sub(id) } else { id })
}

fn read_cstring(data: &[u8], mut pos: usize) -> (String, usize) {
    if pos >= data.len() {
        return (String::new(), data.len());
    }
    match data[pos..].iter().position(|byte| *byte == 0) {
        Some(offset) => {
            let end = pos + offset;
            let value = String::from_utf8_lossy(&data[pos..end]).into_owned();
            (value, end + 1)
        }
        None => {
            pos = data.len();
            (String::new(), pos)
        }
    }
}

fn parse_object(data: &[u8], mut pos: usize, depth: usize) -> Result<(VdfValue, usize), ()> {
    if depth > MAX_SHORTCUTS_VDF_DEPTH {
        return Err(());
    }
    let mut result: Vec<(String, VdfValue)> = Vec::new();
    while pos < data.len() {
        let value_type = data[pos];
        pos += 1;
        if value_type == 0x08 {
            break;
        }
        let (key, next) = read_cstring(data, pos);
        pos = next;
        let value = match value_type {
            0x00 => {
                let (child, next) = parse_object(data, pos, depth + 1)?;
                pos = next;
                child
            }
            0x01 => {
                let (value, next) = read_cstring(data, pos);
                pos = next;
                VdfValue::String(value)
            }
            0x02 => {
                if pos + 4 > data.len() {
                    break;
                }
                let value = i32::from_le_bytes(data[pos..pos + 4].try_into().unwrap());
                pos += 4;
                VdfValue::Signed(value)
            }
            0x07 => {
                if pos + 8 > data.len() {
                    break;
                }
                let value = u64::from_le_bytes(data[pos..pos + 8].try_into().unwrap());
                pos += 8;
                VdfValue::Unsigned(value)
            }
            _ => break,
        };
        if let Some(index) = result.iter().position(|(existing, _)| existing == &key) {
            result[index].1 = value;
        } else {
            result.push((key, value));
        }
    }
    Ok((VdfValue::Object(result), pos))
}

fn parse_text_fallback(data: &[u8], path: &Path) -> Vec<Shortcut> {
    let text = String::from_utf8_lossy(data);
    let names = nul_field_values(&text, "appname", false);
    let exes = nul_field_values(&text, "exe", false);
    let options = nul_field_values(&text, "launchoptions", true);
    let icons = nul_field_values(&text, "icon", true);
    let steam_user_id = steam_user_id_from_shortcut_path(path);
    names
        .into_iter()
        .take(MAX_SHORTCUTS_VDF_ENTRIES)
        .enumerate()
        .filter_map(|(index, raw_name)| {
            let name = raw_name.trim().to_owned();
            if name.is_empty() {
                return None;
            }
            let exe_raw = exes.get(index).map(|value| value.trim()).unwrap_or_default().to_owned();
            let exe = strip_surrounding_quotes(&exe_raw);
            let launch_options = options.get(index).map(|value| value.trim()).unwrap_or_default().to_owned();
            let icon = icons.get(index).map(|value| value.trim()).unwrap_or_default().to_owned();
            let app_id = shortcut_app_id(&exe, &name);
            Some(Shortcut {
                name,
                exe,
                exe_raw,
                start_dir: String::new(),
                launch_options,
                shortcut_path: String::new(),
                icon,
                appid_raw: None,
                app_id,
                source: "steam_shortcuts_vdf",
                steam_user_id: steam_user_id.clone(),
                shortcut_file: path.to_path_buf(),
            })
        })
        .collect()
}

fn nul_field_values(text: &str, key: &str, allow_empty: bool) -> Vec<String> {
    let bytes = text.as_bytes();
    let key = key.as_bytes();
    let mut values = Vec::new();
    let mut pos = 0;
    while pos + key.len() < bytes.len() {
        if bytes[pos..pos + key.len()].eq_ignore_ascii_case(key) && bytes[pos + key.len()] == 0 {
            let start = pos + key.len() + 1;
            let end = bytes[start..]
                .iter()
                .position(|byte| *byte == 0)
                .map(|offset| start + offset)
                .unwrap_or(bytes.len());
            if allow_empty || end > start {
                values.push(String::from_utf8_lossy(&bytes[start..end]).into_owned());
            }
            pos = end.saturating_add(1);
        } else {
            pos += 1;
        }
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cstring(value: &[u8]) -> Vec<u8> {
        let mut out = value.to_vec();
        out.push(0);
        out
    }

    fn field(key: &str, value: &str) -> Vec<u8> {
        let mut out = vec![0x01];
        out.extend(cstring(key.as_bytes()));
        out.extend(cstring(value.as_bytes()));
        out
    }

    fn integer_field(key: &str, value: i32) -> Vec<u8> {
        let mut out = vec![0x02];
        out.extend(cstring(key.as_bytes()));
        out.extend(value.to_le_bytes());
        out
    }

    fn unsigned_field(key: &str, value: u64) -> Vec<u8> {
        let mut out = vec![0x07];
        out.extend(cstring(key.as_bytes()));
        out.extend(value.to_le_bytes());
        out
    }

    fn object(key: &str, contents: Vec<u8>) -> Vec<u8> {
        let mut out = vec![0x00];
        out.extend(cstring(key.as_bytes()));
        out.extend(contents);
        out.push(0x08);
        out
    }

    fn fixture() -> Vec<u8> {
        let mut shortcut = field("appname", "Fixture Game");
        shortcut.extend(field("exe", "\"/games/fixture.sh\""));
        shortcut.extend(integer_field("appid", -1_982_527_788));
        let mut entries = object("0", shortcut);
        entries.push(0x08);
        object("shortcuts", entries)
    }

    #[test]
    fn renders_nested_values_like_python_string_conversion() {
        let value = VdfValue::Object(vec![
            ("name".to_owned(), VdfValue::String("D'Artagnan".to_owned())),
            ("zero".to_owned(), VdfValue::Signed(0)),
        ]);
        assert_eq!(value.python_string(), r#"{'name': "D'Artagnan", 'zero': 0}"#);
    }

    #[test]
    fn parses_signed_high_bit_ids_and_fields_without_writing() {
        let path = Path::new("/steam/userdata/765/config/shortcuts.vdf");
        let parsed = parse_shortcuts_vdf(&fixture(), path);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Fixture Game");
        assert_eq!(parsed[0].exe, "/games/fixture.sh");
        assert_eq!(parsed[0].appid_raw.as_ref().and_then(VdfValue::explicit_id), Some(2_312_439_508));
        assert_eq!(parsed[0].steam_user_id, "765");
        assert_eq!(name_eligibility(2_312_439_508, &parsed), "ready");
    }

    #[test]
    fn parses_unsigned_ids_and_partial_unknown_or_truncated_objects() {
        let mut shortcut = field("appname", "Unsigned ID");
        shortcut.extend(unsigned_field("appid", 0xffff_ffff_8000_0001));
        let mut entries = object("0", shortcut);
        entries.push(0x08);
        let parsed = parse_shortcuts_vdf(&object("shortcuts", entries), Path::new("shortcuts.vdf"));
        assert_eq!(parsed[0].app_id, 0x8000_0001);
        assert_eq!(name_eligibility(0x8000_0001, &parsed), "ready");

        let mut partial = field("appname", "Kept");
        partial.push(0x09);
        partial.extend(cstring(b"unknown"));
        let mut entries = object("0", partial);
        entries.push(0x08);
        let parsed = parse_shortcuts_vdf(&object("shortcuts", entries), Path::new("shortcuts.vdf"));
        assert_eq!(parsed[0].name, "Kept");

        let mut truncated = field("appname", "Before truncation");
        truncated.push(0x02);
        truncated.extend(cstring(b"appid"));
        truncated.extend([0x01, 0x02]);
        let mut entries = object("0", truncated);
        entries.push(0x08);
        let parsed = parse_shortcuts_vdf(&object("shortcuts", entries), Path::new("shortcuts.vdf"));
        assert_eq!(parsed[0].name, "Before truncation");
    }

    #[test]
    fn derives_missing_ids_and_rejects_derived_name_management() {
        let path = Path::new("/steam/userdata/1/config/shortcuts.vdf");
        let mut shortcut = field("appname", "Dérivé");
        shortcut.extend(field("exe", "/games/derive.sh"));
        let mut entries = object("0", shortcut);
        entries.push(0x08);
        let parsed = parse_shortcuts_vdf(&object("shortcuts", entries), path);
        let expected = shortcut_app_id("/games/derive.sh", "Dérivé");
        assert_eq!(parsed[0].app_id, expected);
        assert_eq!(name_eligibility(expected, &parsed), "derived_shortcut_id");
        assert_eq!(shortcut_app_id("/home/deck/Emulation/tools/launchers/game.sh", "SteamOS SRM Shortcut"), 4_023_471_294);
    }

    #[test]
    fn invalid_utf8_is_replaced_and_corrupt_input_uses_text_fallback() {
        let mut invalid_fields = vec![0x01];
        invalid_fields.extend(cstring(b"appname"));
        invalid_fields.extend(cstring(&[b'b', 0xff, b'd']));
        let mut invalid_entries = object("0", invalid_fields);
        invalid_entries.push(0x08);
        let invalid = object("shortcuts", invalid_entries);
        let parsed = parse_shortcuts_vdf(&invalid, Path::new("shortcuts.vdf"));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "b�d");

        let mut malformed = Vec::new();
        for depth in 0..=MAX_SHORTCUTS_VDF_DEPTH + 1 {
            malformed = object(&depth.to_string(), malformed);
        }
        malformed.extend_from_slice(b"\x01appname\0Fallback\0\x01exe\0/run/game\0");
        let parsed = parse_shortcuts_vdf(&malformed, Path::new("shortcuts.vdf"));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Fallback");
    }

    #[test]
    fn honors_depth_entry_and_file_bounds() {
        let mut nested = Vec::new();
        for depth in 0..=MAX_SHORTCUTS_VDF_DEPTH + 1 {
            nested = object(&depth.to_string(), nested);
        }
        assert!(parse_object(&nested, 0, 0).is_err());
        assert!(read_shortcuts_vdf(Path::new("/definitely/missing/shortcuts.vdf")).is_empty());

        let mut entries = Vec::new();
        for index in 0..MAX_SHORTCUTS_VDF_ENTRIES + 1 {
            entries.extend(object(&index.to_string(), field("appname", "Game")));
        }
        entries.push(0x08);
        let parsed = parse_shortcuts_vdf(&object("shortcuts", entries), Path::new("shortcuts.vdf"));
        assert_eq!(parsed.len(), MAX_SHORTCUTS_VDF_ENTRIES);
    }

    #[test]
    fn read_refuses_files_over_the_size_cap() {
        use std::sync::atomic::{AtomicU64, Ordering};

        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "metadata-vdf-cap-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("shortcuts.vdf");
        let oversized = vec![0; MAX_SHORTCUTS_VDF_BYTES as usize + 1];
        fs::write(&path, &oversized).unwrap();
        assert!(read_shortcuts_vdf(&path).is_empty());
        assert!(parse_shortcuts_vdf(&oversized, &path).is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
}
