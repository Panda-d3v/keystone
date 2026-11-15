"""T24 - A4 Entity Matcher: link extracted part and supplier strings to records.

Matching runs cheapest and most deterministic first, and stops at the
first confident answer:

1. ``exact``       - the string is a known key (``MF-8413-005``, ``S007``).
2. ``normalized``  - same key after stripping case, spaces and punctuation
                     (``MF8413005``, ``mf-8413-005``); for suppliers, also
                     legal suffixes and "(fictional)" tags.
3. ``embedding``   - similarity over part descriptions / supplier names.
                     Uses local ``bge-small`` (sentence-transformers) when
                     installed, else a character-trigram cosine so it
                     works offline with no extra dependencies.
4. ``llm``         - only when two or more candidates score >= 0.8 and are
                     within ``TIE_MARGIN`` of each other; the small model
                     picks one of *those* ids or none. It cannot add one.

Anything below ``MIN_SCORE`` (0.8) goes to review and is never auto-linked.
"""

from __future__ import annotations

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Iterable, Literal, Protocol, Sequence

from pydantic import BaseModel, Field

from contracts.models import Match

from .llm import LLMClient, get_client, sha256_bytes

log = logging.getLogger(__name__)

MIN_SCORE = 0.8
TIE_MARGIN = 0.05
TASK = "a4_match"

EntityType = Literal["part", "supplier"]

_LEGAL = re.compile(
    r"\b(co|company|corp|corporation|ltd|limited|llc|inc|incorporated|gmbh|ag|sa|de|cv|"
    r"pvt|private|plc|jsc|srl|bv|kk|industrial|industries)\b"
)


# --------------------------------------------------------------------------
# Records
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Entity:
    id: str
    type: EntityType
    label: str  # part description or supplier name
    aliases: tuple[str, ...] = ()


@dataclass
class MatchResult:
    """``match`` is set only when the link is safe to make automatically."""

    query: str
    type: EntityType
    match: Match | None
    candidates: list[Match] = field(default_factory=list)
    reason: str = ""

    @property
    def needs_review(self) -> bool:
        return self.match is None

    def explain(self, matcher: "EntityMatcher | None" = None) -> str:
        """One plain sentence for the intake queue."""
        noun = "part" if self.type == "part" else "supplier"
        if self.match is not None:
            label = matcher.label(self.match.entity_id) if matcher else ""
            how = {
                "exact": "an exact match",
                "normalized": f"the same {'code' if self.type == 'part' else 'name'} written differently",
                "embedding": f"a close description match ({self.match.score:.0%})",
                "llm": "the closest of several similar records, picked by the assistant",
            }[self.match.method]
            named = f" ({label})" if label and label != self.match.entity_id else ""
            return f'"{self.query}" is {noun} {self.match.entity_id}{named}: {how}.'
        plausible = [c for c in self.candidates if c.score >= 0.5]
        if plausible and plausible[0].score >= MIN_SCORE and len(plausible) > 1:
            options = ", ".join(f"{c.entity_id} ({c.score:.0%})" for c in plausible[:3])
            return (f'Several {noun}s look like "{self.query}": {options}. '
                    "Please pick the right one.")
        if plausible:
            best = plausible[0]
            return (f'"{self.query}" might be {noun} {best.entity_id} ({best.score:.0%} similar), '
                    "which is not close enough to link automatically. Please confirm.")
        return f'No {noun} on file looks like "{self.query}". Please check it.'


# --------------------------------------------------------------------------
# Similarity backends
# --------------------------------------------------------------------------


class Embedder(Protocol):
    name: str

    def similarity(self, query: str, labels: Sequence[str]) -> list[float]: ...


class TrigramEmbedder:
    """Character-trigram cosine. Deterministic, offline, no dependencies."""

    name = "trigram"

    def similarity(self, query: str, labels: Sequence[str]) -> list[float]:
        q = _trigrams(query)
        return [_cosine(q, _trigrams(label)) for label in labels]


