from __future__ import annotations

import logging
import re
import zlib
from pathlib import Path
from typing import Any, Callable

MAX_SHORTCUTS_VDF_BYTES = 2 * 1024 * 1024
MAX_SHORTCUTS_VDF_DEPTH = 32
MAX_SHORTCUTS_VDF_ENTRIES = 2048

PlogFn = Callable[..., None]


def vdf_get(values: dict[str, Any], *names: str) -> Any:
    lowered = {str(key).casefold(): value for key, value in values.items()}
    for name in names:
        if name.casefold() in lowered:
            return lowered[name.casefold()]
    return None


def strip_surrounding_quotes(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] == '"':
        return stripped[1:-1]
    return stripped


def steam_user_id_from_shortcut_path(path: Path) -> str:
    try:
        parts = path.parts
        for index, part in enumerate(parts):
            if part == "userdata" and index + 1 < len(parts):
                return parts[index + 1]
    except Exception:
        pass
    return ""


def shortcut_app_id(exe: str, name: str) -> int:
    digest = zlib.crc32((exe + name).encode("utf-8", errors="ignore")) & 0xFFFFFFFF
    return (digest | 0x80000000) & 0xFFFFFFFF


def normalize_shortcut_app_id(value: Any, exe: str, name: str) -> int:
    if isinstance(value, int):
        return int(value) & 0xFFFFFFFF
    try:
        if value not in (None, ""):
            return int(value) & 0xFFFFFFFF
    except Exception:
        pass
    if exe or name:
        return shortcut_app_id(exe, name)
    return 0


def read_vdf_cstring(data: bytes, pos: int) -> tuple[str, int]:
    end = data.find(b"\x00", pos)
    if end < 0:
        return "", len(data)
    return data[pos:end].decode("utf-8", errors="replace"), end + 1


def parse_binary_vdf_object(
    data: bytes, pos: int, depth: int = 0
) -> tuple[dict[str, Any], int]:
    if depth > MAX_SHORTCUTS_VDF_DEPTH:
        raise ValueError("binary VDF nesting depth exceeded")
    result: dict[str, Any] = {}
    while pos < len(data):
        value_type = data[pos]
        pos += 1
        if value_type == 0x08:
            break
        key, pos = read_vdf_cstring(data, pos)
        if value_type == 0x00:
            child, pos = parse_binary_vdf_object(data, pos, depth + 1)
            result[key] = child
        elif value_type == 0x01:
            value, pos = read_vdf_cstring(data, pos)
            result[key] = value
        elif value_type == 0x02:
            if pos + 4 > len(data):
                break
            result[key] = int.from_bytes(data[pos : pos + 4], "little", signed=True)
            pos += 4
        elif value_type == 0x07:
            if pos + 8 > len(data):
                break
            result[key] = int.from_bytes(data[pos : pos + 8], "little", signed=False)
            pos += 8
        else:
            break
    return result, pos


def extract_shortcuts_from_vdf(path: Path, plog: PlogFn) -> list[dict[str, Any]]:
    try:
        try:
            size = path.stat().st_size
        except Exception as error:
            plog("shortcuts", "failed stat for shortcuts.vdf", level=logging.WARNING, path=path, error=error)
            return []
        if size <= 0:
            plog("shortcuts", "Steam shortcuts file is empty", level=logging.DEBUG, path=path)
            return []
        if size > MAX_SHORTCUTS_VDF_BYTES:
            plog("shortcuts", "Steam shortcuts file too large", level=logging.WARNING, path=path, size=size, cap=MAX_SHORTCUTS_VDF_BYTES)
            return []
        data = path.read_bytes()
    except Exception as error:
        plog("shortcuts", "failed reading shortcuts.vdf", level=logging.WARNING, path=path, exc=True, error=error)
        return []
    try:
        root, _pos = parse_binary_vdf_object(data, 0)
        container = root.get("shortcuts", root)
        if isinstance(container, dict):
            shortcuts: list[dict[str, Any]] = []
            for value in container.values():
                if len(shortcuts) >= MAX_SHORTCUTS_VDF_ENTRIES:
                    plog("shortcuts", "Steam shortcuts entry cap reached", level=logging.WARNING, path=path, cap=MAX_SHORTCUTS_VDF_ENTRIES)
                    break
                if not isinstance(value, dict):
                    continue
                name = str(
                    vdf_get(value, "appname", "AppName", "name") or ""
                ).strip()
                exe_raw = str(vdf_get(value, "exe", "Exe") or "").strip()
                exe = strip_surrounding_quotes(exe_raw)
                start_dir = str(
                    vdf_get(value, "startdir", "StartDir") or ""
                ).strip()
                launch_options = str(
                    vdf_get(value, "launchoptions", "LaunchOptions") or ""
                ).strip()
                shortcut_path = str(
                    vdf_get(value, "shortcutpath", "ShortcutPath") or ""
                ).strip()
                icon = str(vdf_get(value, "icon", "Icon") or "").strip()
                if name:
                    appid_raw = vdf_get(value, "appid", "AppID")
                    app_id = normalize_shortcut_app_id(appid_raw, exe, name)
                    shortcuts.append(
                        {
                            "name": name,
                            "exe": exe,
                            "exe_raw": exe_raw,
                            "start_dir": start_dir,
                            "launch_options": launch_options,
                            "shortcut_path": shortcut_path,
                            "icon": icon,
                            "appid": appid_raw,
                            "appid_raw": appid_raw,
                            "app_id": app_id,
                            "source": "steam_shortcuts_vdf",
                            "steam_user_id": steam_user_id_from_shortcut_path(path),
                            "shortcut_file": str(path),
                        }
                    )
            plog("shortcuts", "binary shortcuts.vdf parsed", level=logging.DEBUG, path=path, count=len(shortcuts))
            return shortcuts
    except Exception as error:
        plog("shortcuts", "failed parsing binary shortcuts.vdf", level=logging.WARNING, path=path, exc=True, error=error)
    text = data.decode("utf-8", errors="replace")
    names = re.findall(r"appname\x00([^\x00]+)", text, flags=re.IGNORECASE)
    exes = re.findall(r"exe\x00([^\x00]+)", text, flags=re.IGNORECASE)
    launch_options = re.findall(
        r"launchoptions\x00([^\x00]*)", text, flags=re.IGNORECASE
    )
    icons = re.findall(r"icon\x00([^\x00]*)", text, flags=re.IGNORECASE)
    shortcuts = []
    for index, name in enumerate(names[:MAX_SHORTCUTS_VDF_ENTRIES]):
        clean_name = name.strip()
        if not clean_name:
            continue
        exe_raw = exes[index].strip() if index < len(exes) else ""
        exe = strip_surrounding_quotes(exe_raw)
        launch_options_value = (
            launch_options[index].strip() if index < len(launch_options) else ""
        )
        app_id = shortcut_app_id(exe, clean_name)
        shortcuts.append(
            {
                "name": clean_name,
                "exe": exe,
                "exe_raw": exe_raw,
                "start_dir": "",
                "launch_options": launch_options_value,
                "shortcut_path": "",
                "icon": icons[index].strip() if index < len(icons) else "",
                "appid": None,
                "appid_raw": None,
                "app_id": app_id,
                "source": "steam_shortcuts_vdf",
                "steam_user_id": steam_user_id_from_shortcut_path(path),
                "shortcut_file": str(path),
            }
        )
    return shortcuts
