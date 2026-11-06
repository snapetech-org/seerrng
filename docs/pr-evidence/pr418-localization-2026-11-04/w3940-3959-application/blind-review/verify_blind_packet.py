#!/usr/bin/env python3
"""Verify the SeerrNG W3940-W3959 candidate-free blind review packet."""
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path

HEAD='a0104b4c84a9c4561020ca72062171b22ffc49f2'
TREE='aaa44c8019c58fde7ae796065e8aae7ac11d7a80'
LOCALES=['es','zh-Hans','hi','de','ja','fr','pt-BR','ar','ko','zh-Hant','vi','id']
PH=re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}')
NUM=re.compile(r'(?<![A-Za-z])\d+(?:[.,]\d+)?%?(?![A-Za-z])')
TAGS=re.compile(r'</?[A-Za-z][^>]*>')

def fail(s): raise SystemExit('FAIL: '+s)
def need(ok,s):
 if not ok: fail(s)
def sha(b): return hashlib.sha256(b).hexdigest()
def sha_text(s): return sha(s.encode('utf-8'))
def readj(p): return json.loads(p.read_text(encoding='utf-8'))
def readjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def check_sums(p):
 entries={}
 for line in (p/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
  digest,name=line.split(None,1); entries[name.lstrip('* ')]=digest
 actual={x.name for x in p.iterdir() if x.is_file() and x.name!='SHA256SUMS.txt'}
 need(set(entries)==actual,'checksum inventory '+str(p))
 for name,digest in entries.items(): need(sha((p/name).read_bytes())==digest,'checksum '+name)

def main():
 ap=argparse.ArgumentParser()
 ap.add_argument('--input-dir',type=Path,default=Path('/home/keith/Documents/code/task-scratch/seerrng-pr418-w3940-3959-primary-20261104/candidate-free-input'))
 ap.add_argument('--source-worktree',type=Path,default=Path('/mnt/disks/scratch/task-worktrees/localization-20261104/seerrng-pr418-w3940-3959-source'))
 args=ap.parse_args(); inp=args.input_dir.resolve(); repo=args.source_worktree.resolve(); here=Path(__file__).resolve().parent; root=here.parent
 need(inp.is_dir() and repo.is_dir(),'input/worktree missing')
 check_sums(inp); check_sums(here)
 verify=subprocess.run(['python3',str(inp/'verify-candidate-free.py'),'--source-worktree',str(repo)],capture_output=True,text=True)
 need(verify.returncode==0,'candidate-free verifier: '+verify.stdout+verify.stderr)
 need(subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()==HEAD,'source head')
 need(subprocess.check_output(['git','-C',str(repo),'show','-s','--format=%T',HEAD],text=True).strip()==TREE,'source tree')
 need(not subprocess.check_output(['git','-C',str(repo),'status','--porcelain'],text=True).strip(),'source worktree dirty')
 manifest=readj(inp/'manifest.json'); window=readj(inp/'window.json'); packet=readj(here/'review_packet.json')
 need(manifest['candidateFreeInputOnly'] is True and manifest['proposalCount']==0,'not candidate-free')
 need((manifest['head'],manifest['tree'])==(HEAD,TREE),'input pin')
 need(window['range']==[3940,3959] and packet['range']==[3940,3959] and packet['window']=='W3940-W3959','window')
 need(packet['repository']=='snapetech-org/seerrng' and packet['pullRequest']==418,'PR identity')
 need(packet['candidateFreeInputOnly'] is True and packet['primaryOutputAccessed'] is False,'blind boundary')
 need(packet['inputSha256ManifestSha256']==sha((inp/'SHA256SUMS.txt').read_bytes()),'input checksum link')
 for key,name in [('inputManifestSha256','manifest.json'),('selectedSourceCellsSha256','selected-source-cells.jsonl'),('currentTargetCellsSha256','current-target-cells.jsonl'),('callerContextsSha256','caller-contexts.jsonl'),('callerContextBlocksSha256','caller-context-blocks.jsonl')]:
  need(packet[key]==sha((inp/name).read_bytes()),'input linkage '+key)
 sources_in=readjl(inp/'selected-source-cells.jsonl'); callers_in=readjl(inp/'caller-contexts.jsonl'); blocks_in=readjl(inp/'caller-context-blocks.jsonl'); cells_in=readjl(inp/'current-target-cells.jsonl')
 sources=readjl(here/'review-sources.jsonl'); cells=readjl(here/'review-cells.jsonl')
 prior_in=readjl(inp/'prior-hold-hash-reattestation.jsonl'); prior=readjl(here/'prior-holds-preserved.jsonl'); holds=readjl(here/'current-holds-hash-only.jsonl')
 need(len(sources_in)==20 and [x['position'] for x in sources_in]==list(range(3940,3960)),'source coverage input')
 need(len(sources)==20 and [x['position'] for x in sources]==list(range(3940,3960)),'source coverage output')
 srcmap={x['position']:x for x in sources_in}; callmap={x['position']:x for x in callers_in}; blockmap={x['contextId']:x for x in blocks_in}
 for row in sources:
  pos=row['position']; src=srcmap[pos]; caller=callmap[pos]
  expected=[blockmap[k] for k in caller['contextBlockIds']]
  for key in ['sourceId','sourceIdSha256','sourceText','sourceTextSha256']:
   need(row[key]==src[key],f'source binding {pos}/{key}')
  need(row['callerContextSha256']==caller['callerContextSha256'] and row['callerContext']==caller,'caller binding '+str(pos))
  need(row['contextBlocks']==expected,'context binding '+str(pos))
 need(len(cells_in)==240 and len(cells)==240,'cell count')
 expected_order=[(pos,locale) for pos in range(3940,3960) for locale in LOCALES]
 need([(x['position'],x['locale']) for x in cells]==expected_order,'cell order/coverage')
 inmap={(x['position'],x['locale']):x for x in cells_in}
 counts=collections.Counter(); held=[]
 for row in cells:
  ident=(row['position'],row['locale']); src=inmap[ident]
  for key in ['sourceId','sourceIdSha256','sourceTextSha256','sourceTokens','currentTarget','currentTargetSha256','callerContextSha256','tokenChecks']:
   need(row[key]==src[key],f'cell binding {ident}/{key}')
  need(row['sourceText']==srcmap[row['position']]['sourceText'],'source text '+str(ident))
  need(sha_text(row['currentTarget'])==row['currentTargetSha256'],'target hash '+str(ident))
  need(row['decision'] in {'keep','propose','hold'} and row['rationale'].strip(),'decision/rationale '+str(ident))
  need(row['confidence'] in {'high','moderate','low','unknown'},'confidence '+str(ident))
  if row['decision']=='propose':
   proposal=row['proposal']; source=row['sourceText']; toks=row['sourceTokens']
   need(isinstance(proposal,str) and proposal and proposal!=row['currentTarget'],'proposal '+str(ident))
   checks=row['proposalTokenChecks']
   need(PH.findall(proposal)==PH.findall(source) and checks['placeholdersMatch'],'placeholder parity '+str(ident))
   need(NUM.findall(proposal)==NUM.findall(source) and checks['numericTokensMatch'],'numeric parity '+str(ident))
   need(TAGS.findall(proposal)==TAGS.findall(source) and checks['markupTagsMatch'],'markup parity '+str(ident))
   need(all(x in proposal for x in toks['protectedLiterals']) and checks['protectedLiteralsPreserved'],'protected literal '+str(ident))
  else:
   need(row['proposal'] is None and 'proposalTokenChecks' not in row,'unexpected proposal '+str(ident))
  if ident in {(3940,'ja'),(3955,'ja')}:
   need(row['decision']=='keep' and row.get('numericTokenAssessment',{}).get('meaningPreserved') is True,'Japanese numeric equivalent '+str(ident))
  elif 'numericTokenAssessment' in row: fail('unexpected numeric assessment '+str(ident))
  mismatches={k for k,v in row['tokenChecks'].items() if not v['matches']}
  if mismatches:
   need(ident in {(3940,'ja'),(3955,'ja')} and mismatches=={'numericTokens'} and row['decision']=='keep','baseline token mismatch '+str(ident))
  if row['decision']=='hold': held.append({'position':row['position'],'locale':row['locale']})
  counts[row['decision']]+=1
 need(dict(counts)=={'keep':179,'propose':37,'hold':24},'decision counts '+str(counts))
 expected_held=[{'position':pos,'locale':loc} for pos in (3943,3957) for loc in LOCALES]
 need(held==expected_held,'held cell set')
 need(len(holds)==24 and all(h['targetTextIncluded'] is False and 'currentTarget' not in h for h in holds),'hold ledger text leakage')
 for h in holds: need(h['currentTargetSha256']==inmap[(h['position'],h['locale'])]['currentTargetSha256'],'hold hash '+str(h['position']))
 need(len(prior)==26 and prior==prior_in,'prior hold continuity')
 need(all(x.get('priorHoldPreserved') is True and x.get('targetTextIncluded') is False for x in prior),'prior hash-only holds')
 live=packet['liveAttestation']; before=readj(root/'live-attestation-before-review.json'); after=readj(root/'live-attestation-after-review.json')
 for att in (before,after):
  need(att['pullRequest']==418 and att['state']=='open' and att['draft'] is True,'live PR state')
  need(att['apiHead']==att['branchRefHead']==att['pullRefHead']==HEAD and att['apiHeadTree']==TREE,'live head refs')
  need(att['apiBase']==manifest['baseSha'],'live base')
 need(live['headSha']==live['branchRefSha']==live['pullRefSha']==HEAD and live['headTree']==TREE,'packet head refs')
 need(live['baseDriftSinceInputAttestation'] is False,'base drift during review')
 need(live['attestationBeforeReviewSha256']==sha((root/'live-attestation-before-review.json').read_bytes()),'before attestation hash')
 need(live['attestationAfterReviewSha256']==sha((root/'live-attestation-after-review.json').read_bytes()),'after attestation hash')
 print(json.dumps({'result':'PASS','head':HEAD,'tree':TREE,'window':[3940,3959],'cells':len(cells),'decisionCounts':dict(counts),'currentHashOnlyHolds':len(holds),'priorHoldsPreserved':len(prior),'nativeSpeakerValidation':False},indent=2))
if __name__=='__main__': main()
