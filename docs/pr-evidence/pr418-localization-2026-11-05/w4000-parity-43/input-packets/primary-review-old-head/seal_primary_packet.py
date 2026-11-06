#!/usr/bin/env python3
"""Refresh primary packet manifest inventory and SHA-256 checksums."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent
manifest_path=root/'manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['files']=sorted(p.name for p in root.iterdir() if p.is_file() and p.name not in {'manifest.json','SHA256SUMS.txt'})
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
files=sorted(p for p in root.iterdir() if p.is_file() and p.name!='SHA256SUMS.txt')
(root/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in files),encoding='utf-8')
print(f'sealed {len(files)} files')
