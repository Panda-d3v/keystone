"""T20 - LLM client for the Keystone agents (A1-A5).

Every agent calls the model through ``LLMClient.extract``. The client:

* asks for structured output against a Pydantic schema and returns a
  validated instance (agents never parse free text);
* caches each result on disk keyed by the SHA-256 of the source file plus
  the agent task name, so the second run of any document makes zero
  model calls;
* has a replay mode (``REPLAY=1``) that only serves cached outputs and
  fails loudly on a cache miss, so the demo can run with Wi-Fi off.

Trust rule: this module returns extracted facts only. Nothing here may
compute or write a number into the exposure, decision or evidence-status
tables; only ``api/rules`` does that.

Environment variables:

* ``REPLAY`` - ``1`` serves cache only; a miss raises ``CacheMiss``.
* ``KEYSTONE_LLM_CACHE`` - cache directory (default ``api/agents/cache``).
* ``KEYSTONE_MODEL_LARGE`` - extraction/drafting model (default ``claude-opus-5-5``).
* ``KEYSTONE_MODEL_SMALL`` - routing model (default ``claude-haiku-5-5``).
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Protocol, Sequence, TypeVar, Union

from pydantic import BaseModel

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
Tier = Literal["large", "small"]

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / "cache"
DEFAULT_MODELS: dict[str, str] = {
    "large": "claude-opus-5-5",
    "small": "claude-haiku-5-5",
}
CACHE_FORMAT_VERSION = 1

_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


class LLMError(RuntimeError):
    """Base class for LLM client failures."""


class CacheMiss(LLMError):
    """Raised in replay mode when no cached output exists for a request."""


class LLMRefusal(LLMError):
    """Raised when the model declines the request (stop_reason == "refusal")."""


class LLMOutputError(LLMError):
    """Raised when the model's output does not validate against the schema."""


# --------------------------------------------------------------------------
# Inputs
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Attachment:
    """A file passed to the model as a document or image content block."""

    data: bytes
    media_type: str
    name: str = ""

    @classmethod
    def from_path(cls, path: Union[str, Path]) -> "Attachment":
        p = Path(path)
        suffix = p.suffix.lower()
        if suffix == ".pdf":
            media_type = "application/pdf"
        elif suffix in _IMAGE_TYPES:
            media_type = _IMAGE_TYPES[suffix]
        else:
            media_type = "text/plain"
        return cls(data=p.read_bytes(), media_type=media_type, name=p.name)

    @property
    def sha256(self) -> str:
        return sha256_bytes(self.data)

    def to_content_block(self) -> dict[str, Any]:
        if self.media_type == "application/pdf":
            return {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.b64encode(self.data).decode("ascii"),
                },
            }
        if self.media_type.startswith("image/"):
            return {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": self.media_type,
                    "data": base64.b64encode(self.data).decode("ascii"),
                },
            }
        return {
            "type": "document",
            "source": {
                "type": "text",
                "media_type": "text/plain",
                "data": self.data.decode("utf-8", errors="replace"),
            },
        }


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Union[str, Path]) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass(frozen=True)
class LLMRequest:
    """Everything a backend needs to make one structured-output call."""

    model: str
    system: str
    prompt: str
    schema: type[BaseModel]
    attachments: tuple[Attachment, ...] = ()
    max_tokens: int = 16000

    def messages(self) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = [a.to_content_block() for a in self.attachments]
        content.append({"type": "text", "text": self.prompt})
        return [{"role": "user", "content": content}]


# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------


class Backend(Protocol):
    """Makes one model call and returns the structured output as a dict."""

    def generate(self, request: LLMRequest) -> dict[str, Any]: ...


class AnthropicBackend:
    """Claude via the official Anthropic SDK with Pydantic structured output.

    Uses server-side refusal fallbacks (``fallbacks="default"``) so a
    safety-classifier refusal on the primary model is retried on a
    suitable fallback model instead of failing the demo.
    """

    FALLBACK_BETA = "server-side-fallback-2026-07-01"

    def __init__(self, client: Any = None, *, timeout: float = 60.0, use_fallbacks: bool = True):
        if client is None:
            import anthropic  # imported lazily so replay mode needs no SDK or key

            client = anthropic.Anthropic(timeout=timeout)
        self._client = client
        self._use_fallbacks = use_fallbacks

    def generate(self, request: LLMRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = dict(
            model=request.model,
            max_tokens=request.max_tokens,
            system=request.system,
            messages=request.messages(),
            output_format=request.schema,
        )
        if self._use_fallbacks:
            kwargs["betas"] = [self.FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
            response = self._client.beta.messages.parse(**kwargs)
        else:
            response = self._client.messages.parse(**kwargs)

        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            raise LLMRefusal(f"model refused {request.schema.__name__} request: {details}")
        if response.stop_reason == "max_tokens":
            raise LLMOutputError(
                f"{request.schema.__name__} output truncated at max_tokens={request.max_tokens}"
            )
        parsed = response.parsed_output
        if parsed is None:
            raise LLMOutputError(f"no parsed output for {request.schema.__name__}")
        return parsed.model_dump(mode="json")


# --------------------------------------------------------------------------
# Cache
# --------------------------------------------------------------------------


class ResponseCache:
    """On-disk JSON cache: ``<dir>/<file sha256>/<task>.json``.

    One entry per (source file, agent task). Entries record the prompt and
    schema fingerprint so a changed prompt is refreshed in live mode, while
    replay mode serves whatever was recorded.
    """

    def __init__(self, directory: Union[str, Path]):
        self.directory = Path(directory)

    def _path(self, file_sha256: str, task: str) -> Path:
        if not _is_hex64(file_sha256):
            raise ValueError(f"cache key must be a SHA-256 hex digest, got {file_sha256!r}")
        safe_task = "".join(c if c.isalnum() or c in "-_." else "_" for c in task)
        return self.directory / file_sha256 / f"{safe_task}.json"

    def get(self, file_sha256: str, task: str) -> dict[str, Any] | None:
        path = self._path(file_sha256, task)
        if not path.exists():
            return None
        try:
            entry = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("ignoring unreadable cache entry %s: %s", path, exc)
            return None
        if entry.get("version") != CACHE_FORMAT_VERSION:
            return None
        return entry

    def put(self, file_sha256: str, task: str, entry: dict[str, Any]) -> Path:
        path = self._path(file_sha256, task)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"version": CACHE_FORMAT_VERSION, **entry}, indent=2, sort_keys=True)
        # Atomic write so a crash mid-demo never leaves a half-written entry.
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as fh:
                fh.write(payload)
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        return path

    def clear(self) -> None:
        if self.directory.exists():
            for p in self.directory.glob("*/*.json"):
                p.unlink()


