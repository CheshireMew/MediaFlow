import time
import os
from backend.services.cookie_manager import CookieManager

def test_save_cookies_netscape_format(tmp_path):
    cm = CookieManager(cookie_dir=tmp_path)
    domain = "example.com"
    cookies = [
        {"domain": ".example.com", "path": "/", "secure": True, "expirationDate": time.time() + 3600, "name": "c1", "value": "v1"},
        {"domain": "example.com", "path": "/sub", "secure": False, "expirationDate": time.time() + 3600, "name": "c2", "value": "v2"}
    ]
    
    path = cm.save_cookies(domain, cookies)
    
    assert path.exists()
    content = path.read_text(encoding="utf-8")
    
    # Check Header
    assert "# Netscape HTTP Cookie File" in content
    
    # Check c1
    assert ".example.com" in content
    assert "TRUE" in content # secure
    assert "c1" in content
    assert "v1" in content
    
    # Check c2
    assert "c2" in content
    assert "v2" in content

def test_has_valid_cookies_age(tmp_path):
    cm = CookieManager(cookie_dir=tmp_path)
    domain = "old.com"
    
    # Create an old cookie file
    p = cm.get_cookie_path(domain)
    p.write_text("dummy")
    
    # Modify mtime to be 25 hours ago
    old_time = time.time() - (25 * 3600)
    os_utime = getattr(os, "utime", None)
    if os_utime:
        os.utime(str(p), (old_time, old_time))
        
    assert cm.has_valid_cookies(domain) == False

def test_has_valid_cookies_fresh(tmp_path):
    cm = CookieManager(cookie_dir=tmp_path)
    domain = "fresh.com"
    
    p = cm.get_cookie_path(domain)
    p.write_text("dummy")
    
    assert cm.has_valid_cookies(domain) == True
