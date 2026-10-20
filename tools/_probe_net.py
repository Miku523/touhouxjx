
import json, urllib.request, os
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'probe'})
    return urllib.request.urlopen(req, timeout=20).read()
# check proxy env
print('proxy env:', {k:v for k,v in os.environ.items() if 'proxy' in k.lower()})
try:
    data = json.loads(get('https://api.github.com/search/repositories?q=touhou-midi-collection&per_page=5'))
    for it in data.get('items', []):
        print(it['full_name'], it['default_branch'], it['size'], it['html_url'])
except Exception as e:
    print('ERR', type(e).__name__, e)
