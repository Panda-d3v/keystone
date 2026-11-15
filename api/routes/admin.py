"""T41 - POST /admin/reset restores the seeded demo database.

Turned off unless the server runs with KEYSTONE_ALLOW_RESET=1, so a
shared or production deployment can never be wiped by accident.
"""

import os

from fastapi import HTTPException
from pydantic import BaseModel

from scripts.reset_demo import reset_demo

from . import Database, router


class ResetResponse(BaseModel):
    message: str
    cleared_tables: list[str]
    seeded: dict[str, int]


@router.post("/admin/reset", operation_id="admin_reset")
def admin_reset(connection: Database) -> ResetResponse:
    if os.environ.get("KEYSTONE_ALLOW_RESET") != "1":
        raise HTTPException(403, "Demo reset is turned off on this server. Start it with KEYSTONE_ALLOW_RESET=1.")
    result = reset_demo(connection)
    return ResetResponse(
        message="The demo is back to its starting state. Upload the bulletin email to begin.",
        **result,
    )
