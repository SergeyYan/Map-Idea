import json
import os
import queue
import shutil
import subprocess
import threading
from pathlib import Path


class CodexClient:
    """JSON-lines app-server transport. No shell commands or token handling."""
    @staticmethod
    def executable():
        override = os.environ.get('INKMAP_CODEX_EXE')
        if override:
            path = Path(override).expanduser()
            if not path.is_file():
                raise RuntimeError('INKMAP_CODEX_EXE указывает на отсутствующий файл: ' + str(path))
            return str(path.resolve())
        executable = shutil.which('codex')
        if executable:
            return executable
        if os.name == 'nt' and os.environ.get('LOCALAPPDATA'):
            directory = Path(os.environ['LOCALAPPDATA']) / 'OpenAI' / 'Codex' / 'bin'
            candidates = [p for p in directory.glob('*/codex.exe') if p.is_file()]
            if candidates:
                return str(max(candidates, key=lambda p: p.stat().st_mtime))
        raise RuntimeError('Codex не найден. Установите Codex CLI или задайте INKMAP_CODEX_EXE — полный путь к codex.exe. Затем перезапустите сервер InkMap.')

    def __init__(self):
        executable = self.executable()
        self.process = subprocess.Popen([executable, 'app-server', '--stdio'], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        text=True, encoding='utf-8', errors='replace',
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        self.lock = threading.Lock()
        self.pending = {}
        self.events = queue.Queue()
        self.counter = 0
        threading.Thread(target=self._read, daemon=True).start()
        self.call('initialize', {'clientInfo': {'name':'inkmap','title':'InkMap','version':'1.0'}})
        self.send({'method':'initialized'})

    def send(self, message):
        with self.lock:
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + '\n')
            self.process.stdin.flush()

    def call(self, method, params, timeout=30):
        with self.lock:
            self.counter += 1
            request_id = self.counter
            response = queue.Queue()
            self.pending[request_id] = response
        try:
            self.send({'id':request_id,'method':method,'params':params})
            message = response.get(timeout=timeout)
            if 'error' in message:
                raise RuntimeError(message['error'].get('message','Ошибка Codex'))
            return message['result']
        finally:
            with self.lock:
                self.pending.pop(request_id, None)

    def _read(self):
        try:
            for line in self.process.stdout:
                message = json.loads(line)
                if 'id' in message and 'method' not in message:
                    with self.lock:
                        response = self.pending.get(message['id'])
                    if response:
                        response.put(message)
                elif 'id' in message:
                    # Never silently grant execution or tool approvals.
                    self.send({'id':message['id'],'error':{'code':-32603,'message':'InkMap поддерживает анализ без интерактивных разрешений. Продолжите в Codex.'}})
                else:
                    self.events.put(message)
        finally:
            with self.lock:
                for response in self.pending.values():
                    response.put({'error':{'message':'Соединение с Codex закрыто'}})

    def close(self):
        self.process.terminate()