def _is_hex64(value: str) -> bool:
    return len(value) == 64 and all(c in "0123456789abcdef" for c in value)


# --------------------------------------------------------------------------
# Client
# --------------------------------------------------------------------------


@dataclass
class CallStats:
    model_calls: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    by_task: dict[str, int] = field(default_factory=dict)


def replay_enabled() -> bool:
    return os.environ.get("REPLAY", "").strip().lower() in {"1", "true", "yes", "on"}


class LLMClient:
    """Structured-output client with a SHA-256-keyed cache and replay mode."""

    def __init__(
        self,
        backend: Backend | None = None,
        *,
        cache_dir: Union[str, Path, None] = None,
        replay: bool | None = None,
        models: dict[str, str] | None = None,
    ):
        self.replay = replay_enabled() if replay is None else replay
        self.cache = ResponseCache(
            cache_dir or os.environ.get("KEYSTONE_LLM_CACHE") or DEFAULT_CACHE_DIR
        )
        self.models = {
            "large": os.environ.get("KEYSTONE_MODEL_LARGE", DEFAULT_MODELS["large"]),
            "small": os.environ.get("KEYSTONE_MODEL_SMALL", DEFAULT_MODELS["small"]),
            **(models or {}),
        }
        self._backend = backend
        self.stats = CallStats()

    @property
    def backend(self) -> Backend:
        if self._backend is None:
            if self.replay:
                raise CacheMiss("replay mode has no backend; a cache entry is missing")
            self._backend = AnthropicBackend()
        return self._backend

    def extract(
        self,
        schema: type[T],
        *,
        task: str,
        prompt: str,
        file_sha256: str,
        system: str = "",
        attachments: Sequence[Attachment] = (),
        tier: Tier = "large",
        max_tokens: int = 16000,
    ) -> T:
        """Return ``schema`` filled in by the model, from cache when possible.

        ``file_sha256`` is the SHA-256 of the source document the extraction
        is about (for an .eml attachment, the attachment's own bytes). It is
        the cache key together with ``task``.
        """
        model = self.models[tier]
        fingerprint = _fingerprint(system, prompt, schema, model)
        entry = self.cache.get(file_sha256, task)

        if entry is not None and (self.replay or entry.get("fingerprint") == fingerprint):
            if entry.get("fingerprint") != fingerprint:
                log.warning("replay: serving %s/%s recorded with a different prompt", file_sha256[:12], task)
            self.stats.cache_hits += 1
            return self._validate(schema, entry["output"], source="cache")

        self.stats.cache_misses += 1
        if self.replay:
            raise CacheMiss(
                f"REPLAY=1 but no cached output for task={task!r} file_sha256={file_sha256}. "
                f"Run once with network access to record it (cache dir: {self.cache.directory})."
            )

        request = LLMRequest(
            model=model,
            system=system,
            prompt=prompt,
            schema=schema,
            attachments=tuple(attachments),
            max_tokens=max_tokens,
        )
        output = self.backend.generate(request)
        self.stats.model_calls += 1
        self.stats.by_task[task] = self.stats.by_task.get(task, 0) + 1

        result = self._validate(schema, output, source="model")
        self.cache.put(
            file_sha256,
            task,
            {
                "task": task,
                "file_sha256": file_sha256,
                "model": model,
                "schema": schema.__name__,
                "fingerprint": fingerprint,
                "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "output": result.model_dump(mode="json"),
            },
        )
        return result

    @staticmethod
    def _validate(schema: type[T], output: dict[str, Any], *, source: str) -> T:
        try:
            return schema.model_validate(output)
        except Exception as exc:  # pydantic.ValidationError, kept broad for custom validators
            raise LLMOutputError(f"{source} output does not match {schema.__name__}: {exc}") from exc


def _fingerprint(system: str, prompt: str, schema: type[BaseModel], model: str) -> str:
    blob = json.dumps(
        {
            "system": system,
            "prompt": prompt,
            "schema": schema.model_json_schema(),
            "model": model,
        },
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


_default_client: LLMClient | None = None


def get_client() -> LLMClient:
    """Process-wide client used by the agents unless one is injected."""
    global _default_client
    if _default_client is None:
        _default_client = LLMClient()
    return _default_client


def set_client(client: LLMClient | None) -> None:
    global _default_client
    _default_client = client
