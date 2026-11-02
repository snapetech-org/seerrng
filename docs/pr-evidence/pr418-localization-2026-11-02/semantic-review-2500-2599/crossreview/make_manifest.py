from pathlib import Path
import hashlib
root=Path(__file__).parent
exclude={'SHA256SUMS','SHA256SUMS.sha256'}
rows=[]
for path in sorted(p for p in root.rglob('*') if p.is_file() and p.name not in exclude):
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    rows.append(f'{digest}  {path.relative_to(root).as_posix()}\n')
manifest=''.join(rows).encode('utf-8')
(root/'SHA256SUMS').write_bytes(manifest)
(root/'SHA256SUMS.sha256').write_text(f'{hashlib.sha256(manifest).hexdigest()}  SHA256SUMS\n')
print(f'files={len(rows)} manifestSha256={hashlib.sha256(manifest).hexdigest()}')
