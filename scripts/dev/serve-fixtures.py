"""Serve local fixtures, including explicit CORS and denied-CORS image cases."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class FixtureHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.allow_cors = False
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[2] / "fixtures"), **kwargs)

    def do_GET(self):
        self.allow_cors = self.path.startswith("/cors/")
        if self.allow_cors:
            self.path = self.path[len("/cors"):]
        super().do_GET()

    def end_headers(self):
        if self.allow_cors:
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Fixtures: http://127.0.0.1:{args.port}/contrast-controls.html", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), FixtureHandler).serve_forever()
