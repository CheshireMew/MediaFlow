"""
Cookie Management API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from loguru import logger
from src.core.container import container, Services

def _get_api_cookie_manager():
    return container.get(Services.COOKIE_MANAGER)


router = APIRouter(prefix="/cookies", tags=["Cookies"])


class CookieSaveRequest(BaseModel):
    domain: str
    cookies: List[Dict[str, Any]]


class CookieStatusResponse(BaseModel):
    domain: str
    has_valid_cookies: bool
    cookie_path: str = None


@router.post("/save", response_model=CookieStatusResponse)
async def save_cookies(req: CookieSaveRequest):
    """
    Save cookies for a domain in Netscape format.
    Called by the frontend after fetching cookies from Electron.
    """
    try:
        if not req.cookies:
            raise HTTPException(status_code=400, detail="No cookies provided")
        
        cookie_path = _get_api_cookie_manager().save_cookies(req.domain, req.cookies)
        
        return CookieStatusResponse(
            domain=req.domain,
            has_valid_cookies=True,
            cookie_path=str(cookie_path)
        )
    except Exception as e:
        logger.error(f"Failed to save cookies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{domain}", response_model=CookieStatusResponse)
async def check_cookie_status(domain: str):
    """
    Check if we have valid cookies for a domain.
    """
    cm = _get_api_cookie_manager()
    has_valid = cm.has_valid_cookies(domain)
    cookie_path = cm.get_cookie_path(domain)
    
    return CookieStatusResponse(
        domain=domain,
        has_valid_cookies=has_valid,
        cookie_path=str(cookie_path) if has_valid else None
    )


@router.delete("/{domain}")
async def clear_cookies(domain: str):
    """
    Clear cookies for a domain.
    """
    success = _get_api_cookie_manager().clear_cookies(domain)
    return {"success": success, "domain": domain}
