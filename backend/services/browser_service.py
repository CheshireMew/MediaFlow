from playwright.async_api import async_playwright, Browser, BrowserContext
from loguru import logger
from typing import Optional
from backend.services.utils.user_agents import build_chromium_identity

class BrowserService:
    def __init__(self):
        self._browser: Optional[Browser] = None
        self._playwright = None

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

        identity = build_chromium_identity(self._browser.version, user_agent)
        context = await self._browser.new_context(**identity.context_options())
        
        # 3. Inject Stealth Scripts (Mask WebDriver)
        await context.add_init_script("""
            // Mask WebDriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            
        """)
        await context.set_extra_http_headers(identity.extra_http_headers())
            
        return context
