#!/usr/bin/env python3
"""Verify reviewed translations against English Wikipedia and Wikidata metadata.

Manual refresh only; builds never run this script. Example:
  python3 scripts/dictionary/translations/verify_wikipedia.py \
    --reviewed /tmp/terminology-reviewed.json \
    --candidates /tmp/english-only-candidates.json --output /tmp/verified.json

Inputs contain an ``entries`` array (or are arrays). Reviewed entries supply qid,
en, zh, variants and translation evidence; candidates supply id, subjects and
source metadata. A previously merged reviewed file can be used without a
separate candidate file. Unreviewed Chinese candidate labels are never imported.
Daily per-QID snapshots let subsequent runs fetch only new selections. --refresh
re-fetches all selected identities. Raw API responses and snapshots stay under
--workdir, never beside tracked scripts. No Wikipedia article text is fetched.
"""

import argparse
import copy
import datetime
import importlib.util
import json
import os
import pathlib


SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parents[2]
DEFAULT_WORKDIR = REPO / ".dictionary-cache" / "translations" / "wikipedia"


def read_entries(path):
    value = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return value["entries"] if isinstance(value, dict) else value


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_api():
    spec = importlib.util.spec_from_file_location(
        "dictionary_wikipedia_collector", SCRIPT_DIR.parent / "wikipedia" / "collect.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify(reviewed_path, candidate_path=None, workdir=None, output=None, refresh=False):
    now = datetime.datetime.now(datetime.timezone.utc)
    date = now.date().isoformat()
    root = pathlib.Path(
        workdir or os.environ.get("MATH_PHYS_TRANSLATION_WIKIPEDIA_CACHE") or DEFAULT_WORKDIR
    ).expanduser().resolve()
    output = pathlib.Path(output).expanduser().resolve() if output else root / "verified.json"
    snapshots_dir = root / "metadata" / date
    reviewed = read_entries(reviewed_path)
    candidates = read_entries(candidate_path) if candidate_path else reviewed
    by_qid = {row["qid"]: row for row in candidates}
    qids = [row["qid"] for row in reviewed]
    if len(qids) != len(set(qids)):
        raise ValueError("Reviewed input contains duplicate QIDs")
    for row in reviewed:
        if not row.get("zh") or not row.get("translation", {}).get("sources"):
            raise ValueError(f"{row['qid']}: reviewed Chinese name and translation sources required")

    api = load_api()
    request_cache = root / "requests" / date
    if refresh:
        request_cache = request_cache / now.strftime("%H%M%S%f")
    api.configure_workdir(request_cache)
    snapshots = {}
    for qid in qids:
        path = snapshots_dir / f"{qid}.json"
        if not refresh and path.exists():
            snapshots[qid] = json.loads(path.read_text(encoding="utf-8"))

    missing = [qid for qid in qids if qid not in snapshots]
    entities = {}
    for batch in api.chunks(missing):
        entities.update(api.entities(batch))
    titles = list(dict.fromkeys(
        entity["sitelinks"]["enwiki"]["title"]
        for entity in entities.values()
        if entity.get("sitelinks", {}).get("enwiki")
    ))
    pages = {}
    for batch in api.chunks(titles):
        for page in api.metadata(batch)["pages"]:
            if page.get("pageid"):
                pages[page["title"]] = page
    for qid in missing:
        entity = entities.get(qid, {})
        title = entity.get("sitelinks", {}).get("enwiki", {}).get("title")
        snapshot = {
            "verifiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "entity": entity,
            "page": pages.get(title),
        }
        snapshots[qid] = snapshot
        write_json(snapshots_dir / f"{qid}.json", snapshot)

    entries, outcomes = [], []
    for translation_row in reviewed:
        qid = translation_row["qid"]
        candidate = by_qid.get(qid)
        snapshot = snapshots[qid]
        entity, page = snapshot["entity"], snapshot["page"]
        sitelinks = entity.get("sitelinks", {})
        enlink, zhlink = sitelinks.get("enwiki"), sitelinks.get("zhwiki")
        detail = {"qid": qid, "en": translation_row.get("en"),
                  "enSitelink": enlink, "zhSitelink": zhlink}

        def reject(reason, **extra):
            outcomes.append({**detail, "reason": reason, **extra})

        if not candidate or not candidate.get("id") or not candidate.get("subjects"):
            reject("Candidate ID or established subject metadata unavailable")
            continue
        if not entity.get("lastrevid"):
            reject("Wikidata identity/revision unavailable")
            continue
        if not enlink:
            reject("No English Wikipedia sitelink")
            continue
        if zhlink:
            reject("Chinese Wikipedia sitelink exists")
            continue
        if not page or page.get("missing") or page.get("ns") != 0:
            reject("English Wikipedia page missing or redirected elsewhere")
            continue
        enqid = page.get("pageprops", {}).get("wikibase_item")
        if enqid != qid:
            reject("English page QID mismatch", enQid=enqid)
            continue
        if page.get("langlinks"):
            reject("English page has Chinese language link", langlinks=page["langlinks"])
            continue
        revision = page.get("revisions", [{}])[0].get("revid")
        if not revision or not page.get("fullurl"):
            reject("English revision/URL unavailable")
            continue
        if "disambiguation" in page.get("pageprops", {}):
            reject("English disambiguation page")
            continue
        types = api.claimids(entity, "P31")
        excluded_types = [api.EXCLUDED_TYPES[t] for t in types if t in api.EXCLUDED_TYPES]
        if excluded_types:
            reject("Excluded entity type", types=excluded_types)
            continue
        old_english = candidate.get("sources", {}).get("enWikipedia", {})
        if old_english.get("pageId") and old_english["pageId"] != page["pageid"]:
            reject("English page ID changed; identity requires review",
                   previousPageId=old_english["pageId"], enPageId=page["pageid"])
            continue
        if page["title"] != translation_row.get("en"):
            reject("English title changed; translation alignment requires review",
                   enTitle=page["title"])
            continue
        sources = copy.deepcopy(candidate.get("sources", {}))
        sources.pop("zhWikipedia", None)
        sources["enWikipedia"] = {
            "title": page["title"], "url": page["fullurl"],
            "pageId": page["pageid"], "revisionId": revision,
        }
        sources["wikidata"] = {
            "url": "https://www.wikidata.org/wiki/" + qid,
            "revisionId": entity["lastrevid"],
        }
        sources.setdefault("nlab", [])
        aliases = list(dict.fromkeys(
            candidate.get("variants", []) + translation_row.get("variants", [])
        ))
        entries.append({
            "id": candidate["id"], "qid": qid, "en": page["title"],
            "zh": translation_row["zh"],
            "variants": [name for name in aliases
                         if name not in (page["title"], translation_row["zh"])],
            "subjects": candidate["subjects"], "sources": sources,
            "translation": translation_row["translation"],
            "wikipediaVerification": {
                "verifiedOn": snapshot["verifiedAt"][:10], "enQid": enqid,
                "enPageId": page["pageid"], "enRevisionId": revision,
                "zhSitelink": None,
            },
        })

    result = {
        "schemaVersion": 1, "verifiedOn": date,
        "notice": "Reviewed translations with verified English page/QID and absent Chinese sitelink/langlink. Absence of an associated Chinese page does not rule out unlinked pages.",
        "entries": entries, "outcomes": outcomes,
        "summary": {
            "requested": len(reviewed), "verified": len(entries),
            "outcomes": len(outcomes), "cachedQids": len(qids) - len(missing),
            "fetchedQids": len(missing), "networkRequestsThisRun": api.requests_count,
        },
    }
    write_json(output, result)
    print(json.dumps(result["summary"], ensure_ascii=False))
    print(output)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", required=True, help="Reviewed Chinese translations JSON")
    parser.add_argument("--candidates", help="Candidate source/subject metadata JSON")
    parser.add_argument("--workdir", help="Daily metadata/API cache directory")
    parser.add_argument("--output", help="Verified entries and rejected outcomes JSON")
    parser.add_argument("--refresh", action="store_true", help="Fetch all selected identities anew")
    args = parser.parse_args()
    verify(args.reviewed, args.candidates, args.workdir, args.output, args.refresh)
