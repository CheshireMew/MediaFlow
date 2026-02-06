import asyncio
import random
from loguru import logger
from typing import Optional, Dict
from src.services.browser_service import browser_service

class NetworkSniffer:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NetworkSniffer, cls).__new__(cls)
        return cls._instance

    async def get_page_info(self, url: str, custom_js: str = None, user_agent: str = None, timeout: int = 15) -> dict:
        """
        Navigate to a URL and extract information using custom JavaScript.
        """
        # Get context from browser service
        context = await browser_service.get_stealth_context(user_agent)
        page = await context.new_page()
        
        result = {}
        try:
            logger.info(f"[Sniffer] Inspecting page info: {url}")
            
            # Anti-detection: Random mouse movements
            await page.mouse.move(random.randint(0, 500), random.randint(0, 500))
            
            try:
                await page.goto(url, timeout=timeout*1000, wait_until="commit")
                # Random delay
                await asyncio.sleep(random.uniform(1.0, 3.0))
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception as e:
                logger.warning(f"[Sniffer] Navigation warning: {e}")

            if custom_js:
                js_result = await page.evaluate(custom_js)
                if isinstance(js_result, dict):
                    result = js_result
                    logger.info(f"[Sniffer] Page Info extracted: {result}")
            else:
                result = {"title": await page.title(), "content": await page.content()}
                
        except Exception as e:
            logger.error(f"[Sniffer] get_page_info failed: {e}")
            result = {"error": str(e)}
        finally:
            await context.close()
            
        return result

    async def sniff(self, url: str, timeout: int = 15, custom_js: str = None) -> Optional[dict]:
        """
        Sniff network traffic to find video URLs.
        """
        found_url = None
        extracted_title = "Video" # Default title
        context = await browser_service.get_stealth_context() 
        page = await context.new_page()
        viewport = context.pages[0].viewport_size if context.pages else None

        async def handle_request_wrapper(route, request):
            nonlocal found_url
            r_url = request.url
            # Kuaishou specific patterns (make generic later if needed)
            if '.mp4' in r_url or 'video_id=' in r_url or 'aweme/v1/play' in r_url:
                if ".html" not in r_url and "blob:" not in r_url:
                    if len(r_url) > 50:
                        found_url = r_url
                        logger.info(f"[Sniffer] Sniffed candidate: {r_url[:100]}...")
                        await route.abort() # Save bandwidth
            elif '.m3u8' in r_url:
                found_url = r_url
                logger.info(f"[Sniffer] Sniffed candidate: {r_url[:100]}...")
                await route.abort()
            else:
                 await route.continue_()

        await page.route("**/*", handle_request_wrapper)
        
        try:
            logger.info(f"[Sniffer] Navigating to {url}...")
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
            
            # Try to extract title immediately or after a short wait
            try:
                extracted_title = await page.title()
                # Basic cleanup for Douyin title "Content - 抖音..."
                if "- 抖音" in extracted_title:
                    extracted_title = extracted_title.split("- 抖音")[0].strip()
            except Exception as e:
                logger.debug(f"[Sniffer] Title extraction warning: {e}")

            custom_title_found = False
            post_url_found_steps = 0
            
            for step in range(timeout * 2):
                # If we have both, we are golden
                if found_url and custom_title_found:
                    break
                
                # If we have URL but title is taking too long/failing, just give up on title
                if found_url:
                    post_url_found_steps += 1
                    if post_url_found_steps > 10: # Wait max ~5s after finding URL for debug dump
                        logger.info("[Sniffer] Title extraction timed out, proceeding with URL only.")
                        break
                
                await page.wait_for_timeout(500)
                
                # Execute custom JS repeatedly until we get a good title
                if custom_js and not custom_title_found:
                    try:
                        js_result = await page.evaluate(custom_js)
                        if js_result and isinstance(js_result, dict):
                            t = js_result.get("title")
                            if t and t != "Douyin Video" and "快手" not in t: 
                                extracted_title = t
                                custom_title_found = True
                                logger.success(f"[Sniffer] Custom title locked: {extracted_title}")
                    except Exception: pass

                # Try to play to trigger request (Interaction is crucial for Desktop UA)
                if step % 4 == 2:
                     try:
                        # 1. Try HTML5 Video API (Muted autoplay is usually allowed)
                        await page.evaluate("""
                            const v = document.querySelector('video');
                            if (v) { 
                                v.muted = true; 
                                v.play().catch(e => console.log("Play failed:", e)); 
                            }
                        """)
                        
                        # 2. Simulate User Interaction (Click center)
                        if viewport:
                             await page.mouse.click(viewport['width'] / 2, viewport['height'] / 2)
                             
                        # 3. Generic click
                        await page.evaluate("document.body.click()")
                     except Exception as e:
                         logger.debug(f"[Sniffer] Interaction step warning: {e}")
            
            # Loop finished
            if found_url:
                logger.success(f"[Sniffer] Sniffing success. Title: {extracted_title}")
                return {"url": found_url, "title": extracted_title}
            else:
                logger.warning(f"[Sniffer] Sniffing timed out or nothing found.")
        
        except Exception as e:
            logger.error(f"[Sniffer] Error sniffing: {e}")
        finally:
            await context.close()
        
        return None

sniffer = NetworkSniffer()