class BgeEmbedder:
    """Local ``BAAI/bge-small-en-v1.5`` via sentence-transformers (optional)."""

    name = "bge-small"

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        from sentence_transformers import SentenceTransformer  # optional dependency

        self._model = SentenceTransformer(model_name)
        self._cache: dict[tuple[str, ...], object] = {}

    def similarity(self, query: str, labels: Sequence[str]) -> list[float]:
        key = tuple(labels)
        if key not in self._cache:
            self._cache[key] = self._model.encode(list(labels), normalize_embeddings=True)
        q = self._model.encode([query], normalize_embeddings=True)[0]
        return [max(0.0, float(v)) for v in self._cache[key] @ q]  # type: ignore[operator]


def default_embedder() -> Embedder:
    try:
        return BgeEmbedder()
    except Exception:  # not installed or no model files offline
        return TrigramEmbedder()


# --------------------------------------------------------------------------
# LLM tie-break
# --------------------------------------------------------------------------


class TieBreak(BaseModel):
    entity_id: str | None = Field(description="The id of the one candidate that is clearly the same entity, or null")
    reason: str


# --------------------------------------------------------------------------
# Matcher
# --------------------------------------------------------------------------


class EntityMatcher:
    def __init__(
        self,
        entities: Iterable[Entity],
        *,
        embedder: Embedder | None = None,
        client: LLMClient | None = None,
    ):
        self._entities: dict[EntityType, list[Entity]] = {"part": [], "supplier": []}
        self._exact: dict[tuple[EntityType, str], str] = {}
        self._norm: dict[tuple[EntityType, str], set[str]] = {}
        self._labels: dict[str, str] = {}
        for e in entities:
            self._entities[e.type].append(e)
            self._labels[e.id] = e.label
            self._exact[(e.type, e.id)] = e.id
            keys = {e.id, *e.aliases} | ({e.label} if e.type == "supplier" else set())
            for key in keys:
                self._norm.setdefault((e.type, normalize(key, e.type)), set()).add(e.id)
        self._embedder = embedder or TrigramEmbedder()
        self._client = client

    # -- construction ------------------------------------------------------

    @classmethod
    def from_rows(cls, parts: Iterable[dict], suppliers: Iterable[dict], **kw) -> "EntityMatcher":
        ents = [Entity(r["part_no"], "part", r.get("description", "")) for r in parts]
        ents += [
            Entity(r["supplier_id"], "supplier", r["name"],
                   aliases=tuple(a for a in (r.get("alias"),) if a))
            for r in suppliers
        ]
        return cls(ents, **kw)

    @classmethod
    def from_connection(cls, connection, **kw) -> "EntityMatcher":
        """Load parts and suppliers from the T10 Postgres tables."""
        parts = [{"part_no": p, "description": d} for p, d in connection.execute(
            "SELECT part_no, description FROM parts")]
        suppliers = [{"supplier_id": s, "name": n} for s, n in connection.execute(
            "SELECT supplier_id, name FROM suppliers")]
        return cls.from_rows(parts, suppliers, **kw)

    def label(self, entity_id: str) -> str:
        return self._labels.get(entity_id, "")

    # -- matching ----------------------------------------------------------

    def match_part(self, text: str) -> MatchResult:
        return self.match(text, "part")

    def match_supplier(self, text: str) -> MatchResult:
        return self.match(text, "supplier")

    def match(self, text: str, type: EntityType) -> MatchResult:
        query = " ".join((text or "").split())
        if not query:
            return MatchResult(text, type, None, reason="empty")

        hit = self._exact.get((type, query))
        if hit:
            return self._ok(query, type, hit, 1.0, "exact")

        ids = self._norm.get((type, normalize(query, type)), set())
        if len(ids) == 1:
            return self._ok(query, type, next(iter(ids)), 0.99, "normalized")
        if len(ids) > 1:
            cands = [Match(entity_id=i, score=0.99, method="normalized") for i in sorted(ids)]
            return self._tie_break(query, type, cands)

        pool = self._entities[type]
        if not pool:
            return MatchResult(query, type, None, reason="no records loaded")
        texts = [_embed_text(e) for e in pool]
        scores = self._embedder.similarity(_embed_query(query, type), texts)
        ranked = sorted(
            (Match(entity_id=e.id, score=round(min(max(s, 0.0), 1.0), 4), method="embedding")
             for e, s in zip(pool, scores)),
            key=lambda m: m.score, reverse=True,
        )[:5]
        above = [m for m in ranked if m.score >= MIN_SCORE]
        if not above:
            return MatchResult(query, type, None, ranked,
                               reason=f"best score {ranked[0].score:.2f} is below {MIN_SCORE}")
        close = [m for m in above if above[0].score - m.score <= TIE_MARGIN]
        if len(close) == 1:
            return MatchResult(query, type, above[0], ranked, reason=f"{self._embedder.name} similarity")
        return self._tie_break(query, type, close, ranked)

    def resolver(self, type: EntityType = "supplier"):
        """Callable for A3's ``resolve_supplier``: id or None (never a guess)."""

        def resolve(text: str) -> str | None:
            r = self.match(text, type)
            return r.match.entity_id if r.match else None

        return resolve

    # -- helpers -------------------------------------------------------------

    def _ok(self, query: str, type: EntityType, entity_id: str, score: float, method: str) -> MatchResult:
        m = Match(entity_id=entity_id, score=score, method=method)
        return MatchResult(query, type, m, [m], reason=method)

    def _tie_break(
        self, query: str, type: EntityType, close: list[Match], ranked: list[Match] | None = None
    ) -> MatchResult:
        ranked = ranked or close
        allowed = {m.entity_id: m for m in close}
        listing = "\n".join(f"- {m.entity_id}: {self._labels.get(m.entity_id, '')}" for m in close)
        try:
            client = self._client or get_client()
            out = client.extract(
                TieBreak,
                task=f"{TASK}_{type}",
                system="You match procurement records. Pick only from the listed candidates.",
                prompt=(f'Which {type} is "{query}"? Candidates:\n{listing}\n'
                        "Answer with one candidate id only if it is clearly the same entity; otherwise null."),
                file_sha256=sha256_bytes(f"{type}|{query}|{sorted(allowed)}".encode()),
                tier="small",
                max_tokens=512,
            )
        except Exception as exc:  # LLMError, network, no key: leave it for a person
            log.info("A4 tie-break unavailable for %r: %s", query, exc)
            return MatchResult(query, type, None, ranked, reason="several close candidates; needs a person")
        if out.entity_id in allowed:
            base = allowed[out.entity_id]
            return MatchResult(query, type, Match(entity_id=base.entity_id, score=base.score, method="llm"),
                               ranked, reason=out.reason)
        return MatchResult(query, type, None, ranked, reason="assistant could not choose between close candidates")


# --------------------------------------------------------------------------
# Normalization and trigram similarity
# --------------------------------------------------------------------------


def normalize(text: str, type: EntityType = "part") -> str:
    t = text.casefold()
    if type == "supplier":
        t = re.sub(r"\(.*?\)", " ", t)  # "(fictional)"
        t = t.replace("&", " and ")
        t = _LEGAL.sub(" ", re.sub(r"[^\w\s]", " ", t))
    return re.sub(r"[\W_]+", "", t)


def _embed_text(e: Entity) -> str:
    return normalize(e.label, "supplier") if e.type == "supplier" else e.label.casefold()


def _embed_query(q: str, type: EntityType) -> str:
    return normalize(q, "supplier") if type == "supplier" else q.casefold()


def _trigrams(text: str) -> Counter:
    t = "  " + " ".join(text.casefold().split()) + " "
    return Counter(t[i:i + 3] for i in range(len(t) - 2))


def _cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    dot = sum(v * b[k] for k, v in a.items() if k in b)
    return dot / (math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values())))
