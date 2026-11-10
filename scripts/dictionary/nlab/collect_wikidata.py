#!/usr/bin/env python3
"""Collect nLab-linked Wikidata metadata; untranslated and label-only terms stay distinguishable."""
import urllib.request,urllib.parse,json,time,collections,re,argparse,datetime
from pathlib import Path
SCRIPT_DIR=Path(__file__).resolve().parent
REPO=SCRIPT_DIR.parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workdir',type=Path,default=REPO/'.dictionary-cache/nlab')
parser.add_argument('--offline',action='store_true',help='Read existing query and entity caches without network access')
parser.add_argument('--refresh',action='store_true',help='Refresh the Wikidata query and entity metadata')
args=parser.parse_args()
if args.offline and args.refresh:parser.error('--offline and --refresh are mutually exclusive')
ROOT=args.workdir;ROOT.mkdir(parents=True,exist_ok=True)
CACHE=ROOT/'wikidata-entities';CACHE.mkdir(exist_ok=True)
UA='math-phys-dictionary/1.0 (https://github.com/X2M7/math-phys)'
LANGS=['en','zh','zh-hans','zh-cn','zh-hant','zh-tw','zh-sg','zh-hk']
EXCLUDED_CATEGORIES={'people','reference','meta','empty','svg','software','disambiguation'}
EXCLUDED_INSTANCE_OF={'Q5':'human','Q571':'book','Q47461344':'written work','Q7725634':'literary work','Q13442814':'scholarly article','Q13406463':'Wikimedia list article','Q4167410':'Wikimedia disambiguation page','Q43229':'organization','Q4830453':'business','Q783794':'company','Q3918':'university','Q1656682':'planned event','Q2020153':'academic conference','Q5633421':'scientific journal','Q737498':'academic journal','Q738377':'student newspaper','Q98270496':'accepted NFDI consortium','Q163740':'nonprofit organization','Q34770':'language','Q1130645':'open-source software'}

def getjson(url,timeout=50):
 if args.offline:raise RuntimeError('Missing cached data in offline mode: '+url)
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'}),timeout=timeout) as r:return json.load(r)
  except Exception as exc:
   print('retry',attempt+1,str(exc),flush=True)
   if attempt==3:raise
   time.sleep(2*(attempt+1))

page_metadata=json.loads((ROOT/'page-metadata.json').read_text());pages={r['title']:r for r in page_metadata['pages']}
name_index=json.loads((ROOT/'title-and-redirect-index.json').read_text())
query_file=ROOT/'wikidata-sparql.json'
query_text='SELECT ?item ?nlab WHERE { ?item wdt:P4215 ?nlab }'
if not query_file.exists() or args.refresh:
 query_url='https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':query_text,'format':'json'})
 query_result=getjson(query_url,60)
 query_file.write_text(json.dumps(query_result,ensure_ascii=False)+'\n')
 (ROOT/'wikidata-query.sparql').write_text(query_text+'\n')
query_data=json.loads(query_file.read_text())['results']['bindings']
records={}
for raw in query_data:
 qid=raw['item']['value'].rsplit('/',1)[-1]
 row=records.setdefault(qid,{'qid':qid,'nlabIds':[]})
 if raw['nlab']['value'] not in row['nlabIds']:row['nlabIds'].append(raw['nlab']['value'])
 for field in ['enLabel','zhLabel','zhHansLabel','enArticle','enTitle','zhArticle','zhTitle']:
  if field in raw:row[field]=raw[field]['value']

excluded=[];pending=[];candidates=[]
for row in records.values():
 matches=[]
 for nlab in row['nlabIds']:
  name=urllib.parse.unquote(nlab)
  if name in pages:canonical=name
  elif name in name_index['titles']:canonical=name_index['titles'][name]
  else:continue
  if canonical not in matches:matches.append(canonical)
 row['nlabPages']=[{k:pages[n][k] for k in ['title','url','sourcePath','categories']} for n in matches]
 if not matches:
  row['reason']='nlab-id-not-unambiguously-present-in-official-snapshot';excluded.append(row);continue
 if all(EXCLUDED_CATEGORIES.intersection(pages[n]['categories']) for n in matches):
  row['reason']='nlab-nonconcept-category';excluded.append(row);continue
 candidates.append(row)
print('pre-hydration',{'all':len(records),'candidates':len(candidates),'pending':len(pending),'excluded':len(excluded)},flush=True)
entities={}
for row in candidates:
 file=CACHE/(row['qid']+'.json')
 if file.exists() and not args.refresh:entities[row['qid']]=json.loads(file.read_text())
