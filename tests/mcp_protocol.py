import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import Request, urlopen

root=Path(__file__).resolve().parents[1]
process=subprocess.Popen([sys.executable,str(root/'inkmap_mcp.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                         text=True,encoding='utf-8',env={**os.environ,'INKMAP_URL':'http://127.0.0.1:8001'})
def call(i,method,params):
    process.stdin.write(json.dumps({'jsonrpc':'2.0','id':i,'method':method,'params':params})+'\n');process.stdin.flush()
    response=json.loads(process.stdout.readline());assert response['id']==i
    assert 'error' not in response,response
    return response['result']
try:
    result=call(1,'initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'test','version':'1'}})
    assert result['protocolVersion']=='2025-03-26'
    assert [t['name'] for t in call(2,'tools/list',{})['tools']]==['read_board','propose_map']
    board=call(3,'tools/call',{'name':'read_board','arguments':{}})
    assert not board.get('isError'),board
    document=json.loads(board['content'][0]['text'])['document']
    assert all('data' not in media for node in document['nodes'] for media in node['media'])
    proposal=call(4,'tools/call',{'name':'propose_map','arguments':{'summary':'Тест MCP без изменения карты','nodes':[],'edges':[]}})
    assert not proposal.get('isError'),proposal
    job=json.loads(proposal['content'][0]['text'])['id']
    with urlopen(Request('http://127.0.0.1:8001/api/codex/jobs/'+job,method='DELETE')) as response:assert response.status==200
    print('MCP runtime OK: initialize, tools/list, local read without binary media, proposal staging/cleanup; board unchanged, no model request')
finally:
    process.terminate();process.wait(timeout=10)
