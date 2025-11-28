"""
Session management for Gemini Live Avatar
Tracks individual client sessions and their state
Enforces single-session per user (new session kicks old one)
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import asyncio
import re
import logging

logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    """SDK-COMPLIANT: Tracks the state of a client session."""
    is_receiving_response: bool = False
    genai_session: Optional[Any] = None
    received_model_response: bool = False
    client_interrupted: bool = False  # Client-side barge-in detected
    skip_initial_greeting: bool = True  # Skip forwarding the KV cache preload response

    # Session metadata
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    message_count: int = 0

    # User authentication (for single-session enforcement)
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    websocket: Optional[Any] = None  # Reference to websocket for disconnection

    # SDK-COMPLIANT: Usage tracking
    total_tokens: int = 0

    # Transcription accumulation (output_audio_transcription chunks)
    output_transcriptions: list = field(default_factory=list)

    # Tool call debouncing (prevent rapid duplicate calls)
    # Fixed: Issue #56 - track last tool call to prevent spam
    last_tool_call_name: Optional[str] = None
    last_tool_call_time: Optional[datetime] = None


# SDK-COMPLIANT: Global session storage with thread-safe access
active_sessions: Dict[str, SessionState] = {}
# User -> session mapping for single-session enforcement
user_sessions: Dict[str, str] = {}  # user_id -> session_id
_session_lock = asyncio.Lock()
MAX_SESSIONS = 1000  # Prevent memory exhaustion
SESSION_TIMEOUT_SECONDS = 600  # SDK maximum: 10 minutes (600 seconds)
SESSION_CLEANUP_INTERVAL_SECONDS = 300  # Check for timed out sessions every 5 minutes

def validate_session_id(session_id: str) -> bool:
    """
    Validate session ID format (UUID4).
    SECURITY: Prevents path traversal and injection attacks.
    """
    # UUID4 pattern: 8-4-4-4-12 hexadecimal digits
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(session_id))


async def create_session(session_id: str) -> SessionState:
    """
    Create and store a new session with thread-safe access.
    SECURITY: Validates session_id format before use.
    """
    # SECURITY: Validate session ID format
    if not validate_session_id(session_id):
        import logging
        logging.getLogger(__name__).error(f"Invalid session ID format: {session_id}")
        raise ValueError(f"Invalid session ID format")

    async with _session_lock:
        # Check max sessions limit
        if len(active_sessions) >= MAX_SESSIONS:
            # Remove oldest session
            oldest_id = min(
                active_sessions.keys(),
                key=lambda k: active_sessions[k].last_activity
            )
            del active_sessions[oldest_id]
            import logging
            logging.getLogger(__name__).warning(
                f"Max sessions ({MAX_SESSIONS}) reached, removed oldest session: {oldest_id}"
            )

        session = SessionState()
        active_sessions[session_id] = session
        return session


async def get_session(session_id: str) -> Optional[SessionState]:
    """Get an existing session with thread-safe access."""
    async with _session_lock:
        return active_sessions.get(session_id)


async def remove_session(session_id: str) -> None:
    """Remove a session with thread-safe access."""
    async with _session_lock:
        if session_id in active_sessions:
            session = active_sessions[session_id]
            # Also remove from user_sessions mapping
            if session.user_id and session.user_id in user_sessions:
                if user_sessions[session.user_id] == session_id:
                    del user_sessions[session.user_id]
                    logger.info(f"🔓 User {session.user_email} session mapping removed")
            del active_sessions[session_id]


async def register_user_session(session_id: str, user_id: str, user_email: str, websocket: Any) -> Optional[Any]:
    """
    Register a user with a session. If user already has an active session,
    return the old websocket to be disconnected (single-session enforcement).

    Returns:
        Old websocket to disconnect, or None if no existing session
    """
    old_websocket = None

    async with _session_lock:
        # Check if user already has an active session
        if user_id in user_sessions:
            old_session_id = user_sessions[user_id]
            if old_session_id in active_sessions and old_session_id != session_id:
                old_session = active_sessions[old_session_id]
                old_websocket = old_session.websocket
                logger.info(f"👢 Kicking existing session for user {user_email} (session: {old_session_id[:8]}...)")

                # Clean up old session
                del active_sessions[old_session_id]

        # Register new session for user
        user_sessions[user_id] = session_id

        # Update session with user info
        if session_id in active_sessions:
            session = active_sessions[session_id]
            session.user_id = user_id
            session.user_email = user_email
            session.websocket = websocket
            logger.info(f"✅ User {user_email} registered with session {session_id[:8]}...")

    return old_websocket


async def get_user_session(user_id: str) -> Optional[Tuple[str, SessionState]]:
    """Get the active session for a user, if any."""
    async with _session_lock:
        if user_id in user_sessions:
            session_id = user_sessions[user_id]
            if session_id in active_sessions:
                return (session_id, active_sessions[session_id])
    return None


async def update_session_activity(session_id: str) -> None:
    """Update last activity timestamp for a session."""
    async with _session_lock:
        session = active_sessions.get(session_id)
        if session:
            session.last_activity = datetime.now()


def get_active_session_count() -> int:
    """Get the number of active sessions (sync, no lock needed for read)."""
    return len(active_sessions)


async def list_sessions() -> Dict[str, SessionState]:
    """Get a snapshot of all active sessions."""
    async with _session_lock:
        return active_sessions.copy()


async def cleanup_timed_out_sessions() -> None:
    """
    Background task to clean up sessions that have been inactive for too long.
    Run this periodically (e.g., every 5 minutes).
    """
    while True:
        try:
            await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)

            now = datetime.now()
            timed_out_sessions = []

            async with _session_lock:
                for session_id, session in active_sessions.items():
                    inactive_duration = (now - session.last_activity).total_seconds()

                    if inactive_duration > SESSION_TIMEOUT_SECONDS:
                        timed_out_sessions.append((session_id, session))

            # Clean up timed out sessions (outside lock)
            if timed_out_sessions:
                import logging
                logger = logging.getLogger(__name__)

                for session_id, session in timed_out_sessions:
                    logger.info(f"⏱️ Session {session_id} timed out after {SESSION_TIMEOUT_SECONDS}s inactivity")

                    # Note: Gemini sessions are managed by async with context managers
                    # in handle_client(). They will be automatically closed when the
                    # connection ends. We just remove the session from tracking here.

                    # Remove from active sessions
                    await remove_session(session_id)

                logger.info(f"🧹 Cleaned up {len(timed_out_sessions)} timed out sessions")

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error in session timeout cleanup: {e}")
