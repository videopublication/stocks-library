"""
Authentication & Authorization Security Module for Stocks Library Studio Hub.
Implements PBKDF2-HMAC-SHA256 password hashing and secure token generation/verification.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.config import settings

security = HTTPBearer(auto_error=False)

# Token configuration
TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a unique salt."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )
    return f"{salt}${base64.b64encode(key).decode('ascii')}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a stored hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 2:
            return False
        salt, expected_b64 = parts[0], parts[1]
        test_key = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            100000,
        )
        actual_b64 = base64.b64encode(test_key).decode("ascii")
        return hmac.compare_digest(expected_b64, actual_b64)
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[int] = None) -> str:
    """
    Creates a tamper-proof HMAC-SHA256 signed JWT-like token.
    Payload contains user data and expiration.
    """
    to_encode = data.copy()
    expire = int(time.time()) + (expires_delta or TOKEN_EXPIRY_SECONDS)
    to_encode.update({"exp": expire})
    
    payload_json = json.dumps(to_encode, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("ascii").rstrip("=")
    
    secret = settings.AUTH_TOKEN.encode("utf-8")
    sig = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    
    return f"{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and cryptographically verifies an access token."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig_b64 = parts[0], parts[1]
        
        # Verify signature
        secret = settings.AUTH_TOKEN.encode("utf-8")
        expected_sig = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode("ascii").rstrip("=")
        
        if not hmac.compare_digest(expected_sig_b64, sig_b64):
            return None
        
        # Add padding back if necessary
        pad = len(payload_b64) % 4
        if pad:
            payload_b64 += "=" * (4 - pad)
        
        payload_json = base64.urlsafe_b64decode(payload_b64.encode("ascii"))
        payload = json.loads(payload_json.decode("utf-8"))
        
        # Check expiration
        if payload.get("exp", 0) < int(time.time()):
            return None
            
        return payload
    except Exception:
        return None
