# auth.py
import os
import time
import requests
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Tu URL de Supabase, p.ej. https://xyzcompany.supabase.co
SUPABASE_URL = https://turmfsgvzopagwogoxty.supabase.co

security = HTTPBearer(auto_error=False)

# Caché simple del JWKS para no pedirlo en cada request
_jwks_cache = None
_jwks_cache_ts = 0
_JWKS_TTL = 60 * 60  # 1 hora

def _get_jwks():
  global _jwks_cache, _jwks_cache_ts
  now = time.time()
  if _jwks_cache and now - _jwks_cache_ts < _JWKS_TTL:
      return _jwks_cache

  jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
  res = requests.get(jwks_url, timeout=5)
  if not res.ok:
      raise RuntimeError(f"No se pudo obtener JWKS de Supabase: {res.status_code}")
  _jwks_cache = res.json()
  _jwks_cache_ts = now
  return _jwks_cache


async def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token requerido",
        )

    token = cred.credentials

    try:
        jwks = _get_jwks()
        # Construir un key set para PyJWT
        key_set = jwt.PyJWKSet.from_dict(jwks)

        payload = jwt.decode(
            token,
            key=key_set,
            algorithms=["RS256", "ES256"],  # Supabase usa JWT asimétricos
            audience="authenticated",
        )

        return payload  # contiene "sub", "email", etc.
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
        )


# # auth.py
# import os
# import jwt
# from fastapi import Depends, HTTPException, status
# from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
# ALGORITHM = "HS256"

# security = HTTPBearer(auto_error=False)

# async def get_current_user(
#     cred: HTTPAuthorizationCredentials = Depends(security),
# ) -> dict:
#     if cred is None:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Token requerido",
#         )

#     token = cred.credentials
#     try:
#         payload = jwt.decode(
#             token,
#             JWT_SECRET,
#             algorithms=[ALGORITHM],
#             audience="authenticated",
#         )
#         return payload  # contiene "sub" (id usuario), "email", etc.
#     except Exception:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Token inválido",
#         )
