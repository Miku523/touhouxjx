
import json, subprocess
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/touhou.js').then(m=>{const o=m.SONGS||m.default||m.TOUHOU_SONGS; process.stdout.write(JSON.stringify(Object.keys(o)));});")
out=subprocess.run(['node','--input-type=module','-e',expr],capture_output=True)
print('ERR', out.stderr.decode()[:300])
print('KEYS', out.stdout.decode()[:500])
