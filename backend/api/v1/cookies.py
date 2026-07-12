"""
Cookie Management API endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from loguru import logger


class CookieSaveRequest(BaseModel):
    domain: str
    cookies: List[Dict[str, Any]]


class CookieStatusResponse(BaseModel):
    domain: str
    has_valid_cookies: bool
    cookie_path: str = None


def create_router(download_application) -> APIRouter:
    router = APIRouter(prefix="/cookies", tags=["Cookies"])

    @router.post("/save", response_model=CookieStatusResponse)
    async def save_cookies(req: CookieSaveRequest):
        try:
            if not req.cookies:
                raise HTTPException(status_code=400, detail="No cookies provided")
            download_application.save_cookies(req.domain, req.cookies)
            return CookieStatusResponse(
                domain=req.domain,
                has_valid_cookies=True,
                cookie_path=req.domain,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to save cookies: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/status/{domain}", response_model=CookieStatusResponse)
    async def check_cookie_status(domain: str):
        return CookieStatusResponse.model_validate(
            download_application.cookie_status(domain)
        )

    @router.delete("/{domain}")
    async def clear_cookies(domain: str):
        return {
            "success": download_application.clear_cookies(domain),
            "domain": domain,
        }

    return router
