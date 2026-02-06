from playwright.async_api import async_playwright, Browser, Page
import asyncio
import os
import random
import json
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from loguru import logger
from typing import Optional, List, Dict
import urllib.parse
from src.services.utils.user_agents import get_random_user_agent

class BrowserService:
    _instance = None
    _browser: Optional[Browser] = None
    _playwright = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BrowserService, cls).__new__(cls)
        return cls._instance

    async def start(self):
        """Start the browser with stealth settings."""
        if self._browser is None:
            logger.info("[BrowserService] Starting Playwright with Stealth Mode...")
            self._playwright = await async_playwright().start()
            
            # Stealth Args
            args = [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certificate-errors',
                '--disable-renderer-backgrounding',
            ]
            
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=args
            )
            logger.info("[BrowserService] Stealth Browser started.")

    async def stop(self):
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
        logger.info("[BrowserService] Browser stopped.")

    async def get_stealth_context(self, user_agent: str = None) -> BrowserContext:
        """
        Public method to get a stealth context.
        Internal _create_stealth_context logic promoted to public/shared use.
        """
        return await self._create_stealth_context(user_agent)

    async def _create_stealth_context(self, user_agent: str = None) -> BrowserContext:
        """Create a browser context with advanced stealth configurations."""
        if not self._browser:
            await self.start()

        # 1. Randomize Viewport
        viewports = [
            {"width": 1920, "height": 1080},
            {"width": 1366, "height": 768},
            {"width": 1536, "height": 864},
            {"width": 1440, "height": 900},
            {"width": 2560, "height": 1440},
        ]
        viewport = random.choice(viewports)
        
        # 2. Select User Agent
        if not user_agent:
            user_agent = get_random_user_agent()
            
        context = await self._browser.new_context(
            user_agent=user_agent,
            viewport=viewport,
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
            permissions=['geolocation'],
            geolocation={'latitude': 39.9042, 'longitude': 116.4074}, # Beijing
            device_scale_factor=random.choice([1, 1.25, 1.5, 2]),
            has_touch=random.choice([True, False]),
            is_mobile=random.choice([True, False])
        )
        
        # 3. Inject Stealth Scripts (Mask WebDriver)
        await context.add_init_script("""
            // Mask WebDriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            
            // Mask Chrome Code
            window.chrome = { runtime: {} };
            
            // Mock Plugins
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            
            // Canvas Noise
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                const context = this.getContext('2d');
                if (context) {
                    const shift = Math.floor(Math.random() * 10) - 5;
                    // Draw a tiny invisible pixel with random color shift
                    context.fillStyle = 'rgba(' + shift + ',' + shift + ',' + shift + ',0.01)';
                    context.fillRect(0, 0, 2, 2);
                }
                return originalToDataURL.apply(this, arguments);
            };
        """)
        
        # 4. Add Headers
        # If Chrome, add sec-ch-ua headers (simplified)
        if 'Chrome' in user_agent:
            headers = {
                'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
                'sec-ch-ua-mobile': '?1' if 'Mobile' in user_agent else '?0',
                'sec-ch-ua-platform': '"Android"' if 'Android' in user_agent else '"Windows"',
                'Upgrade-Insecure-Requests': '1',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            }
            await context.set_extra_http_headers(headers)
            
        return context

# Singleton instance

