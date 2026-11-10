#!/usr/bin/env python3
"""Offline assembly of audited source metadata; never translates or copies article prose."""
import argparse
import json
import re
import unicodedata
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wikipedia', required=True, type=Path)
    parser.add_argument('--nlab', required=True, type=Path)
    parser.add_argument('--supplement', required=True, type=Path)
    parser.add_argument('--review', required=True, type=Path)
    parser.add_argument('--title-variants', type=Path, help='Verified Wikipedia simplified/traditional page titles')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'data/dictionary')
    args = parser.parse_args()
    wiki, nlab, supplement, review = map(read, [args.wikipedia, args.nlab, args.supplement, args.review])
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    subjects = read(output / 'subjects.json')
    old = read(output / 'catalog.json') if (output / 'catalog.json').exists() else {'entries': []}
    stable_ids = {entry['qid']: entry['id'] for entry in old['entries']}
    old_by_qid = {entry['qid']: entry for entry in old['entries']}
    variant_data = read(args.title_variants) if args.title_variants else {'entries': [], 'unresolved': []}
    title_variants = {row['pageId']: row for row in variant_data['entries']}
    reserved_ids = {entry['id']: entry['qid'] for entry in old['entries']}
    exclusions = {row['qid']: row for row in review['exclude']}
    held = {row['qid']: row for row in review.get('needs_review', [])}
    nlab_by_qid = {row['qid']: row for kind in ['verified', 'pending'] for row in nlab[kind]}
    merged = {}
    for row in wiki['verified'] + supplement['verified']:
        qid = row['wikidata_id']
        if qid in exclusions or qid in held:
            continue
        assert row['zh']['wikidata_id'] == qid, (qid, 'cross-language mismatch')
        if qid in merged:
            merged[qid]['groups'] = sorted(set(merged[qid]['groups'] + row['groups']))
        else:
            merged[qid] = dict(row)
    entries = []
    for qid, row in sorted(merged.items()):
        english, chinese = row['en']['title'], row['zh']['title']
        assert row['groups'] and all(group in subjects for group in row['groups']), (qid, row['groups'])
        identifier = stable_ids.get(qid)
        if not identifier:
            letters = unicodedata.normalize('NFKD', english).encode('ascii', 'ignore').decode()
            letters = letters.replace('*', ' star ').replace('+', ' plus ')
            base = re.sub(r'[^a-z0-9]+', '-', letters.lower()).strip('-') or qid.lower()
            identifier = base
            if identifier in reserved_ids and reserved_ids[identifier] != qid:
                identifier = base + '-' + qid.lower()
            assert identifier not in reserved_ids or reserved_ids[identifier] == qid
            reserved_ids[identifier] = qid
        labels = row.get('wikidata_labels', {})
        alias_groups = row.get('wikidata_aliases', {})
        variants = []
        for lang in ['zh-hans', 'zh', 'zh-hant', 'en']:
            for value in ([labels[lang]] if lang in labels else []) + alias_groups.get(lang, []):
                value = ' '.join(value.split())
                if value and value not in [english, chinese] and value not in variants:
                    variants.append(value)
        nlab_row = nlab_by_qid.get(qid, {})
        nlab_pages = []
        for page in nlab_row.get('nlabPages', []):
            if set(page.get('categories', [])).intersection({'people', 'reference', 'meta', 'empty', 'svg', 'software', 'disambiguation'}):
                continue
            nlab_pages.append({key: page[key] for key in ['title', 'url', 'sourcePath']})
        def wikipedia(page):
            return {'title': page['title'], 'url': page['url'], 'pageId': page['pageid'], 'revisionId': page['revid']}
        zh_page = wikipedia(row['zh'])
        variant_row = title_variants.get(zh_page['pageId'])
        previous_zh = old_by_qid.get(qid, {}).get('sources', {}).get('zhWikipedia', {})
        if variant_row:
            assert variant_row['qid'] == qid, (qid, 'variant identity mismatch')
            zh_page['titleVariants'] = variant_row['variants']
            zh_page['variantRevisionId'] = variant_row['revisionId']
        elif previous_zh.get('pageId') == zh_page['pageId'] and previous_zh.get('titleVariants'):
            zh_page['titleVariants'] = previous_zh['titleVariants']
            zh_page['variantRevisionId'] = previous_zh['variantRevisionId']
        for value in zh_page.get('titleVariants', {}).values():
            if value not in [english, chinese] and value not in variants:
                variants.append(value)
        # Preserve the source title and URLs as evidence; the public primary name
        # uses Wikipedia's verified simplified display title. A first assembly
        # without variants remains a collection draft until title verification.
        simplified = zh_page.get('titleVariants', {}).get('zh-hans')
        if simplified:
            if chinese not in [english, simplified] and chinese not in variants:
                variants.append(chinese)
            chinese = simplified
            variants = [value for value in variants if value not in [english, chinese]]
        entries.append({
            'id': identifier, 'qid': qid, 'zh': chinese, 'en': english,
            'variants': variants, 'subjects': sorted(row['groups']),
            'sources': {
                'enWikipedia': wikipedia(row['en']), 'zhWikipedia': zh_page,
                'wikidata': {'url': 'https://www.wikidata.org/wiki/' + qid, 'revisionId': row['wikidata_revid']},
                'nlab': nlab_pages,
            },
        })
    entries.sort(key=lambda entry: (entry['en'].casefold(), entry['qid']))
    published = {entry['qid'] for entry in entries}
    pending, excluded = {}, {}
    def candidate(row, origin, kind):
        qid = row.get('wikidata_id') or row.get('qid')
        english = row.get('en', {}).get('title') or row.get('english') or next(iter(row.get('nlabIds', [])), '')
        key = qid or origin + ':' + english
        if qid in published:
            return
        destination = excluded if kind == 'excluded' or qid in exclusions else pending
        item = destination.setdefault(key, {'qid': qid, 'en': english, 'origins': [], 'reasons': [], 'sources': []})
        item['origins'] = sorted(set(item['origins'] + [origin]))
        reasons = row.get('reasons') or ([row['reason']] if row.get('reason') else [])
        if kind == 'labelBased' or row.get('chineseBasis') == 'wikidata-label':
            reasons = reasons + ['Chinese Wikidata label only; translation requires editorial review']
        if qid in exclusions:
            reasons = reasons + [exclusions[qid]['reason']]
        if qid in held:
            reasons = reasons + [held[qid]['reason']]
        item['reasons'] = sorted(set(item['reasons'] + reasons))
        labels = row.get('wikidata_labels') or row.get('labels') or {}
        chinese = row.get('zh', {}).get('title') or row.get('chinese') or labels.get('zh-hans') or labels.get('zh') or labels.get('zh-hant')
        if chinese:
            item['zhCandidate'] = chinese
        urls = [row.get('en', {}).get('url')]
        urls += [page['url'] for page in row.get('nlabPages', [])]
        if qid:
            urls.append('https://www.wikidata.org/wiki/' + qid)
        item['sources'] = sorted(set(item['sources'] + [url for url in urls if url]))
        if not item['reasons']:
            item['reasons'] = ['Not admitted by bilingual/scope verification; requires review']
    for kind in ['labelBased', 'pending', 'excluded', 'verified']:
        for row in wiki.get(kind, []):
            candidate(row, 'wikipedia-categories-and-core', kind)
    for kind in ['verified', 'pending', 'excluded']:
        for row in nlab.get(kind, []):
            candidate(row, 'nlab-wikidata', kind)
        for row in supplement.get(kind, []):
            candidate(row, 'nlab-wikipedia-verification', kind)
    # Explicit exclusions take precedence over pending status for the same entity.
    for key in excluded:
        pending.pop(key, None)
    snapshot = nlab['nlabSnapshot']
    collected = wiki['collection_date']
    write(output / 'catalog.json', {'schemaVersion': 1, 'collectedOn': collected, 'nlabSnapshot': snapshot, 'entries': entries})
    write(output / 'pending.json', {'collectedOn': collected, 'notice': 'Candidate names, not approved dictionary translations.', 'entries': sorted(pending.values(), key=lambda entry: (entry['en'].casefold(), entry['qid'] or ''))})
    write(output / 'excluded.json', {'collectedOn': collected, 'entries': sorted(excluded.values(), key=lambda entry: (entry['en'].casefold(), entry['qid'] or ''))})
    counts = {group: sum(group in entry['subjects'] for entry in entries) for group in subjects}
    manifest = {
        'schemaVersion': 1, 'collectedOn': collected,
        'published': len(entries), 'withNlab': sum(bool(entry['sources']['nlab']) for entry in entries),
        'pending': len(pending), 'excluded': len(excluded), 'bySubject': counts,
        'method': 'Bounded Wikipedia category/core seeds and nLab P4215 concepts; canonical en/zh pages verified with the same Wikidata QID. Aliases are source-derived, not individually editorially reviewed. No article prose imported.',
        'nlabSnapshot': snapshot,
        'nlabSource': 'https://github.com/ncatlab/nlab-content/tree/' + snapshot,
        'wikipediaSeeds': wiki['seeds'],
        'coreSeeds': wiki.get('core_seeds', {}),
    }
    manifest['withChineseTitleVariants'] = sum(bool(entry['sources']['zhWikipedia'].get('titleVariants')) for entry in entries)
    if args.title_variants:
        write(output / 'variant-review.json', {'collectedOn': variant_data['collectedOn'], 'unresolved': variant_data['unresolved']})
    core_path = args.wikipedia.parent / 'core-report.json'
    if core_path.exists():
        core = read(core_path)
        coverage = []
        for row in core['coverage']:
            row = dict(row)
            row['publicationStatus'] = 'published' if row.get('wikidata_id') in published else 'pending-or-excluded'
            coverage.append(row)
        write(output / 'core-coverage.json', {'collectedOn': collected, 'seedCount': core['seed_count'], 'coverage': coverage, 'sectionRedirects': core['section_redirects'], 'missing': core['missing']})
    write(output / 'manifest.json', manifest)
    print(json.dumps({key: value for key, value in manifest.items() if key in ['published','withNlab','pending','excluded','bySubject']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
