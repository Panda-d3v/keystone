"""ASGI bootstrap; domain endpoints remain owned by api/routes."""
import importlib
import importlib.util
import logging
import os

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Keystone", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("WEB_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.get("/health", tags=["infrastructure"])
def health():
    return {"status": "ok", "service": "keystone-api"}

@app.get("/ready", tags=["infrastructure"])
def ready():
    try:
        with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=3) as connection:
            connection.execute("SELECT 1")
    except (KeyError, psycopg.Error):
        logging.getLogger(__name__).warning("Database readiness check failed")
        return JSONResponse({"status": "unavailable", "database": "unavailable"}, status_code=503)
    return {"status": "ok", "database": "ok"}

try:
    routes_spec = importlib.util.find_spec("api.routes")
except ModuleNotFoundError as exc:
    if exc.name != "api":
        raise
    routes_spec = None
if routes_spec is not None:
    app.include_router(importlib.import_module("api.routes").router)
