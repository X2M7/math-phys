#!/usr/bin/env python3
import json,collections,re,datetime,urllib.parse,argparse
import wiki_api as wiki
from pathlib import Path
SCRIPT_DIR=Path(__file__).resolve().parent
REPO=SCRIPT_DIR.parents[2]
parser=argparse.ArgumentParser(description='Verify nLab supplement against both Wikipedia editions; only title/link metadata is requested.')
parser.add_argument('--workdir',type=Path,default=REPO/'.dictionary-cache/nlab')
parser.add_argument('--wikipedia-catalog',type=Path,default=REPO/'.dictionary-cache/wikipedia/catalog.json')
parser.add_argument('--candidate-ids',type=Path,default=SCRIPT_DIR/'candidate-ids.json')
parser.add_argument('--scope-overrides',type=Path,default=SCRIPT_DIR/'scope-overrides.json')
parser.add_argument('--refresh-candidates',action='store_true',help='Select candidates from current nLab/Wikipedia catalogs instead of the committed seed IDs')
parser.add_argument('--offline',action='store_true',help='Require all API responses in the workdir cache; never access the network')
parser.add_argument('--refresh',action='store_true',help='Fetch current Wikipedia metadata instead of cached API responses')
args=parser.parse_args()
if args.offline and args.refresh:parser.error('--offline and --refresh are mutually exclusive')
ROOT=args.workdir;ROOT.mkdir(parents=True,exist_ok=True)
wiki.configure(ROOT/'wikipedia-cache',args.offline,args.refresh)
nlab=json.loads((ROOT/'wikidata-catalog.json').read_text())
if args.refresh_candidates:
 base=json.loads(args.wikipedia_catalog.read_text());existing={r['wikidata_id'] for r in base['verified']}
 rows=[r for r in nlab['verified'] if r['chineseBasis']=='wikipedia-sitelink' and r['qid'] not in existing]
else:
 requested=set(json.loads(args.candidate_ids.read_text())['ids'])
 rows=[r for r in nlab['verified'] if r['qid'] in requested and r['chineseBasis']=='wikipedia-sitelink']
 missing=requested-{r['qid'] for r in rows}
 if missing:raise RuntimeError('Seed IDs absent from current nLab catalog; use --refresh-candidates when deliberately updating sources: '+','.join(sorted(missing)))
