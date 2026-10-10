"""Assert adaptive manifest fields required by src/trailers/runtime.ts.

These checks cover response structure and URLs, not browser codec support/playback.
"""
from __future__ import annotations

import math
import re
import urllib.parse
import xml.etree.ElementTree as ET

from scripts.endpoint_health import ContractError, require


def media_url(value: str, base: str) -> str:
    url = urllib.parse.urljoin(base, value)
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    require(parsed.scheme == "https" and host and not parsed.username and not parsed.password
            and host not in ("localhost", "steamloopback.host")
            and not host.endswith((".localhost", ".steamloopback.host", ".local", ".internal", ".lan", ".home", ".onion"))
            and ":" not in host and not re.fullmatch(r"\d+(?:\.\d+){0,3}", host),
            "Trailer manifest URL is not safe public HTTPS")
    return url


def hls_attributes(value: str) -> dict[str, str]:
    fields = re.findall(r'(?:[^,\"]|\"(?:[^\"\\]|\\.)*\")+', value)
    require(",".join(fields) == value, "Malformed HLS attributes")
    result = {}
    for field in fields:
        key, separator, raw = field.partition("=")
        require(separator and re.fullmatch(r"[A-Z0-9-]+", key.strip()) and raw.strip(), "Malformed HLS attribute")
        result[key.strip()] = raw.strip().strip('"')
    return result


