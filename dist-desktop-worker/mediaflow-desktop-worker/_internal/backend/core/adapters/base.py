from abc import ABC, abstractmethod
from typing import Any, Dict, Generic, TypeVar, Optional
from pydantic import BaseModel

TInput = TypeVar("TInput", bound=BaseModel)
TOutput = TypeVar("TOutput")

class BaseAdapter(ABC, Generic[TInput, TOutput]):
    """
    Abstract Base Class for external tool adapters.
    Enforces strict typing for input configuration and output parsing.
    """

    @abstractmethod
    def validate(self, config: TInput) -> bool:
        """
        Validate the configuration before execution.
        Raises ValueError if invalid.
        """
        pass

    @abstractmethod
    def build_command(self, config: TInput) -> list[str]:
        """
        Construct the command line arguments from the config.
        """
        pass

    @abstractmethod
    def execute(self, config: TInput, progress_callback: Optional[Any] = None) -> TOutput:
        """
        Execute the external tool and return the standardized result.
        """
        pass
