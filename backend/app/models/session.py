from sqlalchemy import Column, String, DateTime, Enum as SAEnum, ForeignKey, Text, Integer, Float, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum
from app.database import Base


class SessionStatus(str, enum.Enum):
    pending = "pending"
    joining = "joining"
    recording = "recording"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    stopped = "stopped"


class MeetSession(Base):
    __tablename__ = "meet_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meet_url = Column(String(500), nullable=False)
    title = Column(String(255), nullable=True)
    status = Column(SAEnum(SessionStatus), default=SessionStatus.pending, nullable=False)
    bot_joined_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    # Content
    full_transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    action_items = Column(JSON, nullable=True)   # list of strings
    key_points = Column(JSON, nullable=True)      # list of strings
    participants = Column(JSON, nullable=True)     # list of detected names
    sentiment = Column(String(50), nullable=True)  # overall sentiment
    language = Column(String(10), default="en")

    # Storage
    audio_gcs_path = Column(String(500), nullable=True)
    transcript_gcs_path = Column(String(500), nullable=True)

    # Error info
    error_message = Column(Text, nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="sessions")
    chunks = relationship("TranscriptChunk", back_populates="session",
                          cascade="all, delete-orphan", order_by="TranscriptChunk.sequence")

    def __repr__(self):
        return f"<MeetSession {self.id} status={self.status}>"


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("meet_sessions.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    speaker = Column(String(100), nullable=True)
    start_time_ms = Column(Integer, nullable=True)
    end_time_ms = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)
    audio_gcs_path = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationship
    session = relationship("MeetSession", back_populates="chunks")

    def __repr__(self):
        return f"<TranscriptChunk {self.id} seq={self.sequence}>"
