from sqlmodel import SQLModel, Field, Column, JSON
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TaskType(str, Enum):
    TRANSCRIBE = "transcribe"
    TRANSLATE = "translate"
    PREPROCESS = "preprocess"
    SYNTHESIZE = "synthesize"
    PIPELINE = "pipeline"
    ANALYZE = "analyze"

class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    
    task_id: str = Field(primary_key=True)
    task_type: TaskType
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    source: str
    config: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    progress: float = Field(default=0.0)