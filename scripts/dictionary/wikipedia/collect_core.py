#!/usr/bin/env python3
"""Incrementally verify explicit core terms, reusing the category catalog's metadata."""
import argparse,collections,datetime,json,pathlib
import collect as c
ROOT=c.ROOT
CORES=json.loads((c.SCRIPT_DIR/'core-seeds.json').read_text())

def main(workdir=None):
 global ROOT
 ROOT=c.configure_workdir(workdir)
 base=json.loads((ROOT/'catalog.json').read_text())
 catalog={x['en']['pageid']:(kind,x) for kind in ['verified','labelBased','pending','excluded'] for x in base[kind]}
 metas=json.loads((ROOT/'english-metadata.json').read_text())
 oldcore=json.loads((ROOT/'core-english-metadata.json').read_text()) if (ROOT/'core-english-metadata.json').exists() else []
 metas+=oldcore
 bytitle={};aliases={};fragments={}
 for r in metas:
  bytitle.update({p['title']:p for p in r['pages'] if p.get('pageid')})
  for x in r['normalized']+r['redirects']:
   aliases[x['from']]=x['to']
   if x.get('tofragment'):fragments[x['from']]={'to':x['to'],'fragment':x['tofragment']}
 def canonical(t):
  seen=set()
  while t in aliases and t not in seen:seen.add(t);t=aliases[t]
  return t
 titles=sorted(set(t for ts in CORES.values() for t in ts))
 need=[t for t in titles if canonical(t) not in bytitle]
 print('CORE seed titles',len(titles),'new metadata titles',len(need),flush=True)
 newmeta=c.map2(c.metadata,c.chunks(need),'core metadata')
 c.write('core-english-metadata.json',oldcore+newmeta)
 for r in newmeta:
  bytitle.update({p['title']:p for p in r['pages'] if p.get('pageid')})
  for x in r['normalized']+r['redirects']:
   aliases[x['from']]=x['to']
   if x.get('tofragment'):fragments[x['from']]={'to':x['to'],'fragment':x['tofragment']}
 es=json.loads((ROOT/'entity-metadata.json').read_text())
 if (ROOT/'core-entity-metadata.json').exists():es.update(json.loads((ROOT/'core-entity-metadata.json').read_text()))
 allids=sorted(set(bytitle[canonical(t)].get('pageprops',{}).get('wikibase_item') for t in titles if canonical(t) in bytitle)-{None})
 ids=[qid for qid in allids if qid not in es]
 for part in c.map2(c.entities,c.chunks(ids),'core entities'):
  for qid,e in part.items():es[qid]={'id':qid,'lastrevid':e.get('lastrevid'),'labels':e.get('labels',{}),'descriptions':e.get('descriptions',{}),'aliases':e.get('aliases',{}),'sitelinks':e.get('sitelinks',{}),'instance_of':c.claimids(e,'P31'),'nlab_ids':c.claimstrings(e,'P4215')}
 c.write('core-entity-metadata.json',{qid:es[qid] for qid in allids})
 zhdata=json.loads((ROOT/'chinese-metadata.json').read_text());zhs=zhdata['pages'];zhalias=zhdata['aliases']
 if (ROOT/'core-chinese-metadata.json').exists():
  oldzh=json.loads((ROOT/'core-chinese-metadata.json').read_text());zhs.update(oldzh['pages']);zhalias.update(oldzh['aliases'])
 zhtitles=sorted(set(bytitle[canonical(t)]['langlinks'][0]['title'] for t in titles if canonical(t) in bytitle and bytitle[canonical(t)].get('langlinks')))
 def zhcanonical(t):
  seen=set()
  while t in zhalias and t not in seen:seen.add(t);t=zhalias[t]
  return t
 zhneed=[t for t in zhtitles if zhcanonical(t) not in zhs]
 for q in c.map2(c.zhmetadata,c.chunks(zhneed),'core chinese'):
  for p in q.get('pages',[]):zhs[p['title']]=p
  for x in q.get('normalized',[])+q.get('redirects',[]):zhalias[x['from']]=x['to']
 c.write('core-chinese-metadata.json',{'pages':{zhcanonical(t):zhs.get(zhcanonical(t),{}) for t in zhtitles},'aliases':{t:zhcanonical(t) for t in zhtitles if t!=zhcanonical(t)}})
 report={'seed_count':sum(map(len,CORES.values())),'unique_seed_titles':len(titles),'new_metadata_requests':len(need),'new_entity_ids':len(ids),'new_chinese_titles':len(zhneed),'new_records':[],'missing':[],'section_redirects':[],'coverage':[]}
 for group,ts in CORES.items():
  for seed in ts:
   title=canonical(seed);p=bytitle.get(title)
   if not p or p.get('missing'):
    report['missing'].append({'seed':seed,'group':group});continue
   if seed in fragments:
    report['section_redirects'].append({'seed':seed,'group':group,**fragments[seed]})
    # A section redirect is useful navigation, not evidence that two concepts coincide.
    continue
   if p['pageid'] in catalog:
    kind,x=catalog[p['pageid']]
    x['groups']=sorted(set(x['groups']+[group]));x['core_seed_groups']=sorted(set(x.get('core_seed_groups',[])+[group]));x['seed_titles']=sorted(set(x['seed_titles']+[seed]))
    report['coverage'].append({'seed':seed,'group':group,'canonical':title,'wikidata_id':x['wikidata_id'],'status':kind});continue
   qid=p.get('pageprops',{}).get('wikibase_item');e=es.get(qid,{})
   categories=sorted(set(x['title'] for x in p.get('categories',[])))
   x={'en':{'title':title,'pageid':p['pageid'],'revid':p.get('revisions',[{}])[0].get('revid'),'url':p.get('fullurl'),'categories':categories},'wikidata_id':qid,'wikidata_revid':e.get('lastrevid'),'wikidata_labels':{k:v['value'] for k,v in e.get('labels',{}).items()},'wikidata_descriptions':{k:v['value'] for k,v in e.get('descriptions',{}).items()},'wikidata_aliases':{k:[a['value'] for a in v] for k,v in e.get('aliases',{}).items()},'instance_of':e.get('instance_of',[]),'nlab_ids':e.get('nlab_ids',[]),'groups':[group],'seed_categories':[],'seed_titles':[seed],'core_seed_groups':[group]}
   reasons=[]
   if 'disambiguation' in p.get('pageprops',{}):reasons.append('disambiguation')
   if c.TITLE_EXCLUDE.search(title):reasons.append('non-concept title')
   reasons += [c.EXCLUDED_TYPES[k] for k in x['instance_of'] if k in c.EXCLUDED_TYPES]
   reasons += ['non-concept category: '+v for v in categories if c.CATEGORY_EXCLUDE.search(v)]
   if reasons:kind='excluded';x['reasons']=sorted(set(reasons))
   elif not p.get('langlinks'):
    kind='labelBased' if any(k.startswith('zh') for k in x['wikidata_labels']) else 'pending';x['reasons']=['No Chinese Wikipedia counterpart']
   else:
    zhtitle=zhcanonical(p['langlinks'][0]['title']);zh=zhs.get(zhtitle,{})
    zhqid=zh.get('pageprops',{}).get('wikibase_item')
    if not zh or zh.get('missing') or not zh.get('pageid'):kind='pending';x['reasons']=['Chinese counterpart unavailable']
    elif not qid or not zhqid or qid!=zhqid:kind='pending';x['reasons']=['English and Chinese Wikidata identity mismatch'];x['zh_candidate']=zh
    elif 'disambiguation' in zh.get('pageprops',{}):kind='pending';x['reasons']=['Chinese counterpart is disambiguation']
    else:
     kind='verified';x['zh']={'title':zh['title'],'pageid':zh['pageid'],'revid':zh.get('revisions',[{}])[0].get('revid'),'url':zh.get('fullurl'),'wikidata_id':zhqid}
   catalog[p['pageid']]=(kind,x)
   report['new_records'].append({'seed':seed,'canonical':title,'wikidata_id':qid,'status':kind})
   report['coverage'].append({'seed':seed,'group':group,'canonical':title,'wikidata_id':qid,'status':kind})
 for kind in ['verified','labelBased','pending','excluded']:base[kind]=sorted((x for k,x in catalog.values() if k==kind),key=lambda x:x['en']['title'])
 base['core_seeds']=CORES
 base['generated_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 if 'Explicit core concept seed list' not in base['method']:base['method']+=' Explicit core concept seed list supplements direct category membership; section redirects remain review candidates.'
 c.write('catalog.json',base);c.write('core-report.json',report)
 totals={k:len(base[k]) for k in ['verified','labelBased','pending','excluded']}
 print(json.dumps({'totals':totals,'core_new':dict(collections.Counter(x['status'] for x in report['new_records'])),'missing':report['missing'],'section_redirects':report['section_redirects']},ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--workdir',help='Output/cache directory; defaults to MATH_PHYS_DICTIONARY_CACHE or repository .dictionary-cache/wikipedia')
 main(parser.parse_args().workdir)
