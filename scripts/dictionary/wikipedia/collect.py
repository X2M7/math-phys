#!/usr/bin/env python3
"""Collect bounded English Wikipedia concept candidates with verifiable zh counterparts.
No article text is copied. Two concurrent requests maximum, cached, identified, retried.
Categories are explicit seeds and only their direct article members are visited.
"""
import argparse, concurrent.futures, datetime, hashlib, json, os, pathlib, re, threading, time, urllib.error, urllib.parse, urllib.request
SCRIPT_DIR=pathlib.Path(__file__).resolve().parent
DEFAULT_WORKDIR=SCRIPT_DIR.parents[2]/'.dictionary-cache'/'wikipedia'
ROOT=DEFAULT_WORKDIR
CACHE=ROOT/'cache'

def configure_workdir(workdir=None):
 global ROOT,CACHE
 ROOT=pathlib.Path(workdir or os.environ.get('MATH_PHYS_DICTIONARY_CACHE') or DEFAULT_WORKDIR).expanduser().resolve()
 ROOT.mkdir(parents=True,exist_ok=True)
 CACHE=ROOT/'cache';CACHE.mkdir(exist_ok=True)
 return ROOT
UA='math-phys-dictionary-catalog/1.0 (+https://github.com/X2M7/math-phys)'
lock=threading.Lock(); last_request=0; requests_count=0
SEEDS=json.loads((SCRIPT_DIR/'seeds.json').read_text())

def write(name,data):
 p=ROOT/name; tmp=p.with_suffix(p.suffix+'.tmp')
 tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)

def fetch(host,params):
 global last_request,requests_count
 params={'format':'json','formatversion':2,'maxlag':5,**params}
 url='https://'+host+'/w/api.php?'+urllib.parse.urlencode(sorted(params.items()))
 key=hashlib.sha256(url.encode()).hexdigest();path=CACHE/(key+'.json')
 if path.exists():return json.loads(path.read_text())
 for attempt in range(5):
  with lock:
   delay=.55-(time.monotonic()-last_request)
   if delay>0:time.sleep(delay)
   last_request=time.monotonic();requests_count+=1
  try:
   req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=70) as r:data=json.load(r)
   if data.get('error'):
    if data['error'].get('code') in ['maxlag','ratelimited']: time.sleep(5*(attempt+1));continue
    raise ValueError(data['error'])
   path.write_text(json.dumps(data,ensure_ascii=False));return data
  except urllib.error.HTTPError as e:
   if e.code not in [429,500,502,503,504]:raise
   delay=max(float(e.headers.get('Retry-After','0')),3*2**attempt)
   print('RETRY',e.code,round(delay,1),host,flush=True);time.sleep(delay)
  except (TimeoutError,urllib.error.URLError) as e:
   print('RETRY',type(e).__name__,host,flush=True);time.sleep(3*2**attempt)
 raise RuntimeError('Exhausted retries: '+url)

def map2(fn,items,label):
 result=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  futures={ex.submit(fn,x):x for x in items}
  for i,f in enumerate(concurrent.futures.as_completed(futures),1):
   result.append(f.result())
   if i%10==0 or i==len(items):print(label,i,'/',len(items),'network',requests_count,flush=True)
 return result

def category(item):
 group,name=item;members=[];params={'action':'query','list':'categorymembers','cmtitle':'Category:'+name,'cmnamespace':0,'cmtype':'page','cmlimit':500}
 while True:
  r=fetch('en.wikipedia.org',params);members.extend(r.get('query',{}).get('categorymembers',[]))
  if not r.get('continue'):break
  params.update(r['continue'])
 return {'group':group,'category':'Category:'+name,'members':members}

def chunks(items,size=50):return [items[i:i+size] for i in range(0,len(items),size)]

def metadata(batch):
 params={'action':'query','titles':'|'.join(batch),'redirects':1,'prop':'info|revisions|pageprops|langlinks|categories','inprop':'url','rvprop':'ids','lllang':'zh','lllimit':'max','llprop':'url','cllimit':'max','clshow':'!hidden'}
 pages={};redirects=[];normalized=[]
 while True:
  r=fetch('en.wikipedia.org',params);q=r.get('query',{});redirects+=q.get('redirects',[]);normalized+=q.get('normalized',[])
  for p in q.get('pages',[]):
   key=p.get('pageid',p['title'])
   if key not in pages:pages[key]=p
   else:
    for k,v in p.items():
     if k in ['categories','langlinks']:pages[key].setdefault(k,[]).extend(v)
     else:pages[key][k]=v
  if not r.get('continue'):break
  params.update(r['continue'])
 return {'pages':list(pages.values()),'redirects':redirects,'normalized':normalized}

