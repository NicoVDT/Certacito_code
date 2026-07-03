from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from typing import List
import json
import asyncio

from backend.models.database import get_db

router = APIRouter()

# keep track of connected dashboard clients
_clients: List[WebSocket] = []


async def broadcast_event(event: dict):
    """push a new audit event to all connected dashboard clients"""
    dead = []
    for ws in _clients:
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    # clean up disconnected ones
    for ws in dead:
        _clients.remove(ws)


@router.websocket("/ws/live")
async def live_feed(websocket: WebSocket, token: str = Query(default=""), db=Depends(get_db)):
    # ws endpoint for real-time governance events. dashboard connects here
    # and gets pushed new audit entries as they happen instead of polling.
    #
    # browsers can't set an Authorization header on a websocket so the
    # jwt comes in as a query param instead.
    # imported here to dodge a circular import (interception imports
    # broadcast_event from us AND imports auth)
    from backend.api.auth import _user_from_jwt

    user = await _user_from_jwt(token, db)
    if user is None:
        # 1008 = policy violation, the standard "not allowed" close code
        await websocket.close(code=1008)
        return

    await websocket.accept()
    _clients.append(websocket)
    try:
        # keep connection alive, listen for pings
        while True:
            data = await websocket.receive_text()
            # client can send "ping" to keep alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _clients.remove(websocket)
    except Exception:
        if websocket in _clients:
            _clients.remove(websocket)
