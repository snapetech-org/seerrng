from pathlib import Path
import runpy
ns=runpy.run_path(str(Path(__file__).with_name('apply-and-verify.py')))
print(ns['verify']())
