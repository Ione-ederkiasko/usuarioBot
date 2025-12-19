# db.py
import os
from typing import List, Dict, Any
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def save_conversation(user_id: str, messages: List[Dict[str, Any]]):
    title = ""
    for m in messages:
        if m.get("role") == "user":
            title = m.get("content", "")[:80]
            break

    return (
        supabase.table("conversations")
        .insert(
            {
                "user_id": user_id,
                "title": title,
                "messages": messages,  # JSONB[]
            }
        )
        .execute()
    )
