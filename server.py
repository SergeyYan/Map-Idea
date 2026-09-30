import json
import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
LOCK = threading.Lock()
app = FastAPI(title='InkMap')


class SaveRequest(BaseModel):
    revision: int
    document: dict


@app.get('/api/map')
def load():
    with LOCK:
        path = DATA / 'map.json'
        return json.loads(path.read_text('utf-8')) if path.exists() else {'revision': 0, 'document': None}


@app.put('/api/map')
def save(request: SaveRequest):
    with LOCK:
        path = DATA / 'map.json'
        current = json.loads(path.read_text('utf-8')) if path.exists() else {'revision': 0}
        if request.revision != current['revision']:
            raise HTTPException(409, 'Карта изменена в другой вкладке. Экспортируйте локальную копию и перезагрузите страницу.')
        if not isinstance(request.document.get('nodes'), list) or not isinstance(request.document.get('edges'), list):
            raise HTTPException(422, 'Некорректная структура карты')
        result = {'revision': request.revision + 1, 'document': request.document}
        fd, name = tempfile.mkstemp(dir=DATA, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                json.dump(result, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, path)
        finally:
            if os.path.exists(name):
                os.unlink(name)
        return {'revision': result['revision']}


@app.get('/')
def index():
    return FileResponse(ROOT / 'web' / 'index.html')


app.mount('/static', StaticFiles(directory=ROOT / 'web'), name='static')
