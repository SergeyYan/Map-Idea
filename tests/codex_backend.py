import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import codex_api


class IntegrationTests(unittest.TestCase):
    def test_writer_error_does_not_create_another_chat(self):
        calls=[]
        class Fake:
            def call(self,method,params):
                calls.append(method)
                if method=='thread/read':return {'thread':{'cwd':str(Path.cwd()),'status':{'type':'idle'}}}
                raise RuntimeError('already has an active writer')
        codex_api.jobs['test']={'state':'running'}
        with patch.object(codex_api,'connection',return_value=Fake()):
            codex_api.run('test',Path.cwd(),{'threadId':'chat','prompt':'Идея'},'{}')
        self.assertIn('открыт другим процессом',codex_api.jobs.pop('test')['error'])
        self.assertEqual(calls,['thread/read','thread/resume'])
    def test_bad_proposals(self):
        with self.assertRaises(ValueError):
            codex_api.validate_proposal({'summary':'bad','nodes':[],'edges':[{'a':'x','b':'y','priority':'normal'}]})

    def test_wrong_project_never_sends_turn(self):
        calls=[]
        class Fake:
            def call(self,method,params):
                calls.append(method)
                return {'thread':{'cwd':str(Path.cwd()/'another-project'),'status':{'type':'idle'}}}
        codex_api.jobs['test']={'state':'running'}
        with patch.object(codex_api,'connection',return_value=Fake()):
            codex_api.run('test',Path.cwd(),{'threadId':'chat','prompt':'План'},'{}')
        self.assertEqual(codex_api.jobs.pop('test')['state'],'error')
        self.assertEqual(calls,['thread/read'])

    def test_context_excludes_binary_media(self):
        data=codex_api.context({'nodes':[{'id':'a','note':'text','media':[{'data':'SECRET','source':'C:/clip.mp4','kind':'video'}]}],'edges':[]})
        self.assertNotIn('SECRET',json.dumps(data))
        self.assertEqual(data['nodes'][0]['media'][0]['source'],'C:/clip.mp4')

    def test_real_turn_protocol_with_fake_transport(self):
        import queue
        calls=[]
        class Fake:
            events=queue.Queue()
            def call(self,method,params):
                calls.append((method,params))
                if method=='thread/read':return {'thread':{'cwd':str(Path.cwd()),'status':{'type':'idle'}}}
                if method=='thread/resume':return {}
                if method=='turn/start':
                    self.events.put({'method':'item/completed','params':{'threadId':'chat','turnId':'turn','item':{'type':'agentMessage','id':'msg','text':json.dumps({'summary':'План','nodes':[],'edges':[]})}}})
                    self.events.put({'method':'turn/completed','params':{'threadId':'chat','turn':{'id':'turn','status':'completed'}}})
                    return {'turn':{'id':'turn'}}
                raise AssertionError(method)
        codex_api.jobs['test']={'state':'running'}
        with patch.object(codex_api,'connection',return_value=Fake()):
            codex_api.run('test',Path.cwd(),{'threadId':'chat','prompt':'План'},'{}')
        self.assertEqual(codex_api.jobs.pop('test')['state'],'done')
        turn=calls[-1][1]
        self.assertEqual(turn['sandboxPolicy']['type'],'readOnly')
        self.assertEqual(turn['sandboxPolicy']['access']['readableRoots'],[str(Path.cwd())])
        self.assertEqual(turn['outputSchema'],codex_api.schema)


if __name__=='__main__':unittest.main()
