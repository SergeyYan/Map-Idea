"""Portable, standard-library project -> InkMap manifest and optional Git hooks."""
import argparse
import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

MANIFEST = '.inkmap/project.json'
EXCLUDED = {'.git','.inkmap','.venv','venv','node_modules','data','__pycache__','dist','build','.next','.codex','.agents'}
EXTENSIONS = {'.py','.js','.ts','.jsx','.tsx','.html','.css','.md','.cs','.cpp','.h','.rs','.go','.gd','.lua','.sh','.ps1','.bat','.json','.yaml','.yml','.toml','.xml','.tscn','.tres','.unity','.prefab'}


def git(root, *args):
    result = subprocess.run(['git','-C',str(root),*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError('Git: '+result.stderr.decode('utf-8',errors='replace').strip())
    return result.stdout


def eligible(path):
    p = Path(path)
    return (not set(p.parts).intersection(EXCLUDED) and not path.startswith('tests/artifacts/') and
            (p.suffix.lower() in EXTENSIONS or p.name in ('requirements.txt','go.mod','.gitignore','Dockerfile','CMakeLists.txt')))


def source_files(root, mode, revision='HEAD'):
    try:
        git(root,'rev-parse','--show-toplevel')
        arguments = ('ls-tree','-r','--name-only','-z',revision) if mode=='head' else ('ls-files','-z')
        if mode=='working':arguments += ('--cached','--others','--exclude-standard')
        paths = git(root,*arguments).decode('utf-8').split('\0')
    except (ValueError, FileNotFoundError):
        if mode!='working':raise ValueError('Для режима index/head нужен Git-репозиторий')
        paths=[]
        for directory, folders, files in os.walk(root):
            folders[:]=[f for f in folders if f not in EXCLUDED and not (Path(directory)/f).is_symlink()]
            paths.extend((Path(directory)/f).relative_to(root).as_posix() for f in files)
    sources={}
    for path in sorted(set(paths)):
        if not path or not eligible(path):continue
        absolute = (root/path).resolve()
        if not absolute.is_relative_to(root):continue
        if mode=='working':
            if not absolute.is_file():continue
            content=absolute.read_bytes()
        else:
            prefix=':' if mode=='index' else revision+':'
            content=git(root,'show',prefix+'./'+path)
        sources[path]=content
    return sources


def describe(path, content):
    text=content[:1024*1024].decode('utf-8',errors='replace')
    rows=['Существующий файл: '+path]
    if path.endswith('.py'):
        try:
            tree=ast.parse(text)
            classes=[n.name for n in tree.body if isinstance(n,ast.ClassDef)]
            functions=[n.name for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]
            if classes:rows.append('Классы: '+', '.join(classes[:15]))
            if functions:rows.append('Функции: '+', '.join(functions[:20]))
        except SyntaxError:rows.append('Структура Python не разобрана.')
    elif Path(path).suffix in ('.js','.ts','.jsx','.tsx'):
        names=re.findall(r'\b(?:function|class)\s+([\w$]+)',text)
        imports=re.findall(r'\bfrom\s+[\'"]([^\'"]+)',text)
        if names:rows.append('Определения: '+', '.join(dict.fromkeys(names))[:500])
        if imports:rows.append('Импорты: '+', '.join(dict.fromkeys(imports))[:500])
    elif Path(path).name.lower()=='readme.md':
        paragraphs=[line.strip() for line in text.splitlines() if line.strip() and not line.startswith(('#','```'))]
        if paragraphs:rows.append(paragraphs[0][:500])
    todos=re.findall(r'[^\n]*(?:TODO|FIXME)[^\n]*',text)
    if todos:rows.append('Открытые пометки:\n'+'\n'.join(todos[:4])[:700])
    return '\n'.join(rows)


def generate(root, mode='working', name=None, revision='HEAD'):
    if not (root/MANIFEST).resolve().is_relative_to(root):raise ValueError('Файл карты должен находиться внутри проекта')
    sources=source_files(root,mode,revision)
    try:
        previous=(root/MANIFEST).read_bytes() if mode=='working' else git(root,'show',(':' if mode=='index' else revision+':')+'./'+MANIFEST)
    except (FileNotFoundError,ValueError):previous=b'{}'
    previous_data=json.loads(previous)
    annotations=previous_data.get('annotations',{})
    project_name=name or previous_data.get('project',{}).get('name') or root.name
    if not isinstance(project_name,str):raise ValueError('Некорректное название проекта')
    if not isinstance(annotations,dict):raise ValueError('annotations должна быть объектом')
    hashes={path:hashlib.sha256(content).hexdigest() for path,content in sources.items()}
    fingerprint=hashlib.sha256(json.dumps({'files':hashes,'annotations':annotations},sort_keys=True).encode()).hexdigest()
    def idea(key,title,note):
        return {'key':key,'title':title[:200],'note':note[:10000],'status':'idea','stage':'Архитектура','tags':''}
    nodes=[idea('project',project_name, f'Карта структуры проекта. Файлов: {len(sources)}.\nСтатический анализ без запуска кода и тестов.')]
    edges=[]
    groups={}
    for path in sources:
        group=path.split('/')[0] if '/' in path else 'Корень'
        groups.setdefault(group,[]).append(path)
    displayed=list(groups)[:10]
    for group in displayed:
        key='group:'+group
        nodes.append(idea(key,group,'Файлы:\n'+'\n'.join(groups[group])[:8000]))
        edges.append({'a':'project','b':key,'priority':'important'})
    # Keep a valid small board; the manifest hashes still cover all source files.
    for path, content in sources.items():
        if len(nodes)>=40:break
        group=path.split('/')[0] if '/' in path else 'Корень'
        if group not in displayed:continue
        key='file:'+path
        nodes.append(idea(key,Path(path).name,describe(path,content)))
        edges.append({'a':'group:'+group,'b':key,'priority':'normal'})
    for node in nodes:
        annotation=annotations.get(node['key'],{})
        if not isinstance(annotation,dict):raise ValueError('Некорректная аннотация '+node['key'])
        for field,limit in [('title',200),('note',10000),('stage',200),('tags',300)]:
            if field in annotation:
                if not isinstance(annotation[field],str) or len(annotation[field])>limit:raise ValueError('Некорректное поле аннотации '+field)
                node[field]=annotation[field]
        if 'status' in annotation:
            if annotation['status'] not in ('idea','todo','doing','done'):raise ValueError('Некорректный статус аннотации')
            node['status']=annotation['status']
    return {'schemaVersion':1,'project':{'name':project_name},'annotations':annotations,
            'generatedAt':datetime.now(timezone.utc).isoformat(),'source':{'fingerprint':fingerprint,'mode':mode,'files':hashes},
            'summary':f'Структура проекта: {len(sources)} файлов, {len(nodes)} узлов. Описания можно дополнить вручную или через Codex.',
            'nodes':nodes,'edges':edges}


def write_manifest(root, document):
    if not (root/'.inkmap').resolve().is_relative_to(root):raise ValueError('.inkmap должна находиться внутри проекта')
    directory=root/'.inkmap';directory.mkdir(exist_ok=True)
    fd, temporary=tempfile.mkstemp(dir=directory,suffix='.tmp')
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:
            json.dump(document,stream,ensure_ascii=False,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,root/MANIFEST)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)


def install_hooks(root):
    if not (root/'.inkmap').resolve().is_relative_to(root):raise ValueError('.inkmap должна находиться внутри проекта')
    repository=Path(git(root,'rev-parse','--show-toplevel').decode().strip()).resolve()
    if repository!=root:raise ValueError('Выберите корневую папку Git-репозитория')
    result=subprocess.run(['git','-C',str(root),'config','--get','core.hooksPath'],capture_output=True,text=True)
    configured=result.stdout.strip()
    if configured and configured!='.inkmap/hooks':raise ValueError('Уже настроен другой core.hooksPath. Хуки не заменены.')
    default=Path(git(root,'rev-parse','--git-path','hooks').decode().strip())
    if not default.is_absolute():default=root/default
    if not configured and any((default/hook).exists() for hook in ('pre-commit','pre-push')):
        raise ValueError('Найдены существующие Git-хуки. Подключите экспортёр к ним вручную.')
    directory=root/'.inkmap';hooks=directory/'hooks';hooks.mkdir(parents=True,exist_ok=True)
    target=directory/'sync_project.py'
    if Path(__file__).resolve()!=target.resolve():shutil.copyfile(__file__,target)
    launcher='''#!/bin/sh
set -eu
if [ -n "${INKMAP_PYTHON:-}" ]; then py="$INKMAP_PYTHON"
elif [ -x .venv/Scripts/python.exe ]; then py=.venv/Scripts/python.exe
elif [ -x .venv/bin/python ]; then py=.venv/bin/python
elif command -v python3 >/dev/null 2>&1; then py=python3
else py=python
fi
'''
    for hook,command in [('pre-commit','--mode index'),('pre-push','--check-push')]:
        path=hooks/hook
        path.write_text(launcher+f'"$py" .inkmap/sync_project.py {command}\n'+('git add -- .inkmap/project.json\n' if hook=='pre-commit' else ''),encoding='utf-8',newline='\n')
        path.chmod(0o755)
    git(root,'config','core.hooksPath','.inkmap/hooks')


def check_manifest(root, mode, revision='HEAD'):
    document=generate(root,mode,revision=revision)
    raw=git(root,'show',(revision+':' if mode=='head' else ':')+'./'+MANIFEST) if mode!='working' else (root/MANIFEST).read_bytes()
    if json.loads(raw).get('source',{}).get('fingerprint')!=document['source']['fingerprint']:
        raise ValueError('Карта InkMap устарела. Обновите её и включите .inkmap/project.json в следующий commit перед push.')


def check_push(root, lines):
    for line in lines:
        parts=line.split()
        if len(parts)!=4:raise ValueError('Некорректные данные pre-push')
        sha=parts[1]
        if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}',sha):raise ValueError('Некорректный SHA pre-push')
        if set(sha)=={'0'}:continue
        # Resolve annotated tags as well. Check each outgoing tip, not just the checked-out HEAD.
        revision=git(root,'rev-parse','--verify',sha+'^{commit}').decode().strip()
        check_manifest(root,'head',revision)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='.')
    parser.add_argument('--mode',choices=['working','index','head'],default='working')
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--install-hooks',action='store_true')
    parser.add_argument('--check-push',action='store_true')
    args=parser.parse_args();root=Path(args.root).resolve()
    try:
        if args.install_hooks:install_hooks(root)
        if args.check_push:check_push(root,sys.stdin)
        elif args.check:check_manifest(root,args.mode)
        else:write_manifest(root,generate(root,args.mode))
        print('InkMap: карта проекта актуальна.')
    except (ValueError,OSError) as error:
        print(str(error),file=sys.stderr);return 1
    return 0


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    raise SystemExit(main())
