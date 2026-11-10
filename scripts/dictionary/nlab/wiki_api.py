"""Bounded, cached Wikimedia Action API reads; no article prose is requested."""
import concurrent.futures, hashlib, json, pathlib, re, threading, time, urllib.error, urllib.parse, urllib.request
UA='math-phys-dictionary-catalog/1.0 (+https://github.com/X2M7/math-phys)'
CACHE=None
OFFLINE=False
REFRESH=False
lock=threading.Lock(); last_request=0; requests_count=0

def configure(cache, offline=False, refresh=False):
 global CACHE, OFFLINE, REFRESH
 CACHE=pathlib.Path(cache); CACHE.mkdir(parents=True,exist_ok=True); OFFLINE=offline; REFRESH=refresh

def fetch(host,params):
 global last_request,requests_count
 params={'format':'json','formatversion':2,'maxlag':5,**params}
 url='https://'+host+'/w/api.php?'+urllib.parse.urlencode(sorted(params.items()))
 key=hashlib.sha256(url.encode()).hexdigest();path=CACHE/(key+'.json')
 if path.exists() and not REFRESH:return json.loads(path.read_text())
 if OFFLINE:raise RuntimeError('Missing offline API cache: '+str(path))
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

def zhmetadata(batch):
 return fetch('zh.wikipedia.org',{'action':'query','titles':'|'.join(batch),'redirects':1,'prop':'info|revisions|pageprops','inprop':'url','rvprop':'ids'})['query']

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

TITLE_EXCLUDE=re.compile(r'^(List of |Lists of |Glossary of |Index of |Outline of |Timeline of |History of |Introduction to |Table of |Comparison of |Book:|Draft:|Wikipedia:)|\((?:journal|book|film|novel|magazine|software)\)$',re.I)

CATEGORY_EXCLUDE=re.compile(r'(?:^Category:(?:.*(?: births| deaths| people| physicists| mathematicians| philosophers| astronomers| scientists| books| journals| organizations| institutions| companies| universities| societies| magazines| conferences| awards| textbooks| biographies| timelines| lists| television series| films| novels| software)))$',re.I)
