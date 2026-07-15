from typing import Literal

from pydantic import BaseModel, Field


class GlossaryTerm(BaseModel):
    id: str
    source: str = Field(..., description="Source term in original language")
    target: str = Field(..., description="Target translation")
    note: str | None = None
    category: str | None = "general"


class CreateGlossaryTermRequest(BaseModel):
    source: str
    target: str
    note: str | None = None
    category: str = "general"


class UpdateGlossaryTermRequest(BaseModel):
    source: str | None = None
    target: str | None = None
    note: str | None = None
    category: str | None = None


class GlossaryDeleteResponse(BaseModel):
    status: Literal["ok"]
