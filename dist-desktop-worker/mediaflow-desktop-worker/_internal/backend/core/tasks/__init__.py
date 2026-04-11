from backend.core.tasks.registry import TaskHandlerRegistry
from backend.core.tasks.base import TaskHandler 

# Import handlers here to trigger registration (or use a plugin loading mechanism)
# For simplicity, we import * inside backend.api.v1.tasks or main if needed,
# but ideally, importing the package should suffice if they are listed here.
# However, to avoid circular imports, maybe we just define them in files.

# Let's import handlers later in __init__ of handlers package.
