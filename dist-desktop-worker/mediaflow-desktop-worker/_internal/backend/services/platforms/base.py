from abc import ABC, abstractmethod
from typing import Optional, Union, List
from backend.models.schemas import AnalyzeResult

class BasePlatform(ABC):
    """Abstract base class for platform-specific handlers."""

    @abstractmethod
    async def match(self, url: str) -> bool:
        """Check if this handler supports the given URL."""
        pass

    @abstractmethod
    async def analyze(self, url: str) -> Optional[Union[AnalyzeResult, List[AnalyzeResult]]]:
        """
        Analyze the URL and return metadata.
        Returns None if analysis fails or cannot be handled.
        """
        pass
