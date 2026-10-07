import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from project_map import generate, write_manifest, install_hooks, git, check_push, check_manifest, MANIFEST
from codex_api import validate_proposal


class ProjectMapTests(unittest.TestCase):
    def test_sources_manifest_and_exclusions(self):
        with tempfile.TemporaryDirectory(prefix='inkmap-files-') as temporary:
            root=Path(temporary).resolve();(root/'main.py').write_text('class Game: pass\ndef play(): pass',encoding='utf-8')
            (root/'web').mkdir();(root/'web/app.js').write_text('export function render() {}',encoding='utf-8')
            (root/'data').mkdir();(root/'data/secret.py').write_text('secret',encoding='utf-8')
            first=generate(root);validate_proposal(first);write_manifest(root,first)
            second=generate(root)
            self.assertEqual(first['source']['fingerprint'],second['source']['fingerprint'])
            self.assertEqual(len(second['source']['files']),2)
            self.assertIn('Game',next(n['note'] for n in second['nodes'] if n['key']=='file:main.py'))
            self.assertEqual(json.loads((root/MANIFEST).read_text('utf-8'))['schemaVersion'],1)
            first['annotations']={'file:main.py':{'note':'Смысловая заметка Codex'}};write_manifest(root,first)
            enriched=generate(root)
            self.assertEqual(next(n['note'] for n in enriched['nodes'] if n['key']=='file:main.py'),'Смысловая заметка Codex')
            self.assertNotEqual(enriched['source']['fingerprint'],second['source']['fingerprint'])

    def test_index_and_hook_without_commit_or_push(self):
        with tempfile.TemporaryDirectory(prefix='inkmap-git-') as temporary:
            root=Path(temporary).resolve();git(root,'init')
            (root/'main.py').write_text('class Staged: pass',encoding='utf-8');git(root,'add','main.py')
            (root/'main.py').write_text('class Unstaged: pass',encoding='utf-8')
            indexed=generate(root,'index');working=generate(root)
            self.assertNotEqual(indexed['source']['fingerprint'],working['source']['fingerprint'])
            self.assertIn('Staged',next(n['note'] for n in indexed['nodes'] if n['key']=='file:main.py'))
            install_hooks(root)
            self.assertEqual(git(root,'config','--get','core.hooksPath').decode().strip(),'.inkmap/hooks')
            shell=shutil.which('sh')
            if not shell:
                candidate=Path(shutil.which('git')).parent.parent/'bin/sh.exe'
                if candidate.exists():shell=str(candidate)
            self.assertIsNotNone(shell,'Нужен shell Git для проверки настоящего hook')
            subprocess.run([shell,'.inkmap/hooks/pre-commit'],cwd=root,env={**os.environ,'INKMAP_PYTHON':sys.executable},check=True,capture_output=True)
            snapshot=json.loads(git(root,'show',':./'+MANIFEST))
            self.assertEqual(snapshot['source']['fingerprint'],indexed['source']['fingerprint'])
            self.assertIn('--check-push',(root/'.inkmap/hooks/pre-push').read_text('utf-8'))
            self.assertFalse((root/'.git/refs/heads/master').exists())

    def test_preserve_existing_hook(self):
        with tempfile.TemporaryDirectory(prefix='inkmap-hook-') as temporary:
            root=Path(temporary).resolve();git(root,'init');hook=root/'.git/hooks/pre-commit';hook.write_text('custom-hook',encoding='utf-8')
            with self.assertRaises(ValueError):install_hooks(root)
            self.assertEqual(hook.read_text('utf-8'),'custom-hook')

    def test_push_checks_outgoing_refs_not_head(self):
        first='1'*40;second='2'*40
        with patch('project_map.git',side_effect=lambda root,*args:(args[-1].split('^')[0]+'\n').encode()),patch('project_map.check_manifest') as check:
            check_push(Path('.'),[f'refs/heads/a {first} refs/heads/a {"0"*40}',f'refs/heads/b {second} refs/heads/b {"0"*40}',f'(delete) {"0"*40} refs/heads/old {first}'])
            self.assertEqual([call.args[2] for call in check.call_args_list],[first,second])
        with patch('project_map.generate',return_value={'source':{'fingerprint':'new'}}),patch('project_map.git',return_value=b'{"source":{"fingerprint":"old"}}'):
            with self.assertRaises(ValueError):check_manifest(Path('.'),'head',first)


if __name__=='__main__':unittest.main()
