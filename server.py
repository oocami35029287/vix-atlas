"""Dependency-free local preview of the code-only Pages artifact."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'public'),**kwargs)
    def list_directory(self,path):
        self.send_error(403)
        return None
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    print(f'VIX Atlas: http://127.0.0.1:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
