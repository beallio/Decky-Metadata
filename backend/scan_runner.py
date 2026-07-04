from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, TypedDict

PlogFn = Callable[..., None]


class ScanPipelineResult(TypedDict):
    status: str
    metadata: dict[str, Any] | None
    source: str


class ScanPipelineTarget(TypedDict):
    app_id: int
    title: str
    metadata: dict[str, Any] | None


def new_scan_progress(status: str) -> dict[str, Any]:
    return {
        "running": status == "running",
        "status": status,
        "total": 0,
        "completed": 0,
        "assigned": 0,
        "failed": 0,
        "current": "",
        "message": "",
        "error": "",
    }


def scan_pipeline_message(
    result: ScanPipelineResult,
    title: str,
    matched_messages: dict[str, str],
    miss_message: str,
) -> str:
    if result["status"] == "matched":
        template = matched_messages.get(result["source"], matched_messages.get("", "Saved metadata for {title}"))
        return template.format(title=title)
    return miss_message.format(title=title)


async def run_scan_pipeline(
    targets: list[ScanPipelineTarget],
    progress: dict[str, Any],
    resolver: Callable[[Any], ScanPipelineResult],
    saver: Callable[[int, dict[str, Any]], Awaitable[None]],
    *,
    initial_message: str,
    matched_messages: dict[str, str],
    miss_message: str,
    error_message: str,
    log_message: str,
    plog: PlogFn,
) -> None:
    progress.update({"total": len(targets), "completed": 0})
    for target in targets:
        title = target["title"]
        app_id = target["app_id"]
        current = f"{progress['completed'] + 1}/{len(targets)} - {title}" if title else f"{progress['completed'] + 1}/{len(targets)}"
        progress["current"] = current
        progress["message"] = initial_message.format(title=title)
        try:
            result = await asyncio.to_thread(resolver, target)
            if result["metadata"] is not None:
                await saver(app_id, result["metadata"])
            if result["status"] == "matched":
                progress["assigned"] += 1
            else:
                progress["failed"] += 1
            progress["message"] = scan_pipeline_message(
                result,
                title,
                matched_messages,
                miss_message,
            )
        except Exception as error:
            progress["failed"] += 1
            progress["message"] = error_message.format(title=title)
            progress["error"] = str(error)
            plog("load", log_message, level=logging.ERROR, exc=True, title=title, app_id=app_id, error=error)
        finally:
            progress["completed"] += 1
    progress["running"] = False
    progress["status"] = "completed"
    progress["current"] = ""