def hls_tracks(text: str, url: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    require(lines and lines[0] == "#EXTM3U", "Steam HLS response is not a master playlist")
    groups: dict[str, list[dict[str, str]]] = {}
    variants: list[tuple[int, dict[str, str], str]] = []
    for index, line in enumerate(lines):
        if line.startswith("#EXT-X-SESSION-KEY:"):
            require(hls_attributes(line.split(":", 1)[1]).get("METHOD") == "NONE", "Encrypted HLS is unsupported")
        elif line.startswith("#EXT-X-MEDIA:"):
            attributes = hls_attributes(line.split(":", 1)[1])
            if attributes.get("TYPE") == "AUDIO":
                groups.setdefault(attributes.get("GROUP-ID", ""), []).append(attributes)
        elif line.startswith("#EXT-X-STREAM-INF:"):
            attributes = hls_attributes(line.split(":", 1)[1])
            codecs = [codec.strip() for codec in attributes.get("CODECS", "").split(",")]
            if not any(re.match(r"avc1\.", codec, re.I) for codec in codecs):
                continue
            if index + 1 >= len(lines) or lines[index + 1].startswith("#"):
                continue
            height_match = re.fullmatch(r"\d+x(\d+)", attributes.get("RESOLUTION", ""))
            height = int(height_match[1]) if height_match else 0
            variants.append((height, attributes, media_url(lines[index + 1], url)))
    require(bool(variants), "Steam HLS master has no AVC stream declaration with a usable URI")
    _height, selected, video_url = min(variants, key=lambda item: abs(item[0] - 720) if item[0] else math.inf)
    tracks = [video_url]
    if selected.get("AUDIO"):
        group = groups.get(selected["AUDIO"], [])
        require(bool(group) and any(re.match(r"mp4a\.", codec.strip(), re.I)
                for codec in selected.get("CODECS", "").split(",")), "Steam HLS audio group/codec is unavailable")
        audio = next((item for item in group if item.get("DEFAULT") == "YES"), group[0])
        require(bool(audio.get("URI")), "Steam HLS audio rendition has no URI")
        tracks.append(media_url(audio["URI"], url))
    return tracks


def validate_hls_media(text: str, url: str) -> None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    require(lines and lines[0] == "#EXTM3U" and "#EXT-X-ENDLIST" in lines, "Steam HLS media is not static VOD")
    init_url = None
    pending = None
    ended = False
    segments = 0
    for line in lines[1:]:
        if line.startswith("#EXT-X-KEY:"):
            require(hls_attributes(line.split(":", 1)[1]).get("METHOD") == "NONE", "Encrypted HLS media is unsupported")
        elif line.startswith(("#EXT-X-BYTERANGE", "#EXT-X-DISCONTINUITY", "#EXT-X-PART")):
            raise ContractError("Unsupported HLS media timeline")
        elif line.startswith("#EXT-X-MAP:"):
            attributes = hls_attributes(line.split(":", 1)[1])
            require(attributes.get("URI") and not attributes.get("BYTERANGE") and not init_url and not segments,
                    "Steam HLS initialization map is invalid")
            init_url = media_url(attributes["URI"], url)
        elif line.startswith("#EXTINF:"):
            require(pending is None and not ended, "Malformed HLS segment duration")
            try:
                pending = float(line.split(":", 1)[1].split(",", 1)[0])
            except ValueError as error:
                raise ContractError("HLS segment duration is not numeric") from error
            require(math.isfinite(pending) and pending > 0, "HLS segment duration is invalid")
        elif line == "#EXT-X-ENDLIST":
            ended = True
        elif not line.startswith("#"):
            require(not ended and init_url and pending is not None and segments < 100000, "Malformed HLS segment timeline")
            media_url(line, url)
            segments += 1
            pending = None
    require(init_url and segments and ended and pending is None, "Incomplete HLS VOD playlist")


def children(node: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in node if child.tag.split("}")[-1] == name]


def iso_duration(value: str) -> float:
    match = re.fullmatch(r"P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?", value)
    require(match is not None and any(match.groups()), "DASH presentation duration is invalid")
    return sum(float(part or 0) * scale for part, scale in zip(match.groups(), (86400, 3600, 60, 1)))


def integer(value: str, *, minimum: int) -> int:
    try:
        number = float(value)
    except ValueError as error:
        raise ContractError("DASH timebase is not numeric") from error
    require(math.isfinite(number) and number.is_integer() and minimum <= number <= 2**53 - 1, "Invalid DASH timebase")
    return int(number)


def validate_dash(text: str, url: str) -> None:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ContractError("Steam DASH response is not XML") from error
    require(root.tag.split("}")[-1] == "MPD" and root.get("type") == "static"
            and not any(node.tag.split("}")[-1] in ("SegmentBase", "SegmentList", "ContentProtection") for node in root.iter()),
            "Unsupported DASH manifest")
    periods = children(root, "Period")
    require(len(periods) == 1, "DASH requires one Period")
    period = periods[0]
    require(not period.get("start") or iso_duration(period.get("start")) == 0, "DASH Period must start at zero")
    duration = iso_duration(period.get("duration") or root.get("mediaPresentationDuration") or "")
    require(math.isfinite(duration) and duration > 0, "DASH duration must be finite and positive")
    supported = {"video": False, "audio": False}
    advertised_audio = False
    for adaptation in children(period, "AdaptationSet"):
        kind = "audio" if adaptation.get("contentType") == "audio" or adaptation.get("mimeType", "").startswith("audio/") else "video"
        advertised_audio = advertised_audio or kind == "audio"
        for representation in children(adaptation, "Representation"):
            try:
                codec = representation.get("codecs") or adaptation.get("codecs") or ""
                mime = representation.get("mimeType") or adaptation.get("mimeType")
                require(mime == f"{kind}/mp4" and re.match(r"mp4a\." if kind == "audio" else r"(?:avc1|av01)\.", codec, re.I),
                        "DASH rendition codec/MIME is unsupported")
                representation_id = representation.get("id")
                require(bool(representation_id), "DASH representation has no id")
                bandwidth = float(representation.get("bandwidth") or 0)
                require(math.isfinite(bandwidth) and bandwidth >= 0, "DASH bandwidth is invalid")
                attributes: dict[str, str] = {}
                timeline = None
                base = url
                for node in (root, period, adaptation, representation):
                    bases = children(node, "BaseURL")
                    base = media_url((bases[0].text or "").strip() if bases else "", base)
                    templates = children(node, "SegmentTemplate")
                    if templates:
                        attributes.update(templates[0].attrib)
                        timelines = children(templates[0], "SegmentTimeline")
                        if timelines:
                            timeline = timelines[0]
                require(attributes.get("initialization") and attributes.get("media"), "DASH segment templates are missing")
                timescale = integer(attributes.get("timescale", "1"), minimum=1)
                offset = integer(attributes.get("presentationTimeOffset", "0"), minimum=0)
                integer(attributes.get("startNumber", "1"), minimum=0)
                if timeline is None:
                    ticks = integer(attributes.get("duration", "0"), minimum=1)
                    require(1 <= math.ceil(duration * timescale / ticks) <= 100000, "DASH segment count is invalid")
                else:
                    entries = children(timeline, "S")
                    require(bool(entries), "DASH SegmentTimeline is empty")
                    tick = count = 0
                    visible = False
                    for index, entry in enumerate(entries):
                        ticks = integer(entry.get("d", "0"), minimum=1)
                        repeat = integer(entry.get("r", "0"), minimum=-1)
                        if entry.get("t") is not None:
                            tick = integer(entry.get("t"), minimum=0)
                        boundary = next((integer(item.get("t"), minimum=0) for item in entries[index + 1:] if item.get("t") is not None),
                                        offset + duration * timescale)
                        repetitions = math.ceil((boundary - tick) / ticks) if repeat == -1 else repeat + 1
                        require(1 <= repetitions <= 100000 and count + repetitions <= 100000, "DASH repeat is invalid")
                        end = tick + repetitions * ticks
                        visible = visible or (end > offset and tick < offset + duration * timescale)
                        tick = end
                        count += repetitions
                    require(visible, "DASH timeline has no visible segments")
                for key in ("initialization", "media"):
                    expanded = attributes[key].replace("$RepresentationID$", representation_id).replace("$Bandwidth$", str(bandwidth))
                    expanded = expanded.replace("$Time$", "0")
                    expanded = re.sub(r"\$Number(?:%0\d+d)?\$", "0", expanded).replace("$$", "$")
                    media_url(expanded, base)
                supported[kind] = True
            except (ContractError, ValueError):
                continue
    require(supported["video"], "DASH has no usable video codec/initialization/segment template")
    require(not advertised_audio or supported["audio"], "DASH advertised audio rendition is unusable")
