from src.services.downloader.progress import clean_ansi
from src.services.downloader import DownloaderService

def test_clean_ansi():
    """Test removal of ANSI escape sequences from strings."""
    text = "\u001b[31mRed Text\u001b[0m"
    assert clean_ansi(text) == "Red Text"
    
    text2 = "Normal Text"
    assert clean_ansi(text2) == "Normal Text"

def test_downloader_init():
    """Test downloader service initialized with correct output dir."""
    from src.config import settings
    service = DownloaderService()
    assert service.output_dir == settings.TEMP_DIR
