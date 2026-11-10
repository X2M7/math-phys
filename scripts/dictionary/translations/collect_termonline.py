#!/usr/bin/env python3
"""Cache public Termonline exact-term lookups for editorial review.

This collector never publishes a translation. An English spelling can name
different concepts in different disciplines; every proposed match needs review.
Only Python's standard library is required. Build commands do not invoke it.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REPO = Path(__file__).resolve().parents[3]
ENDPOINT = "https://api.termonline.cn/main-serve/business/tm/tmWord/drawWordSearch"
USER_AGENT = "math-phys-terminology-research/1.0 (https://github.com/X2M7/math-phys)"


def load_entries(path: Path) -> list[dict]:
    value = json.loads(path.read_text(encoding="utf-8"))
    entries = value if isinstance(value, list) else value.get("entries", [])
    if not isinstance(entries, list):
        raise ValueError(f"{path}: expected an array or an object with entries")
    return entries


def normalize_english(value: str) -> str:
    """Normalize typography only; do not discard words, accents or qualifiers."""
    value = unicodedata.normalize("NFKC", value)
    value = value.translate(str.maketrans({"–": "-", "−": "-", "‑": "-", "’": "'"}))
    return re.sub(r"\s+", " ", value).strip().casefold()


def english_matches(query: str, source: str) -> bool:
    # Termonline uses these delimiters for explicitly listed English synonyms.
    # This deliberately does not strip parenthetical disambiguators or perform
    # fuzzy matching, stemming, singularization, or automatic translation.
    return normalize_english(query) in {
        normalize_english(part) for part in re.split(r"[,;；，]", source or "")
    }


def cache_path(directory: Path, term: str) -> Path:
    return directory / (hashlib.sha256(term.encode("utf-8")).hexdigest()[:20] + ".json")


def proposal(candidate: dict, payload: dict) -> dict | None:
    record = payload.get("response", {}).get("result")
    if not isinstance(record, dict):
        return None
    term_id = record.get("id")
    original_zh = record.get("cn", "")
    return {
        "qid": candidate["qid"],
        "en": candidate["en"],
        "status": "needs-editorial-review",
        "exactEnglishMatch": english_matches(candidate["en"], record.get("en", "")),
        "publishedTerminologyDatabase": str(record.get("dbId")) == "0",
        "sourceZh": original_zh,
        "sourceEn": record.get("en"),
        "source": record.get("source"),
        "edition": record.get("bbh"),
        "publishYear": record.get("publishYear"),
        "subject": record.get("subjectFullName"),
        "termCode": record.get("wordNumber"),
        "recordId": term_id,
        "url": "https://www.termonline.cn/wordDetail?"
        + urlencode({"base": 1, "subject": term_id, "termName": original_zh}),
        "definitionForReview": record.get("definition"),
        "retrievedAt": payload.get("retrievedAt"),
        "query": payload.get("query"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Candidate JSON: qid/en records")
    parser.add_argument("--priority", type=Path, help="Optional candidate JSON queried first")
    parser.add_argument("--query-field", default="en", help="Lookup field; use a separate field for a manually selected Chinese search aid")
    parser.add_argument("--workdir", type=Path, default=REPO / ".dictionary-cache/translations")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between requests, minimum 0.75")
    parser.add_argument("--max-requests", type=int, default=200, help="New requests this run; 0 means all input candidates")
    parser.add_argument("--offline", action="store_true", help="Read cache only; never access the network")
    args = parser.parse_args()
    if args.delay < 0.75 or args.max_requests < 0:
        parser.error("delay must be at least 0.75 and max-requests must be nonnegative")

    candidates = []
    seen = set()
    inputs = ([args.priority] if args.priority else []) + [args.input]
    for path in inputs:
        for row in load_entries(path):
            if not isinstance(row, dict) or not isinstance(row.get("qid"), str):
                continue
            if not re.fullmatch(r"Q\d+", row["qid"]):
                continue
            if not isinstance(row.get("en"), str) or not row["en"].strip():
                continue
            lookup = row.get(args.query_field)
            if not isinstance(lookup, str) or not lookup.strip():
                continue
            identity = (row["qid"], row["en"], lookup)
            if identity not in seen:
                candidates.append(row)
                seen.add(identity)

    cache = args.workdir / "termonline-cache"
    cache.mkdir(parents=True, exist_ok=True)
    requests = 0
    proposals = []
    missing = []
    empty = []
    errors = []
    last_reported_requests = 0
    for index, candidate in enumerate(candidates):
        term = candidate[args.query_field]
        path = cache_path(cache, term)
        if not path.exists():
            if args.offline or (args.max_requests and requests >= args.max_requests):
                missing.append({"qid": candidate["qid"], "en": candidate["en"], "query": term})
                continue
            request = Request(ENDPOINT + "?" + urlencode({"term": term}), headers={"User-Agent": USER_AGENT})
            requests += 1
            try:
                with urlopen(request, timeout=30) as response:
                    result = json.load(response)
                if result.get("code") != 200 or not result.get("success"):
                    raise ValueError("API did not return a successful public lookup")
                payload = {
                    "query": term,
                    "retrievedAt": datetime.now(timezone.utc).isoformat(),
                    "endpoint": ENDPOINT,
                    "response": result,
                }
                temporary = path.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                temporary.replace(path)
            except (HTTPError, URLError, TimeoutError, ValueError) as error:
                errors.append({"qid": candidate["qid"], "en": candidate["en"], "query": term, "error": str(error)})
                # Respect rate limits and authentication/captcha boundaries.
                # Do not retry, rotate identities or bypass access restrictions.
                print(f"Stopped after unsuccessful public request for {term}: {error}", flush=True)
                missing.extend({"qid": item["qid"], "en": item["en"], "query": item[args.query_field]} for item in candidates[index + 1 :])
                break
            finally:
                time.sleep(args.delay)
        payload = json.loads(path.read_text(encoding="utf-8"))
        row = proposal(candidate, payload)
        if row:
            proposals.append(row)
        else:
            empty.append({"qid": candidate["qid"], "en": candidate["en"], "query": term})
        if requests and requests % 50 == 0 and requests != last_reported_requests:
            print(f"Requests: {requests}; evidence records: {len(proposals)}", flush=True)
            last_reported_requests = requests

    result = {
        "schemaVersion": 1,
        "notice": "Candidate evidence only. Exact English spelling and an official record do not establish equivalent concepts. Review discipline and meaning before publication. Empty lookup does not prove absence of an official Chinese term.",
        "endpoint": ENDPOINT,
        "inputCandidates": len(candidates),
        "networkRequests": requests,
        "entries": proposals,
        "noResult": empty,
        "notQueried": missing,
        "errors": errors,
    }
    output = args.workdir / "termonline-candidates.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(proposals)} evidence records; {requests} requests; output: {output}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
