
import json, subprocess
expr=("import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/preboss.js').then(m=>process.stdout.write(JSON.stringify(m.PREBOSS_SONGS.pre1)));")
s=json.loads(subprocess.run(['node','--input-type=module','-e',expr],capture_output=True).stdout)
lead=s['tracks'][0]['notes']
ts=[n[0] for n in lead]
print('lead %d notes  first %.3f last %.3f' % (len(ts), ts[0], ts[-1]+lead[-1][2]))
gaps=[(ts[i], round(ts[i+1]-ts[i],2)) for i in range(len(ts)-1) if ts[i+1]-ts[i]>0.6]
print('gaps >0.6s:', gaps)
print('first 8:', [round(t,2) for t in ts[:8]])
