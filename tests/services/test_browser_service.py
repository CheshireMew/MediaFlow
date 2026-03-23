import pytest
import asyncio
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from backend.core.container import container, Services
from backend.core.runtime_access import RuntimeServices
from backend.services.browser_service import BrowserService
from backend.services.sniffer import NetworkSniffer

# --- Local Server Setup ---
HTML_CONTENT = b"""
<html>
<head><title>E2E Test Page</title></head>
<body>
    <h1>Hello World</h1>
    <video src="/test_video_with_very_long_name_to_pass_sniff_filter_logic_which_requires_50_chars.mp4" autoplay loop muted></video>
    <script>
        console.log("Page Loaded");
    </script>
</body>
</html>
"""

class MockRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(HTML_CONTENT)
        elif self.path == "/test_video_with_very_long_name_to_pass_sniff_filter_logic_which_requires_50_chars.mp4":
            self.send_response(200)
            self.send_header("Content-type", "video/mp4")
            self.end_headers()
            self.wfile.write(b"fake video content")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass # Silence logs

@pytest.fixture(scope="module")
def local_server():
    # Start server in thread
    server = HTTPServer(("127.0.0.1", 0), MockRequestHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    
    base_url = f"http://127.0.0.1:{port}"
    yield base_url
    
async def _ensure_clean_browser():
    browser_service = RuntimeServices.browser()
    try:
        if browser_service._browser or browser_service._playwright:
            await browser_service.stop()
    except:
        pass

# --- Tests ---

@pytest.mark.asyncio
async def test_browser_sniffing(local_server):
    container.clear()
    container.register(Services.BROWSER, BrowserService)
    container.register(Services.SNIFFER, lambda: NetworkSniffer(RuntimeServices.browser()))
    browser_service = RuntimeServices.browser()
    sniffer = RuntimeServices.sniffer()
    await _ensure_clean_browser()
    try:
        # Test Sniffing Logic
        try:
            await browser_service.start()
        except PermissionError as e:
            pytest.skip(f"Playwright subprocess not permitted in this environment: {e}")
        
        # We need a longer timeout for sniffing usually, but local is fast
        result = await sniffer.sniff(url=local_server, timeout=10)
        
        assert result is not None, "Sniffer returned None"
        assert "test_video_with_very_long_name" in result["url"]
        assert result["title"] == "E2E Test Page"
    finally:
        await browser_service.stop()
        container.clear()