missing=[r['qid'] for r in candidates if r['qid'] not in entities]
for start in range(0,len(missing),50):
 ids=missing[start:start+50]
 url='https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode({'action':'wbgetentities','ids':'|'.join(ids),'props':'labels|aliases|descriptions|claims|sitelinks|info','languages':'|'.join(LANGS),'sitefilter':'enwiki|zhwiki','format':'json','maxlag':'5'})
 data=getjson(url)
 if 'error' in data:raise RuntimeError(data['error'])
 for qid,entity in data['entities'].items():
  entities[qid]=entity;(CACHE/(qid+'.json')).write_text(json.dumps(entity,ensure_ascii=False)+'\n')
 print('entities',min(start+50,len(missing)),'/',len(missing),flush=True)
 time.sleep(.3)

verified=[]
for row in candidates:
 entity=entities[row['qid']]
 claims=entity.get('claims',{})
 def claimvals(prop):
  return [st['mainsnak']['datavalue']['value'] for st in claims.get(prop,[]) if st.get('rank')!='deprecated' and st.get('mainsnak',{}).get('snaktype')=='value' and 'datavalue'in st['mainsnak']]
 instance_of=[v['id'] for v in claimvals('P31') if isinstance(v,dict) and 'id'in v]
 row['instanceOf']=instance_of;row['lastrevid']=entity.get('lastrevid');row['modified']=entity.get('modified')
 row['nlabIdsVerified']=claimvals('P4215')
 if not set(row['nlabIds']).intersection(row['nlabIdsVerified']):
  row['reason']='P4215-changed-since-query';excluded.append(row);continue
 disallowed=[EXCLUDED_INSTANCE_OF[q] for q in instance_of if q in EXCLUDED_INSTANCE_OF]
 if disallowed:
  row['reason']='wikidata-nonconcept-instance:'+','.join(disallowed);excluded.append(row);continue
 labels={lang:v['value'] for lang,v in entity.get('labels',{}).items()}
 row['labels']=labels
 row['descriptions']={lang:v['value'] for lang,v in entity.get('descriptions',{}).items()}
 row['aliases']={lang:[a['value'] for a in aliases] for lang,aliases in entity.get('aliases',{}).items()}
 row['sitelinks']={site:{'title':link['title'],'url':f"https://{'en' if site=='enwiki' else 'zh'}.wikipedia.org/wiki/"+urllib.parse.quote(link['title'].replace(' ','_'),safe='()')} for site,link in entity.get('sitelinks',{}).items() if site in ['enwiki','zhwiki']}
 row['english']=row['sitelinks'].get('enwiki',{}).get('title') or labels.get('en') or row['nlabPages'][0]['title']
 row['chinese']=row['sitelinks'].get('zhwiki',{}).get('title') or next((labels[lang] for lang in ['zh-hans','zh-cn','zh','zh-sg','zh-hant','zh-tw','zh-hk'] if labels.get(lang)),None)
 row['chineseBasis']='wikipedia-sitelink' if row['sitelinks'].get('zhwiki') else 'wikidata-label'
 row['verification']='Wikidata API labels, aliases, P31, P4215 and sitelinks; nLab official source snapshot membership; Wikipedia pages not fetched'
 if not row['chinese']:
  row['reason']='no-chinese-label-or-zhwiki-sitelink';pending.append(row);continue
 if not re.search(r'[\u3400-\u4dbf\u4e00-\u9fff]',row['chinese']):
  row['reason']='chinese-field-has-no-Han-characters';pending.append(row);continue
 verified.append(row)

previous_catalog=ROOT/'wikidata-catalog.json'
retrieved=json.loads(previous_catalog.read_text()).get('retrieved') if args.offline and previous_catalog.exists() else datetime.datetime.now(datetime.timezone.utc).date().isoformat()
output={'retrieved':retrieved,'sourceQuery':(ROOT/'wikidata-query.sparql').read_text(),'queryEndpoint':'https://query.wikidata.org/sparql','entityApi':'https://www.wikidata.org/w/api.php?action=wbgetentities','nlabSnapshot':page_metadata['commit'],'nlabSource':page_metadata['source'],'dataLicense':'Wikidata structured data CC0; nLab titles, redirect identifiers and category metadata retained for attribution/matching, no article prose copied','counts':{'queryEntities':len(records),'verified':len(verified),'pending':len(pending),'excluded':len(excluded),'wikipediaSitelink':sum(r['chineseBasis']=='wikipedia-sitelink' for r in verified),'wikidataLabel':sum(r['chineseBasis']=='wikidata-label' for r in verified)},'verified':sorted(verified,key=lambda r:r['english'].casefold()),'pending':pending,'excluded':excluded}
(ROOT/'wikidata-catalog.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print('DONE',output['counts'],flush=True)
