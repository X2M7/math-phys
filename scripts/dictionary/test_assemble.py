"""Offline regression checks for the reviewed-translation assembly boundary.

Run with: python3 -m unittest discover -s scripts/dictionary -p 'test_*.py'
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('assemble.py')


class ReviewedTranslationAssemblyTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.entry = {
            'qid': 'Q1', 'en': 'Example concept', 'zh': '示例概念',
            'variants': [], 'subjects': ['algebra'],
            'sources': {
                'enWikipedia': {'title': 'Example concept', 'pageId': 1, 'revisionId': 2},
                'wikidata': {'revisionId': 3}, 'nlab': [],
            },
            'translation': {'basis': 'academic-usage', 'sources': [{'title': 'Example reference'}]},
            'wikipediaVerification': {
                'verifiedOn': '2026-11-10', 'enQid': 'Q1',
                'enPageId': 1, 'enRevisionId': 2, 'zhSitelink': None,
            },
        }
        self.write('subjects.json', {'algebra': '代数 / Algebra'})
        self.write('wiki.json', {
            'verified': [], 'pending': [{'wikidata_id': 'Q1', 'en': {'title': 'Example concept'}}],
            'collection_date': '2026-11-10', 'seeds': {},
        })
        self.write('nlab.json', {'verified': [], 'pending': [], 'nlabSnapshot': 'a' * 40})
        self.write('supplement.json', {'verified': []})
        self.write('review.json', {'exclude': []})
        self.write('translations.json', {'entries': [self.entry]})

    def write(self, name, value):
        (self.root / name).write_text(json.dumps(value), encoding='utf-8')

    def run_assembly(self, reviewed='translations.json'):
        return subprocess.run([
            sys.executable, str(SCRIPT), '--wikipedia', str(self.root / 'wiki.json'),
            '--nlab', str(self.root / 'nlab.json'), '--supplement', str(self.root / 'supplement.json'),
            '--review', str(self.root / 'review.json'), '--english-only', str(self.root / reviewed),
            '--output', str(self.root),
        ], capture_output=True, text=True)

    def test_refresh_preserves_id_evidence_and_removes_pending(self):
        self.write('catalog.json', {'entries': [{**self.entry, 'id': 'author-stable-id'}]})
        result = self.run_assembly()
        self.assertEqual(result.returncode, 0, result.stderr)
        actual = json.loads((self.root / 'catalog.json').read_text())['entries'][0]
        self.assertEqual(actual['id'], 'author-stable-id')
        self.assertEqual(actual['wikipediaVerification'], self.entry['wikipediaVerification'])
        self.assertNotIn('zhWikipedia', actual['sources'])
        self.assertEqual(json.loads((self.root / 'pending.json').read_text())['entries'], [])
        manifest = json.loads((self.root / 'manifest.json').read_text())
        self.assertEqual(manifest['withSourcedTranslation'], 1)
        self.assertEqual(manifest['withChineseWikipedia'], 0)

    def test_missing_explicit_file_does_not_overwrite_catalog(self):
        self.write('catalog.json', {'entries': [{**self.entry, 'id': 'example-concept'}]})
        previous = (self.root / 'catalog.json').read_bytes()
        result = self.run_assembly('missing.json')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('refusing to drop published translations', result.stderr)
        self.assertEqual((self.root / 'catalog.json').read_bytes(), previous)

    def test_invalid_identity_and_dates_fail_before_writing(self):
        for change in ({'enQid': 'Q2'}, {'enPageId': 99}, {'enRevisionId': 99},
                       {'zhSitelink': '中文页'}, {'verifiedOn': '2026-02-30'}):
            with self.subTest(change=change):
                entry = {**self.entry, 'wikipediaVerification': {
                    **self.entry['wikipediaVerification'], **change,
                }}
                self.write('translations.json', {'entries': [entry]})
                result = self.run_assembly()
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / 'catalog.json').exists())

    def test_translation_cannot_override_scope_review(self):
        self.write('review.json', {'exclude': [{'qid': 'Q1', 'reason': 'Out of scope'}]})
        result = self.run_assembly()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('translation does not override scope review', result.stderr)
        self.assertFalse((self.root / 'catalog.json').exists())


if __name__ == '__main__':
    unittest.main()
