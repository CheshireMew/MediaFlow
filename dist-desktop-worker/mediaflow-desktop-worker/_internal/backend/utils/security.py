import ctypes
import base64
from ctypes import wintypes
from loguru import logger

class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

class SecurityManager:
    """
    Windows DPAPI wrapper for secure local storage without external dependencies.
    """
    
    @staticmethod
    def encrypt(text: str) -> str:
        """Encrypt string using Windows DPAPI (current user). Returns base64 string."""
        if not text:
            return ""
            
        try:
            # Convert text to bytes
            data = text.encode('utf-8')
            
            # Prepare input blob
            blob_in = DATA_BLOB()
            blob_in.cbData = len(data)
            blob_in.pbData = ctypes.cast(ctypes.create_string_buffer(data), ctypes.POINTER(ctypes.c_byte))
            
            blob_out = DATA_BLOB()
            
            # CryptProtectData(pDataIn, szDataDescr, pOptionalEntropy, pvReserved, pPromptStruct, dwFlags, pDataOut)
            # dwFlags: 0 (default) or 1 (CRYPTPROTECT_UI_FORBIDDEN)
            ret = ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(blob_in), 
                u"MediaFlow-Secret", 
                None, 
                None, 
                None, 
                0, 
                ctypes.byref(blob_out)
            )
            
            if not ret:
                raise ctypes.WinError()
                
            # Copy data from blob_out
            encrypted_bytes = ctypes.string_at(blob_out.pbData, blob_out.cbData)
            
            # Free memory
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
            
            # Return as base64
            return base64.b64encode(encrypted_bytes).decode('utf-8')
            
        except Exception as e:
            logger.error(f"DPAPI Encryption failed: {e}")
            return text  # Fallback: strict mode would raise, but here we might fallback or empty

    @staticmethod
    def decrypt(encrypted_text: str) -> str:
        """Decrypt base64 string using Windows DPAPI (current user)."""
        if not encrypted_text:
            return ""
            
        try:
            # Decode base64
            data = base64.b64decode(encrypted_text)
            
            blob_in = DATA_BLOB()
            blob_in.cbData = len(data)
            blob_in.pbData = ctypes.cast(ctypes.create_string_buffer(data), ctypes.POINTER(ctypes.c_byte))
            
            blob_out = DATA_BLOB()
            
            ret = ctypes.windll.crypt32.CryptUnprotectData(
                ctypes.byref(blob_in), 
                None, 
                None, 
                None, 
                None, 
                0, 
                ctypes.byref(blob_out)
            )
            
            if not ret:
                raise ctypes.WinError()
                
            decrypted_bytes = ctypes.string_at(blob_out.pbData, blob_out.cbData)
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
            
            return decrypted_bytes.decode('utf-8')
            
        except Exception as e:
            # logger.error(f"DPAPI Decryption failed: {e}")
            # Likely not encrypted or different user
            return encrypted_text
