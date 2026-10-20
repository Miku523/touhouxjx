
import json, subprocess, collections
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/touhou.js').then(m=>process.stdout.write(JSON.stringify(m.BOSS_SONGS)));")
out=subprocess.run(['node','--input-type=module','-e',expr],capture_output=True)
B=json.loads(out.stdout)
for k in ['stage1','stage2','stage5']:
    s=B[k]; d=s['drums']; c=collections.Counter(x[1] for x in d)
    print(k, 'dur %.1f'%s['duration'], 'drums %d (%.1f/s)'%(len(d), len(d)/s['duration']),
          'kinds', dict(sorted(c.items())), 'per-sec', {kk: round(vv/s['duration'],1) for kk,vv in sorted(c.items())})
