"""A clean program-only checkout builds without Git, data, credentials or network."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
class OfflineBuild(unittest.TestCase):
    def test_no_data_clean_checkout(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)
            for name in ['build.py','page.html','style.css','app.js','engine.js','research_core.js','bb_engine.js','chip_engine.js','research_statistics.js','rev_mom_engine.js','data_client.js']:
                shutil.copy(ROOT/name,target/name)
            env={**os.environ,'HTTP_PROXY':'http://127.0.0.1:1','HTTPS_PROXY':'http://127.0.0.1:1','ALL_PROXY':'http://127.0.0.1:1'}
            subprocess.run(['python','build.py'],cwd=target,env=env,check=True,capture_output=True)
            html=(target/'public/index.html').read_text()
            self.assertIn('RevMomEngine',html)
            self.assertNotIn('const SAMPLE',html)
            self.assertFalse((target/'data').exists())
            self.assertEqual({p.name for p in (target/'public').iterdir()},{'index.html','.nojekyll'})
