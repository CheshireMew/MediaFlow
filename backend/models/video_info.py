from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class VideoInfo(BaseModel):
    url: str
    title: Optional[str] = None
    duration: Optional[float] = None
    thumbnail: Optional[str] = None
    formats: Optional[List[Dict[str, Any]]] = None

class VideoFormat(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    filesize: Optional[int] = None
    url: Optional[str] = None