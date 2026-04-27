"""
Smart Parking System – Local Development Server
Run: python serve.py
Open: http://localhost:8000
"""
import http.server, socketserver, os

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} → {fmt % args}")

print(f"\n  Grand State University – Smart Parking System")
print(f"  ─────────────────────────────────────────────")
print(f"  Server running at  http://localhost:{PORT}")
print(f"  Open the URL above in your browser.")
print(f"  Press Ctrl+C to stop.\n")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
