#!/usr/bin/env python3
"""Refresh nLab title/redirect/category metadata from its official GitHub mirror.

Only metadata is saved, never article prose. The nLab HowTo explicitly provides
this repository for downloading a local copy. No requests are made to the wiki's
robots-disallowed list/export/revision endpoints. Python standard library only.

Example:
  python refresh_metadata.py --ref master --refresh
"""
from __future__ import annotations
import argparse
import collections
import datetime
import json
import re
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = 'ncatlab/nlab-content'
PINNED_COMMIT = 'c35cfa6ed9b33a9d2455ff294b78df6c37ac2f4f'
DEFAULT_WORKDIR = Path(__file__).resolve().parents[3] / '.dictionary-cache/nlab'
USER_AGENT = 'math-phys-dictionary-catalog/1.0 (+https://github.com/X2M7/math-phys)'
REDIRECTS = re.compile(r'\[\[!redirects\s+([^\]]+)\]\]')
CATEGORIES = re.compile(r'(?mi)^category:\s*([^\n]+)')
CATEGORY_DIRECTIVES = re.compile(r'\[\[!category\s+([^\]]+)\]\]')


def open_url(url: str):
    for attempt in range(4):
        try:
            return urllib.request.urlopen(
                urllib.request.Request(url, headers={'User-Agent': USER_AGENT}), timeout=60
            )
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(max(float(exc.headers.get('Retry-After', '0')), 2 ** attempt))
        except (TimeoutError, urllib.error.URLError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('Request failed')


def read_pages(stream) -> list[dict]:
    records: dict[str, dict] = {}
    with tarfile.open(fileobj=stream, mode='r|gz') as archive:
        for member in archive:
            if not member.isfile():
                continue
            parts = member.name.split('/')
            if len(parts) < 4 or parts[1] != 'pages' or parts[-1] not in ('name', 'content.md'):
                continue
            # The archive is streamed rather than extracted to the filesystem.
            if member.size > 32 * 1024 * 1024:
                raise ValueError(f'Unexpectedly large page metadata source: {member.name}')
            entry = records.setdefault('/'.join(parts[:-1]), {})
            source = archive.extractfile(member)
            if source is None:
                continue
            value = source.read().decode('utf-8')
            if parts[-1] == 'name':
                entry['title'] = value.strip()
            else:
                entry['redirects'] = sorted(set(v.strip() for v in REDIRECTS.findall(value)))
                entry['categories'] = sorted(set(
                    v.strip() for v in CATEGORIES.findall(value) + CATEGORY_DIRECTIVES.findall(value)
                ))
                entry['sourcePath'] = '/'.join(parts[1:])
    pages = []
    for entry in records.values():
        title = entry.get('title')
        if not title or 'sourcePath' not in entry:
            continue
        entry['url'] = 'https://ncatlab.org/nlab/show/' + urllib.parse.quote_plus(title)
        pages.append(entry)
    return sorted(pages, key=lambda row: row['title'].casefold())


def make_index(pages: list[dict]) -> dict:
    matches: dict[str, set[str]] = collections.defaultdict(set)
    for row in pages:
        for name in [row['title'], *row['redirects']]:
            matches[name].add(row['title'])
    return {
        'titles': {name: next(iter(titles)) for name, titles in sorted(matches.items()) if len(titles) == 1},
        'ambiguous': {name: sorted(titles) for name, titles in sorted(matches.items()) if len(titles) > 1},
    }


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default=PINNED_COMMIT, help='Official mirror commit or branch (default: the committed catalog snapshot)')
    parser.add_argument('--workdir', type=Path, default=DEFAULT_WORKDIR)
    parser.add_argument('--output', type=Path, help='Output JSON metadata file; default: WORKDIR/page-metadata.json')
    parser.add_argument('--index-output', type=Path, help='Exact lookup JSON; default: WORKDIR/title-and-redirect-index.json')
    parser.add_argument('--offline', action='store_true', help='Use an existing metadata snapshot; never access the network')
    parser.add_argument('--refresh', action='store_true', help='Fetch even when the selected commit is already cached')
    args = parser.parse_args()
    if args.offline and args.refresh:
        parser.error('--offline and --refresh are mutually exclusive')
    args.output = args.output or args.workdir / 'page-metadata.json'
    args.index_output = args.index_output or args.workdir / 'title-and-redirect-index.json'
    if args.output.exists() and not args.refresh:
        cached = json.loads(args.output.read_text(encoding='utf-8'))
        if cached.get('commit') == args.ref:
            pages = cached['pages']
            write_json(args.index_output, {'source': cached['source'], 'commit': cached['commit'], **make_index(pages)})
            print(json.dumps({'commit': cached['commit'], 'pages': len(pages), 'cached': True, 'output': str(args.output)}, ensure_ascii=False))
            return
    if args.offline:
        parser.error('The requested commit is not cached in --output; populate it online first')
    ref = urllib.parse.quote(args.ref, safe='')
    with open_url(f'https://api.github.com/repos/{REPO}/commits/{ref}') as response:
        commit = json.load(response)
    sha = commit['sha']
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Unexpected commit ID from official mirror')
    archive_url = f'https://codeload.github.com/{REPO}/tar.gz/{sha}'
    with open_url(archive_url) as response:
        pages = read_pages(response)
    common = {
        'schema_version': 1,
        'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'commit': sha,
        'source': archive_url,
        'official_download_instructions': 'https://ncatlab.org/nlab/show/HowTo',
        'reuse_statement': 'https://ncatlab.org/nlab/show/HomePage',
        'content_scope': 'Page names, redirect names and categories only; no article prose copied.',
    }
    write_json(args.output, {**common, 'pages': pages})
    if args.index_output:
        write_json(args.index_output, {**common, **make_index(pages)})
    print(json.dumps({'commit': sha, 'pages': len(pages), 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
