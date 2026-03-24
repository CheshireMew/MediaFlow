from typing import Optional, Dict, List, Any
from sqlmodel import Field, SQLModel, JSON, Column
import time
from pydantic import ConfigDict

class Task(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: Optional[str] = Field(default=None) # User friendly name
    type: str  # "download", "transcribe", etc.
    status: str  # "pending", "running", "completed", "failed", "cancelled", "paused"
    progress: float = Field(default=0.0)
    message: str = Field(default="")
    created_at: float = Field(default_factory=time.time)
    
    # JSON Fields (Use explicit column type for SQLite compatibility)
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = Field(default=None)
    cancelled: bool = Field(default=False)
    request_params: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    model_config = ConfigDict(arbitrary_types_allowed=True)
