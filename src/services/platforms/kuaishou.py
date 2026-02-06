from typing import Optional
from loguru import logger
from src.services.platforms.base import BasePlatform
from src.models.schemas import AnalyzeResult
import re

class KuaishouPlatform(BasePlatform):
    """
    Handler for Kuaishou (Kwai) URLs.
    Uses Playwright to sniff video URLs as Kuaishou relies heavily on dynamic rendering.
    """
    DOMAIN = "kuaishou.com"

    async def match(self, url: str) -> bool:
        return "kuaishou.com" in url or "chenzhongtech.com" in url or "kwai.com" in url or "gifshow.com" in url

    async def analyze(self, url: str) -> AnalyzeResult:
        logger.info(f"[Kuaishou] Step 1: Analyzing URL: {url}")

        # Extract ID first if possible
        video_id = self._extract_id(url)
        if video_id:
            logger.info(f"[Kuaishou] Step 2: Extracted ID: {video_id}")
        else:
            logger.info(f"[Kuaishou] Step 2: Could not extract ID from URL")

        from src.core.container import container, Services
        
        browser_service = container.get(Services.BROWSER)
        sniffer = container.get(Services.SNIFFER)
        import asyncio
        
        logger.info(f"[Kuaishou] Step 3: Prepare Dual-Strategy")
        
        # Script to extract proper title from Kuaishou DOM (Desktop friendly)
        js_script = f"""
        () => {{
            const videoId = "{video_id or ''}";
            let debugInfo = [];
            try {{
                // 1. Try Window State (Structure Probe)
                if (window.__APOLLO_STATE__) {{
                    const state = window.__APOLLO_STATE__;
                    const client = state.defaultClient || state;
                    const keys = Object.keys(client);
                    
                    // Probe: Dump ALL keys to see structure
                    // Using slice(0, 100) just in case there are thousands, but usually there are few.
                    return {{ title: "", debug: `Apollo Keys Dump (${{keys.length}}): ${{keys.join(' || ')}}` }};
                }}
                
                if (window.INIT_STATE && window.INIT_STATE.photo && window.INIT_STATE.photo.caption) {{
                     return {{ title: window.INIT_STATE.photo.caption }};
                }}
                
            }} catch (e) {{
                return {{ title: "", debug: `JS Error: ${{e.message}}` }};
            }}

            // Fallbacks
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) return {{ title: ogTitle.content }};
            
            const windowKeys = Object.keys(window).filter(k => k.includes('STATE') || k.includes('config')).join(', ');
            return {{ title: "", debug: `Extraction Failed. Log: ${{debugInfo.join(' | ')}}. Window keys: ${{windowKeys}}` }};
        }}
        """
        
        logger.info(f"[Kuaishou] Step 4: Launching Tasks")
        
        try:
            # Ensure browser is running
            await browser_service.start()
            
            # Task 1: Sniff Video
            # Sniffer will now handle stealth UA rotation automatically via browser_service.get_stealth_context
            task_video = sniffer.sniff(url, custom_js=None) 
            
            # Task 2: Extract Title
            # We rely on the stealth context to bypass the block.
            # The JS script will try to extract from Apollo State or fallback to DOM.
            task_title = sniffer.get_page_info(url, custom_js=js_script)
            
            results = await asyncio.gather(task_video, task_title, return_exceptions=True)
            logger.info(f"[Kuaishou] Step 5: Tasks Completed")
            
            sniff_result = results[0]
            page_info = results[1]
            
            # Initialize variables early to prevent UnboundLocalError
            direct_url = None
            title = f"Kuaishou Video {video_id or 'unknown'}"
            
            # Process Video Result
            logger.info(f"[Kuaishou] Step 6: Processing Sniff Result")
            if isinstance(sniff_result, dict) and sniff_result.get("url"):
                direct_url = sniff_result.get("url")
                logger.success(f"[Kuaishou] URL Found: {direct_url[:30]}...")
            elif isinstance(sniff_result, Exception):
                logger.error(f"[Kuaishou] Sniff Error: {sniff_result}")
            
            if not direct_url:
                raise Exception("Failed to sniff video URL from Kuaishou.")

            # Process Title Result
            logger.info(f"[Kuaishou] Step 7: Processing Title Info")
            if isinstance(page_info, dict):
                logger.info(f"[Kuaishou] Page Info Debug: {page_info.get('debug', 'No Debug Info')}")
                
                extracted_title = page_info.get("title")
                if extracted_title and len(extracted_title) > 1:
                    title = extracted_title
                    logger.success(f"[Kuaishou] Title Extracted: {title}")
            
            # Final Cleanup
            logger.info(f"[Kuaishou] Step 8: Finalizing")
            title = str(title).replace(" - 快手", "").strip()

            return AnalyzeResult(
                type="single",
                platform="kuaishou",
                id=video_id or "unknown",
                title=title,
                url=url,
                direct_src=direct_url,
                extra_info={
                    'platform': 'kuaishou',
                    'video_id': video_id,
                    'debug_log': page_info.get('debug') if isinstance(page_info, dict) else str(page_info)
                }
            )
        finally:
            # Ensure browser resources are released
            await browser_service.stop()

    def _extract_id(self, url: str) -> Optional[str]:
        # web link: https://www.kuaishou.com/short-video/3xi3kxtvsx782gu
        match = re.search(r'short-video/([a-zA-Z0-9_]+)', url)
        if match:
            return match.group(1)
        
        # share link: https://v.kuaishou.com/xxxx
        # The ID is hidden behind redirect. We can use the slug.
        match = re.search(r'kuaishou\.com/([a-zA-Z0-9]+)', url)
        if match and 'short-video' not in url:
             return match.group(1)
             
        # /f/X-xxxx format
        match = re.search(r'/f/([a-zA-Z0-9_\-]+)', url)
        if match:
            return match.group(1)
            
        return None
