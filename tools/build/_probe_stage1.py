
import json, subprocess
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/touhou.js').then(m=>process.stdout.write(JSON.stringify(m.BOSS_SONGS.stage1)));")
out=subprocess.run(['node','--input-type=module','-e',expr],capture_output=True)
s=json.loads(out.stdout)
print(s['title'], s['duration'], s['bpm'])
for tr in s['tracks']:
    print(' ', tr['wave'], tr['gain'], len(tr['notes']))
print(' drums', len(s['drums']))
