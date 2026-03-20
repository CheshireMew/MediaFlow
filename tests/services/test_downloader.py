from backend.services.downloader.progress import clean_ansi
from backend.services.downloader.service import DownloaderService

def test_clean_ansi():
    """Test removal of ANSI escape sequences from strings."""
    text = "\u001b[31mRed Text\u001b[0m"
    assert clean_ansi(text) == "Red Text"
    
    text2 = "Normal Text"
    assert clean_ansi(text2) == "Normal Text"

def test_downloader_init():
    """Test downloader service initialized with correct output dir."""
    from backend.config import settings
    service = DownloaderService()
    assert service.output_dir == settings.WORKSPACE_DIR