def entities(batch):
 params={'action':'wbgetentities','ids':'|'.join(batch),'props':'labels|aliases|descriptions|claims|sitelinks','languages':'en|zh|zh-hans|zh-hant','sitefilter':'enwiki|zhwiki'}
 # Earlier collection batches lacked info; obtain only their revision metadata.
 oldurl='https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode(sorted({'format':'json','formatversion':2,'maxlag':5,**params}.items()))
 oldcache=CACHE/(hashlib.sha256(oldurl.encode()).hexdigest()+'.json')
 if oldcache.exists():
  data=json.loads(oldcache.read_text())['entities']
  inf=fetch('www.wikidata.org',{'action':'wbgetentities','ids':'|'.join(batch),'props':'info'})['entities']
  for qid,e in data.items():e.update(inf.get(qid,{}))
  return data
 params['props']='info|'+params['props']
 return fetch('www.wikidata.org',params)['entities']

def zhmetadata(batch):
 return fetch('zh.wikipedia.org',{'action':'query','titles':'|'.join(batch),'redirects':1,'prop':'info|revisions|pageprops','inprop':'url','rvprop':'ids'})['query']

def claimids(e,property):
 return [x['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for x in e.get('claims',{}).get(property,[]) if x['mainsnak'].get('datavalue',{}).get('type')=='wikibase-entityid']

def claimstrings(e,property):
 return [x['mainsnak']['datavalue']['value'] for x in e.get('claims',{}).get(property,[]) if x['mainsnak'].get('datavalue',{}).get('type')=='string']

# Conservative exclusions, supplemented by explicit page-category evidence below.
EXCLUDED_TYPES={
 'Q5':'human','Q4167410':'disambiguation','Q13406463':'list article',
 'Q571':'book','Q8261':'novel','Q11424':'film','Q5398426':'television series','Q47461344':'written work',
 'Q5633421':'scientific journal','Q737498':'academic journal','Q1002697':'periodical','Q49848':'document',
 'Q43229':'organization','Q3918':'university','Q4830453':'business','Q31855':'research institute',
 'Q16521':'taxon','Q6256':'country','Q515':'city','Q532':'village','Q82794':'geographic region',
 'Q21191270':'television episode','Q95074':'fictional character','Q11753321':'Wikimedia navigational template',
 'Q386724':'work','Q18602566':'Wikimedia disambiguation page',
 'Q7397':'software','Q188860':'software library','Q341':'free software','Q40056':'computer program','Q166142':'application software',
 'Q148578':'space observatory','Q24748034':'individual gravitational-wave event','Q125191':'photograph','Q1121886':'color photograph',
}
TITLE_EXCLUDE=re.compile(r'^(List of |Lists of |Glossary of |Outline of |Timeline of |History of |Introduction to |Comparison of |Book:|Draft:|Wikipedia:)|\((?:journal|book|film|novel|magazine|software)\)$',re.I)
CATEGORY_EXCLUDE=re.compile(r'(?:^Category:(?:.*(?: births| deaths| people| physicists| mathematicians| philosophers| astronomers| scientists| books| journals| organizations| institutions| companies| universities| societies| magazines| conferences| awards| textbooks| biographies| timelines| lists| television series| films| novels| software)))$',re.I)

def main(workdir=None):
 configure_workdir(workdir)
 category_results=map2(category,[(g,n) for g,names in SEEDS.items() for n in names],'categories');write('category-members.json',category_results)
 seedmap={}
 for c in category_results:
  for p in c['members']:
   v=seedmap.setdefault(p['title'],{'seed_pageid':p['pageid'],'groups':set(),'seed_categories':set()});v['groups'].add(c['group']);v['seed_categories'].add(c['category'])
 print('UNIQUE_CANDIDATES',len(seedmap),flush=True)
 results=map2(metadata,chunks(sorted(seedmap)),'metadata');write('english-metadata.json',results)
 alias={}
 pages={}
 for r in results:
  for v in r['normalized']+r['redirects']:alias[v['from']]=v['to']
  for p in r['pages']:
   if p.get('missing') or not p.get('pageid'):continue
   pages[p['title']]=p
 def canonical(t):
  seen=set()
  while t in alias and t not in seen:seen.add(t);t=alias[t]
  return t
 source={}
 for t,s in seedmap.items():
  key=canonical(t);r=source.setdefault(key,{'groups':set(),'seed_categories':set(),'seed_titles':set()});r['groups'].update(s['groups']);r['seed_categories'].update(s['seed_categories']);r['seed_titles'].add(t)
 ids=sorted(set(p.get('pageprops',{}).get('wikibase_item') for p in pages.values())-{None})
 es={}
 for part in map2(entities,chunks(ids),'entities'):es.update(part)
 # Keep only required fact metadata, not full article data or bulky entity claims.
 slim={qid:{'id':qid,'lastrevid':e.get('lastrevid'),'labels':e.get('labels',{}),'descriptions':e.get('descriptions',{}),'aliases':e.get('aliases',{}),'sitelinks':e.get('sitelinks',{}),'instance_of':claimids(e,'P31'),'nlab_ids':claimstrings(e,'P4215')} for qid,e in es.items()}
 write('entity-metadata.json',slim)
 zhtitles=sorted(set(p['langlinks'][0]['title'] for p in pages.values() if p.get('langlinks')))
 zhs={};zhalias={}
 for q in map2(zhmetadata,chunks(zhtitles),'chinese'):
  for p in q.get('pages',[]):zhs[p['title']]=p
  for r in q.get('normalized',[])+q.get('redirects',[]):zhalias[r['from']]=r['to']
 write('chinese-metadata.json',{'pages':zhs,'aliases':zhalias})
 output={'schema_version':1,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'collection_date':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'method':'Direct namespace-0 members of explicit English Wikipedia categories; canonical English and Chinese page identities verified via Action API, entity types via Wikidata. No recursive category traversal. No article text copied.','seeds':SEEDS,'verified':[],'labelBased':[],'pending':[],'excluded':[]}
 for title,p in sorted(pages.items()):
  src=source.get(title,{'groups':set(),'seed_categories':set(),'seed_titles':set()})
  qid=p.get('pageprops',{}).get('wikibase_item');e=slim.get(qid,{})
  cats=sorted(set(c['title'] for c in p.get('categories',[])))
  en={'title':title,'pageid':p['pageid'],'revid':p.get('revisions',[{}])[0].get('revid'),'url':p.get('fullurl'),'categories':cats}
  item={'en':en,'wikidata_id':qid,'wikidata_revid':e.get('lastrevid'),'wikidata_labels':{k:v['value'] for k,v in e.get('labels',{}).items()},'wikidata_descriptions':{k:v['value'] for k,v in e.get('descriptions',{}).items()},'wikidata_aliases':{k:[a['value'] for a in v] for k,v in e.get('aliases',{}).items()},'instance_of':e.get('instance_of',[]),'nlab_ids':e.get('nlab_ids',[]),'groups':sorted(src['groups']),'seed_categories':sorted(src['seed_categories']),'seed_titles':sorted(src['seed_titles'])}
  reasons=[]
  if 'disambiguation' in p.get('pageprops',{}):reasons.append('disambiguation')
  if TITLE_EXCLUDE.search(title):reasons.append('non-concept title')
  reasons += [EXCLUDED_TYPES[x] for x in item['instance_of'] if x in EXCLUDED_TYPES]
  reasons += ['non-concept category: '+c for c in cats if CATEGORY_EXCLUDE.search(c)]
  if reasons:
   item['reasons']=sorted(set(reasons));output['excluded'].append(item);continue
  links=p.get('langlinks',[])
  if not links:
   item['reasons']=['No Chinese Wikipedia counterpart'];output['labelBased' if any(k.startswith('zh') for k in item['wikidata_labels']) else 'pending'].append(item);continue
  zhtitle=links[0]['title'];seen=set()
  while zhtitle in zhalias and zhtitle not in seen:seen.add(zhtitle);zhtitle=zhalias[zhtitle]
  zh=zhs.get(zhtitle,{})
  if not zh or zh.get('missing') or not zh.get('pageid'):
   item['reasons']=['Chinese counterpart unavailable'];output['pending'].append(item);continue
  zhqid=zh.get('pageprops',{}).get('wikibase_item')
  if not qid or not zhqid or qid!=zhqid:
   item['reasons']=['English and Chinese Wikidata identity mismatch'];item['zh_candidate']=zh;output['pending'].append(item);continue
  if 'disambiguation' in zh.get('pageprops',{}):
   item['reasons']=['Chinese counterpart is disambiguation'];output['pending'].append(item);continue
  item['zh']={'title':zh['title'],'pageid':zh['pageid'],'revid':zh.get('revisions',[{}])[0].get('revid'),'url':zh.get('fullurl'),'wikidata_id':zhqid}
  output['verified'].append(item)
 write('catalog.json',output)
 report={'candidate_seed_titles':len(seedmap),'canonical_english_pages':len(pages),'verified':len(output['verified']),'labelBased':len(output['labelBased']),'pending':len(output['pending']),'excluded':len(output['excluded']),'with_nlab_id':sum(bool(x['nlab_ids']) for x in output['verified']),'group_counts':{g:{k:sum(g in x['groups'] for x in output[k]) for k in ['verified','labelBased','pending','excluded']} for g in SEEDS},'empty_categories':[c['category'] for c in category_results if not c['members']]}
 write('report.json',report);print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--workdir',help='Output/cache directory; defaults to MATH_PHYS_DICTIONARY_CACHE or repository .dictionary-cache/wikipedia')
 main(parser.parse_args().workdir)
