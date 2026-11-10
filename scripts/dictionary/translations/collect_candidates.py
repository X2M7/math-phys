#!/usr/bin/env python3
"""Prepare unapproved English-only candidates from local collection snapshots.

This script never accesses the network or edits published catalog/content files.
Run the Wikipedia/nLab collectors first; see README.md for the complete order.
Chinese labels stay in candidateZh* fields, never in zh or translation. A current
identity refresh and independently reviewed translation are required to publish.
"""

import argparse
import collections
import datetime
import json
import os
import pathlib
import re
import unicodedata

REPO = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--pending", type=pathlib.Path, default=REPO / "data/dictionary/pending.json"
)
parser.add_argument(
    "--catalog", type=pathlib.Path, default=REPO / "data/dictionary/catalog.json"
)
parser.add_argument(
    "--editorial-review",
    type=pathlib.Path,
    default=REPO / "data/dictionary/editorial-review.json",
)
parser.add_argument(
    "--subjects", type=pathlib.Path, default=REPO / "data/dictionary/subjects.json"
)
parser.add_argument(
    "--wikipedia-workdir",
    type=pathlib.Path,
    default=pathlib.Path(
        os.environ.get("MATH_PHYS_DICTIONARY_CACHE")
        or REPO / ".dictionary-cache/wikipedia"
    ),
)
parser.add_argument(
    "--nlab-workdir",
    type=pathlib.Path,
    default=REPO / ".dictionary-cache/nlab",
    help="Optional nLab collector output directory",
)
parser.add_argument(
    "--workdir",
    type=pathlib.Path,
    default=REPO / ".dictionary-cache/translations",
    help="Untracked candidate/report output directory",
)
args = parser.parse_args()
ROOT = args.workdir.expanduser().resolve()
ROOT.mkdir(parents=True, exist_ok=True)
WIKI = args.wikipedia_workdir.expanduser().resolve()
NLAB = args.nlab_workdir.expanduser().resolve()