(ROOT/'supplement-candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
pending=[];excluded=[];candidates=[]
for r in rows:
 if 'enwiki' not in r['sitelinks']:
  pending.append({'wikidata_id':r['qid'],'nlab_pages':r['nlabPages'],'reasons':['No English Wikipedia sitelink'],'candidate':r});continue
 candidates.append(r)
print('candidates',len(candidates),'no English',len(pending),flush=True)
en_results=wiki.map2(wiki.metadata,wiki.chunks(sorted(set(r['sitelinks']['enwiki']['title'] for r in candidates))),'English')
en_pages={p.get('pageprops',{}).get('wikibase_item'):p for b in en_results for p in b['pages'] if p.get('pageprops',{}).get('wikibase_item')}
zh_results=wiki.map2(wiki.zhmetadata,wiki.chunks(sorted(set(r['sitelinks']['zhwiki']['title'] for r in candidates))),'Chinese')
zh_pages={p.get('pageprops',{}).get('wikibase_item'):p for b in zh_results for p in b['pages'] if p.get('pageprops',{}).get('wikibase_item')}
(ROOT/'wikipedia-supplement-page-metadata.json').write_text(json.dumps({'en':en_results,'zh':zh_results},ensure_ascii=False,indent=2)+'\n')

# Broad discipline mapping only; uncertain scope goes to pending rather than guessing.
GROUP_PATTERNS={
'foundations':r'(?:set theory|sets\b|mathematical logic|proof theory|model theory|type theory|theories of truth|logical connectives|axioms|cardinal numbers|ordinal numbers|binary relations|lambda calculus|recursion theory|computability|formal languages|non-classical logic|propositional logic|predicate logic|logic|mathematical proofs|Boolean functions|quantification)',
'algebra':r'(?:algebra|groups\b|group theory|rings\b|ring theory|modules\b|module theory|fields\b|field theory|matrices|matrix|vector spaces|polynomials|representations|semigroups|monoids|determinants|linear transformations)',
'category-theory':r'(?:category theory|categories\b|functors|topos|categorical)',
'geometry':r'(?:geometry|geometrical|geometric shapes|geometric topology|manifolds|polyhedra|polytopes|polyhedron|differential topology|lie groups|lie group|metric spaces|metrics|Euclidean|geodesics|curves|hypersurfaces|angle)',
'analysis':r'(?:analysis|calculus|integrals|integration|derivatives|differentiation|functions|functional|normed spaces|Banach|Hilbert|real numbers|complex numbers|real number|complex number|measure theory|measures \(|sequences|series \(|series$|limits|trigonometry|trigonometric|logarithms|Fourier|summability|convergence|convexity)',
'differential-equations':r'(?:differential equations|differential equation|dynamical systems|chaos theory|dynamics|calculus of variations)',
'probability-statistics':r'(?:probability|probabilistic|statistics|statistical theory|random|stochastic|distributions|estimation theory)',
'number-theory':r'(?:number theory|arithmetic|diophantine|prime numbers|integers|integer|algebraic numbers|transcendental numbers|modular forms|rational numbers)',
'discrete-math':r'(?:combinatorics|combinatorial|graph theory|graphs\b|order theory|lattices|discrete mathematics|partially ordered sets|permutations)',
'numerical-math':r'(?:numerical|optimization|optimisation|approximation|linear programming|operations research)',
'classical-mechanics':r'(?:classical mechanics|mechanics|mechanical|kinematics|dynamics|force|acceleration|momentum|mass\b|fluid|elasticity|continuum|motion|vibration|speed|velocity)',
'electromagnetism-optics':r'(?:electromagnetic|electromagnetism|electrodynamics|optics|optical|electricity|electrostatics|electric fields|magnetic fields|waves|wavelength|wave mechanics|photons)',
 'thermodynamics-statistical-physics':r'(?:thermodynamics|thermal|temperature|heat\b|entropy|statistical mechanics|statistical physics|phase transitions)',
'quantum-mechanics':r'(?:quantum mechanics|quantum information|quantum computing|quantum measurement|quantum states|quantum state|quantum entanglement|quantum algorithms|uncertainty principle|quantum optics|quantum numbers|interpretations of quantum)',
'relativity-gravitation':r'(?:relativity|gravitation|gravitational|gravity|black hole|spacetime|Lorentzian|relativistic|Einstein)',
'quantum-field-theory-particle':r'(?:quantum field|particle physics|subatomic|elementary particle|gauge theories|gauge theory|supersymmetry|supersymmetric|quarks|quark|bosons|boson|fermions|fermion|mesons|meson|hadrons|hadron|leptons|lepton|neutrino|quantum chromodynamics|quantum electrodynamics|Feynman|Standard Model|renormalization|weak interaction|strong interaction|nuclear physics|nuclear particle)',
'condensed-matter':r'(?:condensed matter|solid.state physics|superconduct|magnetism|quasiparticle|semiconductor|quantum hall)',
'mathematical-physics':r'(?:mathematical physics|string theory|string theories|quantum gravity|topological quantum field|physical constant|physical units|units of|SI base units|SI derived units|physical quantities|physics|tensor field)',
'cosmology':r'(?:cosmology|cosmological|cosmogony|dark matter|universe|Big Bang|galaxies|cosmic|astronomical|astronomy|stellar)',
 'topology':r'(?:topology|topological|homotopy|homology|cohomology|knot|CW complex)',
}
OUTSIDE=re.compile(r'(?<![a-z])(?:philosophy|philosophical|metaphysics|metaphysical|epistemology|ontology|idealism|theology|theological|religion|religious|ethics|aesthetic|cultural|political|parliament|biology|biological|biochemistry|chemical|chemistry|neuroscience|psychology|economics|financial|finance|cryptocurrency|blockchain|smart contract|software|programming language|programming paradigm|programming technique|compiler|computer program|cartography|cartographic|historical chronology)(?![a-z])',re.I)
# Atomic/particle/quantum physics may be cross-categorized under chemistry; do not infer exclusion from categories alone.
OUTSIDE_TITLES={'Science','Analogy','Abductive reasoning','Signal processing','Information theory','Information','Communication','Theoretical computer science','Computer science','Computer','Computational complexity','Programming language','Program semantics','Relational calculus','Applicative functor','Continuation','Monad (functional programming)','Proof assistant','Lambda calculus','Bitcoin','Blockchain','Smart contract','Homotopy type theory','Category of being'}
# Lambda calculus and homotopy type theory are mathematical foundations and remain eligible.
OUTSIDE_TITLES-={'Lambda calculus','Homotopy type theory','Theoretical computer science','Computational complexity'}
MANUAL_GROUPS={}
overrides_path=args.scope_overrides
if overrides_path.exists():MANUAL_GROUPS=json.loads(overrides_path.read_text())
verified=[]
for r in candidates:
 qid=r['qid'];en=en_pages.get(qid);zh=zh_pages.get(qid)
 cats=sorted(set(c['title'] for c in (en or {}).get('categories',[])))
 item={'wikidata_id':qid,'wikidata_revid':r['lastrevid'],'wikidata_labels':r['labels'],'wikidata_descriptions':r['descriptions'],'wikidata_aliases':r['aliases'],'instance_of':r['instanceOf'],'nlab_ids':r['nlabIdsVerified'],'nlab_pages':r['nlabPages'],'groups':[],'seed_categories':[],'seed_titles':[p['title'] for p in r['nlabPages']],'nlab_snapshot':nlab['nlabSnapshot']}
 if not en or not zh:
  item['reasons']=['Wikipedia page missing or resolved QID differs from Wikidata sitelink'];item['en_candidate']=r['sitelinks']['enwiki'];item['zh_candidate']=r['sitelinks']['zhwiki'];pending.append(item);continue
 item['en']={'title':en['title'],'pageid':en.get('pageid'),'revid':en.get('revisions',[{}])[0].get('revid'),'url':en.get('fullurl'),'categories':cats,'wikidata_id':en.get('pageprops',{}).get('wikibase_item')}
 item['zh']={'title':zh['title'],'pageid':zh.get('pageid'),'revid':zh.get('revisions',[{}])[0].get('revid'),'url':zh.get('fullurl'),'wikidata_id':zh.get('pageprops',{}).get('wikibase_item')}
 reasons=[]
 for lang,p in [('English',en),('Chinese',zh)]:
  if p.get('missing') or not p.get('pageid') or p.get('ns')!=0 or not p.get('revisions',[{}])[0].get('revid'):reasons.append(lang+' page unavailable')
  if 'disambiguation'in p.get('pageprops',{}):reasons.append(lang+' disambiguation page')
 if wiki.TITLE_EXCLUDE.search(en['title']):reasons.append('non-concept title')
 reasons += [wiki.EXCLUDED_TYPES[x] for x in item['instance_of'] if x in wiki.EXCLUDED_TYPES]
 reasons += ['non-concept category: '+c for c in cats if wiki.CATEGORY_EXCLUDE.search(c)]
 if reasons:item['reasons']=sorted(set(reasons));excluded.append(item);continue
 title=en['title'];description=r['descriptions'].get('en','');scopeText=' '.join([title,description])
 override=MANUAL_GROUPS.get(qid)
 if override and override.get('exclude'):
  item['reasons']=[override['exclude']];excluded.append(item);continue
 if override and override.get('pending'):
  item['reasons']=[override['pending']];pending.append(item);continue
 if (OUTSIDE.search(scopeText) or title in OUTSIDE_TITLES) and not (override and override.get('groups')):
  item['reasons']=['Outside mathematics/physics scope; manual review required'];pending.append(item);continue
 groups=[g for g,pattern in GROUP_PATTERNS.items() if re.search(pattern,' '.join(cats+[description]+[p['title'] for p in r['nlabPages']]),re.I)]
 if override and override.get('groups'):groups=override['groups']
 if not groups:
  item['reasons']=['Mathematics/physics discipline not established from source metadata'];pending.append(item);continue
 item['groups']=sorted(set(groups))
 item['scope_evidence']={'method':'source category and description topic matching; borderline terms held for review','nlab_categories':sorted(set(c for p in r['nlabPages'] for c in p['categories']))}
 verified.append(item)
out={'schema_version':1,'collection_date':'2026-11-10','generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Supplement from Wikidata P4215 nLab IDs present in official GitHub snapshot; English and Chinese Wikipedia page identities, namespace, revisions, Wikidata IDs and disambiguation status verified via Action API; no article prose copied.','nlab_snapshot':nlab['nlabSnapshot'],'counts':{'source_candidates':len(rows),'verified':len(verified),'pending':len(pending),'excluded':len(excluded)},'verified':verified,'pending':pending,'excluded':excluded}
(ROOT/'wikipedia-supplement.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('DONE',out['counts'],flush=True)
