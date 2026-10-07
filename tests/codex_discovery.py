import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from CodexClient import CodexClient


class CodexDiscoveryTests(unittest.TestCase):
    def test_path(self):
        with patch.dict(os.environ, {}, clear=True), patch('shutil.which', return_value='codex.exe'):
            self.assertEqual(CodexClient.executable(), 'codex.exe')

    def test_explicit_path_and_missing_override(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'codex.exe'
            executable.touch()
            with patch.dict(os.environ, {'INKMAP_CODEX_EXE': str(executable)}, clear=True):
                self.assertEqual(CodexClient.executable(), str(executable.resolve()))
                executable.unlink()
                with self.assertRaisesRegex(RuntimeError, 'INKMAP_CODEX_EXE'):
                    CodexClient.executable()

    @unittest.skipUnless(os.name == 'nt', 'Windows desktop layout')
    def test_desktop_without_path_selects_latest(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder) / 'OpenAI' / 'Codex' / 'bin'
            for name, timestamp in [('old', 100), ('new', 200)]:
                executable = directory / name / 'codex.exe'
                executable.parent.mkdir(parents=True)
                executable.touch()
                os.utime(executable, (timestamp, timestamp))
            with patch.dict(os.environ, {'LOCALAPPDATA': folder}, clear=True), patch('shutil.which', return_value=None):
                self.assertEqual(CodexClient.executable(), str(directory / 'new' / 'codex.exe'))

    def test_missing(self):
        with patch.dict(os.environ, {}, clear=True), patch('shutil.which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'Codex не найден'):
                CodexClient.executable()


if __name__ == '__main__':
    unittest.main()