def read(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def read_optional(path, default):
    return read(path) if path.exists() else default


def write(name, data):
    path = ROOT / name
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


pending = read(args.pending)
published = read(args.catalog)
review = read(args.editorial_review)
wiki = read(WIKI / "catalog.json")
nlab = read_optional(NLAB / "wikidata-catalog.json", {})
supplement = read_optional(NLAB / "wikipedia-supplement.json", {})
subjects = read(args.subjects)
published_qids = {r["qid"] for r in published["entries"]}
editorial = {
    r["qid"]: r["reason"]
    for key in ["exclude", "needs_review"]
    for r in review.get(key, [])
}
source_rows = collections.defaultdict(list)
for kind in ["verified", "labelBased", "pending", "excluded"]:
    for row in wiki.get(kind, []):
        source_rows[row.get("wikidata_id")].append(row)
for kind in ["verified", "pending", "excluded"]:
    for row in supplement.get(kind, []):
        source_rows[row.get("wikidata_id")].append(row)
nlab_rows = {
    r["qid"]: r
    for kind in ["verified", "pending", "excluded"]
    for r in nlab.get(kind, [])
}
entities = {}
for filename in ["entity-metadata.json", "core-entity-metadata.json"]:
    for qid, row in read_optional(WIKI / filename, {}).items():
        if (row.get("lastrevid") or 0) > (entities.get(qid, {}).get("lastrevid") or 0):
            entities[qid] = row
for qid, row in nlab_rows.items():
    normalized = {
        "id": qid,
        "lastrevid": row.get("lastrevid"),
        "labels": {k: {"value": v} for k, v in row.get("labels", {}).items()},
        "descriptions": {
            k: {"value": v} for k, v in row.get("descriptions", {}).items()
        },
        "aliases": {
            k: [{"value": v} for v in vals]
            for k, vals in row.get("aliases", {}).items()
        },
        "sitelinks": row.get("sitelinks", {}),
        "instance_of": row.get("instanceOf", []),
        "nlab_ids": row.get("nlabIdsVerified", []),
    }
    if (normalized.get("lastrevid") or 0) > (
        entities.get(qid, {}).get("lastrevid") or 0
    ):
        entities[qid] = normalized
pages = {}
for filename in ["english-metadata.json", "core-english-metadata.json"]:
    for batch in read_optional(WIKI / filename, []):
        for row in batch["pages"]:
            if row.get("pageid") and (
                row.get("lastrevid", 0)
                >= pages.get(row["pageid"], {}).get("lastrevid", 0)
            ):
                pages[row["pageid"]] = row
for batch in read_optional(NLAB / "wikipedia-supplement-page-metadata.json", {}).get(
    "en", []
):
    for row in batch.get("pages", []):
        if row.get("pageid") and (
            row.get("lastrevid", 0) >= pages.get(row["pageid"], {}).get("lastrevid", 0)
        ):
            pages[row["pageid"]] = row
pages_by_qid = collections.defaultdict(list)
for row in pages.values():
    qid = row.get("pageprops", {}).get("wikibase_item")
    if qid:
        pages_by_qid[qid].append(row)
TYPE_EXCLUSIONS = {
    "Q5": "person",
    "Q4167410": "disambiguation",
    "Q13406463": "Wikimedia list",
    "Q571": "book",
    "Q47461344": "written work",
    "Q386724": "work",
    "Q5633421": "scientific journal",
    "Q737498": "academic journal",
    "Q43229": "organization",
    "Q3918": "university",
    "Q4830453": "business",
    "Q31855": "research institute",
    "Q7397": "software",
    "Q188860": "software library",
    "Q341": "free software",
    "Q40056": "computer program",
    "Q166142": "application software",
    "Q148578": "space observatory",
    "Q24748034": "individual gravitational-wave event",
    "Q125191": "photograph",
    "Q1121886": "photograph",
    "Q16521": "taxon",
    "Q6256": "country",
    "Q515": "city",
    "Q532": "village",
}
BAD_TITLE = re.compile(
    r"^(List of |Lists of |Glossary of |Outline of |Timeline of |History of |Introduction to |Comparison of )|\((journal|book|film|novel|magazine|software)\)$",
    re.I,
)
BAD_CATEGORY = re.compile(
    r"(?:^Category:(?:.*(?: births| deaths| people| physicists| mathematicians| philosophers| astronomers| scientists| books| journals| organizations| institutions| companies| universities| societies| magazines| conferences| awards| textbooks| biographies| timelines| lists| television series| films| novels| software|programming languages)))$",
    re.I,
)
NONCONCEPT_DESCRIPTION = re.compile(
    r"^(?:an? )?(?:computer program|software (?:library|package|framework|system|application)|programming language|scientific journal|academic journal|research institute|research (?:project|collaboration)|particle (?:physics )?(?:experiment|detector)|neutrino (?:experiment|detector|observatory)|dark matter (?:experiment|detector)|gravitational[- ]wave observatory|space telescope|astronomical survey|Canadian .*company|American .*company|British .*company)",
    re.I,
)
priority_titles = (
    "Formal proof|"
    "Symmetric algebra|"
    "Closed monoidal category|"
    "Enriched category|"
    "Triangulated category|"
    "Classifying space|"
    "Homotopy colimit and limit|"
    "Direct sum|"
    "Tensor contraction|"
    "Symmetric tensor|"
    "Epimorphism|"
    "Coproduct|"
    "Coequalizer|"
    "Opposite category|"
    "Lie algebra representation|"
    "Metric tensor (general relativity)|"
    "Scattering amplitude|"
    "Landau theory|"
    "Geometric quantization|"
    "Deformation quantization|"
    "Cosmological perturbation theory|"
    "Derived functor|"
    "Derived tensor product|"
    "Adjoint representation|"
    "Universal enveloping algebra|"
    "Superalgebra|"
    "Lie superalgebra|"
    "Supermanifold|"
    "Supergeometry|"
    "Gerbe|"
    "Bundle gerbe|"
    "Stack (mathematics)|"
    "Algebraic stack|"
    "Derived algebraic geometry|"
    "Tannakian formalism|"
    "Tannaka–Krein duality|"
    "Fusion category|"
    "Modular tensor category|"
    "Monoidal functor|"
    "Natural isomorphism|"
    "Internal category|"
    "Enriched functor|"
    "Kan extension|"
    "Kan complex|"
    "Quillen adjunction|"
    "Stable homotopy theory|"
    "Stable model category|"
    "Spectrum (homotopy theory)|"
    "Eilenberg–MacLane spectrum|"
    "Classifying topos|"
    "Higher topos theory|"
    "Homotopy category|"
    "Differential graded algebra|"
    "Differential graded category|"
    "A-infinity algebra|"
    "L-infinity algebra|"
    "Maurer–Cartan equation|"
    "De Rham cohomology|"
    "Dolbeault cohomology|"
    "Hodge structure|"
    "Mixed Hodge structure|"
    "Chern–Weil homomorphism|"
    "Characteristic class|"
    "Chern character|"
    "Deligne cohomology|"
    "Differential cohomology|"
    "Equivariant cohomology|"
    "Intersection cohomology|"
    "Sheaf cohomology|"
    "Perverse sheaf|"
    "D-module|"
    "Batalin–Vilkovisky formalism|"
    "BRST cohomology|"
    "Topological twist|"
    "AKSZ construction|"
    "BF model|"
    "Topological string theory|"
    "String field theory|"
    "String topology|"
    "Chiral algebra|"
    "Factorization algebra|"
    "Vertex algebra|"
    "Conformal block|"
    "Ward–Takahashi identity|"
    "Slavnov–Taylor identity|"
    "Schwinger–Dyson equation|"
    "LSZ reduction formula|"
    "State–operator correspondence|"
    "Wightman axioms|"
    "Haag–Kastler axioms|"
    "Osterwalder–Schrader axioms|"
    "Algebraic quantum field theory|"
    "Perturbative quantum field theory|"
    "Constructive quantum field theory|"
    "Deformation theory|"
    "Sullivan model|"
    "Minimal model (rational homotopy theory)|"
    "Rational homotopy theory|"
    "Hochschild homology|"
    "Cyclic homology|"
    "Colored operad|"
    "Hopf algebroid|"
    "Lie algebroid|"
    "Lie groupoid|"
    "Higher gauge theory|"
    "Higher-form symmetry|"
    "Generalized global symmetry|"
    "Anomaly inflow|"
    "Cobordism hypothesis|"
    "Extended topological field theory|"
    "Fukaya category|"
    "Gromov–Witten invariant|"
    "Floer homology|"
    "Homological mirror symmetry|"
    "Geometric Langlands correspondence|"
    "Derived geometry|"
    "Tensor category|"
    "Ribbon category|"
    "Braided monoidal category|"
    "Quasi-Hopf algebra|"
    "Drinfeld twist|"
    "Deformation retract|"
    "C0-semigroup|"
    "Berezin integral|"
    "CCR and CAR algebras|"
    "Bifundamental representation|"
    "Einstein manifold|"
    "Lagrangian Grassmannian|"
    "Coadjoint representation|"
    "Coadjoint orbit|"
    "Maslov index|"
    "Dirac bracket|"
    "Moyal bracket|"
    "Symplectic reduction|"
    "Hamiltonian group action|"
    "Momentum map|"
    "Liouville measure|"
    "Prequantization|"
    "Polarization (symplectic geometry)|"
    "Symplectic groupoid|"
    "Poisson groupoid|"
    "Differential graded Lie algebra|"
    "Schouten bracket|"
    "Gerstenhaber algebra|"
    "Batalin–Vilkovisky algebra|"
    "Koszul duality|"
    "Bar construction|"
    "Cobar construction|"
    "Chevalley–Eilenberg complex|"
    "Dold–Kan correspondence|"
    "Simplicial category|"
    "Grothendieck construction|"
    "Fibration (category theory)|"
    "2-functor|"
    "Weak equivalence|"
    "Serre fibration|"
    "Hurewicz fibration|"
    "Cofibrant object|"
    "Fibrant object|"
    "Homotopy pushout|"
    "Homotopy pullback|"
    "Brown representability theorem|"
    "Brown's representability theorem|"
    "Atiyah–Singer index theorem|"
    "Fredholm operator|"
    "Trace class|"
    "Schatten class|"
    "K-theory|"
    "Algebraic K-theory|"
    "Topological K-theory"
).split("|")
priority_index = {title: i for i, title in enumerate(priority_titles)}
reserved = {e["id"]: e["qid"] for e in published["entries"]}


def slug(title, qid):
    t = (
        unicodedata.normalize("NFKD", title)
        .encode("ascii", "ignore")
        .decode()
        .replace("*", " star ")
        .replace("+", " plus ")
    )
    base = re.sub("[^a-z0-9]+", "-", t.lower()).strip("-") or qid.lower()
    identifier = base
    if identifier in reserved and reserved[identifier] != qid:
        identifier = base + "-" + qid.lower()
    reserved[identifier] = qid
    return identifier


candidates = []
deferred = []
filtered = []
for pending_row in pending["entries"]:
    qid = pending_row.get("qid")
    short = {"qid": qid, "en": pending_row["en"]}
    if not qid or qid in published_qids:
        deferred.append({**short, "reason": "No usable unpublished QID"})
        continue
    if qid in editorial:
        filtered.append(
            {
                **short,
                "reason": "Editorial review hold/exclusion",
                "detail": editorial[qid],
            }
        )
        continue
    e = entities.get(qid)
    if not e or not e.get("lastrevid"):
        deferred.append({**short, "reason": "Wikidata identity metadata unavailable"})
        continue
    if e.get("sitelinks", {}).get("zhwiki"):
        deferred.append(
            {
                **short,
                "reason": "Chinese Wikipedia sitelink exists; not an English-only candidate",
            }
        )
        continue
    enlink = e.get("sitelinks", {}).get("enwiki")
    if not enlink:
        deferred.append({**short, "reason": "No English Wikipedia sitelink"})
        continue
    matching = [
        p
        for p in pages_by_qid[qid]
        if p.get("title") == enlink["title"]
        and p.get("ns") == 0
        and not p.get("missing")
    ]
    if not matching:
        deferred.append(
            {
                **short,
                "reason": "English Wikipedia page requires API verification",
                "englishSitelink": enlink,
            }
        )
        continue
    p = max(matching, key=lambda p: p.get("lastrevid", 0))
    if p.get("langlinks"):
        deferred.append(
            {
                **short,
                "reason": "English page has a Chinese language link despite absent Wikidata sitelink",
            }
        )
        continue
    if "disambiguation" in p.get("pageprops", {}):
        filtered.append({**short, "reason": "English disambiguation page"})
        continue
    rev = p.get("revisions", [{}])[0].get("revid") or p.get("lastrevid")
    if not rev or not p.get("fullurl"):
        deferred.append(
            {**short, "reason": "English revision or URL metadata unavailable"}
        )
        continue
    name = p["title"]
    types = e.get("instance_of", [])
    cats = sorted({v["title"] for v in p.get("categories", [])})
    labels = {k: v["value"] for k, v in e.get("labels", {}).items()}
    descs = {k: v["value"] for k, v in e.get("descriptions", {}).items()}
    aliases = {k: [a["value"] for a in v] for k, v in e.get("aliases", {}).items()}
    reasons = [TYPE_EXCLUSIONS[t] for t in types if t in TYPE_EXCLUSIONS]
    if BAD_TITLE.search(name):
        reasons.append("Non-concept title")
    reasons += ["Non-concept category: " + v for v in cats if BAD_CATEGORY.search(v)]
    if qid in {
        "Q20810499",
        "Q1385044",
        "Q42377875",
        "Q6837683",
        "Q6955027",
        "Q123376497",
        "Q137661563",
        "Q7907023",
        "Q30595918",
    }:
        reasons.append(
            "Specific named experiment, experimental project/center, or survey; source title and category establish narrower scope"
        )
    if NONCONCEPT_DESCRIPTION.search(descs.get("en", "")) and qid not in {
        "Q2985199",
        "Q119039804",
    }:
        reasons.append("Non-concept source description: " + descs["en"])
    nr = nlab_rows.get(qid, {})
    if nr.get("reason", "").startswith(
        ("nlab-nonconcept-category", "wikidata-nonconcept-instance")
    ):
        reasons.append("nLab scope exclusion: " + nr["reason"])
    if reasons:
        filtered.append(
            {
                **short,
                "reason": "Source-based non-concept/scope filter",
                "details": sorted(set(reasons)),
            }
        )
        continue
    rows = source_rows.get(qid, [])
    groups = sorted({g for r in rows for g in r.get("groups", []) if g in subjects})
    if not groups:
        deferred.append({**short, "reason": "No established subject classification"})
        continue
    core = any(r.get("core_seed_groups") for r in rows)
    zhlabels = {k: v for k, v in labels.items() if k.startswith("zh")}
    candidate_lang = next(
        (k for k in ["zh-hans", "zh", "zh-hant"] if labels.get(k)), None
    )
    candidate_zh = labels.get(candidate_lang) if candidate_lang else None
    nlab_pages = [
        {key: x[key] for key in ["title", "url", "sourcePath"]}
        for x in nr.get("nlabPages", [])
        if not set(x.get("categories", []))
        & {"people", "reference", "meta", "empty", "svg", "software", "disambiguation"}
    ]
    english_aliases = list(
        dict.fromkeys(
            v for v in [labels.get("en"), *aliases.get("en", [])] if v and v != name
        )
    )
    score = (
        (10000 if core else 0)
        + (5000 - priority_index[name] if name in priority_index else 0)
        + (200 if candidate_zh else 0)
        + (100 if nlab_pages else 0)
        + min(20, len(groups) * 5)
    )
    candidate = {
        "id": slug(name, qid),
        "qid": qid,
        "en": name,
        "variants": english_aliases,
        "subjects": groups,
        "candidateZh": candidate_zh,
        "candidateZhLanguage": candidate_lang,
        "candidateZhLabels": zhlabels,
        "candidateZhAliases": {k: v for k, v in aliases.items() if k.startswith("zh")},
        "candidateZhStatus": (
            "unreviewed-source-label" if candidate_zh else "no-Chinese-label"
        ),
        "descriptionEn": descs.get("en"),
        "sources": {
            "enWikipedia": {
                "title": name,
                "url": p["fullurl"],
                "pageId": p["pageid"],
                "revisionId": rev,
            },
            "wikidata": {
                "url": "https://www.wikidata.org/wiki/" + qid,
                "revisionId": e["lastrevid"],
            },
            "nlab": nlab_pages,
        },
        "identityEvidence": {
            "englishPageQid": p["pageprops"]["wikibase_item"],
            "englishSitelinkTitle": enlink["title"],
            "chineseSitelink": "absent",
            "englishChineseLanguageLink": "absent",
            "verification": "cached Action API and Wikidata metadata; not re-fetched in this research pass",
            "snapshotDate": wiki["collection_date"],
        },
        "instanceOf": types,
        "sourceCategories": cats,
        "pendingReasons": pending_row.get("reasons", []),
        "origins": pending_row.get("origins", []),
        "coreSeed": core,
        "priorityScore": score,
        "priorityBasis": (["core-seed"] if core else [])
        + (["selected-standard-concept-title"] if name in priority_index else [])
        + (["unreviewed-Chinese-label"] if candidate_zh else [])
        + (["nLab-mapping"] if nlab_pages else []),
    }
    candidates.append(candidate)
candidates.sort(key=lambda x: (-x["priorityScore"], x["en"].casefold(), x["qid"]))
report = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "snapshotDate": wiki["collection_date"],
    "networkRequests": 0,
    "pendingInput": len(pending["entries"]),
    "englishOnlyCandidates": len(candidates),
    "hasCandidateChineseLabel": sum(bool(x["candidateZh"]) for x in candidates),
    "hasNlabMapping": sum(bool(x["sources"]["nlab"]) for x in candidates),
    "coreSeedCandidates": sum(x["coreSeed"] for x in candidates),
    "filtered": len(filtered),
    "deferred": len(deferred),
    "pendingReasons": dict(
        collections.Counter(r for x in pending["entries"] for r in x.get("reasons", []))
    ),
    "subjects": {k: sum(k in x["subjects"] for x in candidates) for k in subjects},
    "candidateLabelBasis": dict(
        collections.Counter(x["candidateZhLanguage"] or "none" for x in candidates)
    ),
    "filteredReasons": dict(collections.Counter(x["reason"] for x in filtered)),
    "deferredReasons": dict(collections.Counter(x["reason"] for x in deferred)),
}
result = {
    "schemaVersion": 1,
    "notice": "Research candidates only. candidateZh is copied from source metadata and is not an approved translation. Cached page identity and absence of Chinese sitelink require fresh verification before publication.",
    "snapshotDate": wiki["collection_date"],
    "entries": candidates,
    "filtered": filtered,
    "deferred": deferred,
    "summary": report,
}
write("english-only-candidates.json", result)
write("priority-100.json", {"notice": result["notice"], "entries": candidates[:100]})
write("report.json", report)
with (ROOT / "priority-100.tsv").open("w", encoding="utf-8") as f:
    f.write("QID\tEnglish\tCandidate Chinese (unreviewed)\tSubjects\tnLab\n")
    for x in candidates[:100]:
        f.write(
            "\t".join(
                [
                    x["qid"],
                    x["en"],
                    x["candidateZh"] or "",
                    ",".join(x["subjects"]),
                    str(bool(x["sources"]["nlab"])),
                ]
            )
            + "\n"
        )
print(
    json.dumps(
        {k: v for k, v in report.items() if k not in ["pendingReasons", "subjects"]},
        ensure_ascii=False,
        indent=2,
    )
)
