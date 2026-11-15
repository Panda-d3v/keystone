"""Opt-in reset endpoint for demo operators."""

import os
from hmac import compare_digest
from typing import Annotated

from fastapi import Header, HTTPException

from . import Database, router


@router.post("/admin/reset", operation_id="reset_demo")
def reset(
    connection: Database,
    x_demo_reset_token: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    configured_token = os.environ.get("KEYSTONE_DEMO_RESET_TOKEN")
    if not configured_token:
        raise HTTPException(404, "Demo reset is disabled")
    if not x_demo_reset_token or not compare_digest(
        x_demo_reset_token.encode("utf-8"), configured_token.encode("utf-8"),
    ):
        raise HTTPException(403, "Invalid demo reset token")
    from scripts.reset_demo import reset_demo
    return reset_demo(connection)
