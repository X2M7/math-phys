#!/usr/bin/env python3
"""Collect Wikipedia's simplified/traditional titles for verified concept pages.

This optional manual step reads an assembled catalog. It does not modify that
catalog or any concept Markdown. Page identity must still match its QID.
"""

import argparse
import datetime
import json
from pathlib import Path

import collect


DEFAULT_CATALOG = collect.SCRIPT_DIR.parents[2] / "data" / "dictionary" / "catalog.json"


def fetch_batch(page_ids):
    response = collect.fetch(
        "zh.wikipedia.org",
        {
            "action": "query",
            "pageids": "|".join(str(page_id) for page_id in page_ids),
            "prop": "info|pageprops",
            "inprop": "varianttitles",
        },
    )
    return response.get("query", {}).get("pages", [])


def main(catalog_path, workdir=None):
    collect.configure_workdir(workdir)
    catalog = json.loads(Path(catalog_path).read_text())
    expected = {}
    for entry in catalog["entries"]:
        page_id = entry["sources"]["zhWikipedia"]["pageId"]
        qid = entry["qid"]
        if not isinstance(page_id, int) or page_id <= 0 or not qid:
            raise ValueError(f"Invalid Wikipedia identity for {entry['id']}")
        if page_id in expected and expected[page_id]["qid"] != qid:
            raise ValueError(f"Conflicting QIDs for Chinese Wikipedia page {page_id}")
        expected[page_id] = entry

    pages = {}
    for batch in collect.map2(
        fetch_batch,
        collect.chunks(sorted(expected)),
        "title variants",
    ):
        for page in batch:
            if "pageid" in page:
                pages[page["pageid"]] = page

    entries = []
    unresolved = []
    simplified_missing = 0
    traditional_missing = 0
    for page_id, entry in sorted(expected.items()):
        page = pages.get(page_id, {})
        props = page.get("pageprops", {})
        actual_qid = props.get("wikibase_item")
        variants = page.get("varianttitles", {})
        reason = None
        if not page or page.get("missing") or page.get("invalid"):
            reason = "Chinese Wikipedia page is unavailable"
        elif actual_qid != entry["qid"]:
            reason = "Chinese Wikipedia page QID no longer matches the catalog"
        elif "disambiguation" in props:
            reason = "Chinese Wikipedia page is a disambiguation page"
        elif not isinstance(page.get("lastrevid"), int) or page["lastrevid"] <= 0:
            reason = "Chinese Wikipedia revision ID is unavailable"
        elif not all(
            isinstance(variants.get(language), str) and variants[language].strip()
            for language in ("zh-hans", "zh-hant")
        ):
            reason = "Simplified or traditional display title is unavailable"
        elif any(
            "<" in variants[language] or ">" in variants[language]
            for language in ("zh-hans", "zh-hant")
        ):
            # Avoid treating display markup as a literal search alias. These can
            # be reviewed separately without guessing at the intended text.
            reason = "Display title contains markup and requires review"

        if reason:
            unresolved.append(
                {
                    "pageId": page_id,
                    "expectedQid": entry["qid"],
                    "actualQid": actual_qid,
                    "reason": reason,
                }
            )
            continue

        selected = {
            language: variants[language].strip()
            for language in ("zh-hans", "zh-hant")
        }
        existing = {entry["zh"], *entry.get("variants", [])}
        simplified_missing += selected["zh-hans"] not in existing
        traditional_missing += selected["zh-hant"] not in existing
        entries.append(
            {
                "pageId": page_id,
                "revisionId": page["lastrevid"],
                "qid": actual_qid,
                "title": page["title"],
                "variants": selected,
            }
        )

    result = {
        "schemaVersion": 1,
        "collectedOn": datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        "source": "https://zh.wikipedia.org/w/api.php?action=query&prop=info%7Cpageprops&inprop=varianttitles",
        "entries": entries,
        "unresolved": unresolved,
        "summary": {
            "catalogEntries": len(catalog["entries"]),
            "requestedPages": len(expected),
            "verifiedPages": len(entries),
            "unresolvedPages": len(unresolved),
            "simplifiedTitleMissingBefore": simplified_missing,
            "traditionalTitleMissingBefore": traditional_missing,
        },
    }
    collect.write("title-variants.json", result)
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2), flush=True)
    print(f"Output: {collect.ROOT / 'title-variants.json'}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG,
        help="Assembled catalog; defaults to repository data/dictionary/catalog.json",
    )
    parser.add_argument(
        "--workdir",
        help="Output/cache directory; defaults to MATH_PHYS_DICTIONARY_CACHE or repository .dictionary-cache/wikipedia",
    )
    arguments = parser.parse_args()
    main(arguments.catalog, arguments.workdir)
