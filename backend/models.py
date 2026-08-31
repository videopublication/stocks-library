from typing import Optional, List, Union
from pydantic import BaseModel, Field

class JobCreateRequest(BaseModel):
    url: str = Field(..., description="Stock asset URL (Artlist or Envato Elements)")
    variant: str = Field(default="main", description="Track/Asset variant: main, stems, etc.")
    format: str = Field(default="WAV", description="Audio format: WAV or MP3")
    requested_by: Optional[str] = Field(default="local_editor", description="User identity")

class JobDetail(BaseModel):
    job_id: str
    url: str
    track_id: str
    variant: str
    format: str
    requested_by: str
    status: str
    queue_position: Optional[int] = None
    estimated_wait_seconds: Optional[int] = None
    filename: Optional[str] = None
    library_path: Optional[str] = None
    bytes: Optional[int] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    daily_usage: Optional[str] = None

class CacheHitResponse(BaseModel):
    job_id: str
    status: str = "cached"
    track_id: str
    variant: str
    filename: str
    library_path: str
    first_licensed_by: str
    first_licensed_at: str
    hit_count: int
    daily_usage: str

class TrackSearchItem(BaseModel):
    track_id: str
    variant: str
    title: Optional[str]
    filename: str
    library_path: str
    bytes: int
    downloaded_at: str
    hit_count: int
    requested_by: str

class StatusResponse(BaseModel):
    queue_depth: int
    in_flight_job: Optional[JobDetail] = None
    daily_downloads: int
    daily_limit: int
    daily_usage: str
    today_cache_hits: int
    session_authenticated: bool
    queue_paused: bool
    heartbeat_stale: bool = False
    consecutive_failures: int = 0
    working_hours_active: bool
    disk_free_gb: float
    storage_ok: bool = True

class WorkerClaimResponse(BaseModel):
    job_id: str
    url: str
    track_id: str
    variant: str
    format: str

class WorkerDownloadedRequest(BaseModel):
    temp_filename: str
    bytes: int
    title: Optional[str] = None

class WorkerFailedRequest(BaseModel):
    reason: str

class WorkerHeartbeatRequest(BaseModel):
    # None means "could not determine" - it must not flip a healthy session to
    # logged out. Only an explicit False does that.
    authenticated: Optional[bool] = None
    # Directory Chrome is actually saving downloads into, so a mismatch with
    # STAGING_PATH can be surfaced before it wastes a download.
    download_dir: Optional[str] = None


class WorkerPhaseRequest(BaseModel):
    phase: str
    detail: Optional[str] = None
    progress_bytes: Optional[int] = 0
    total_bytes: Optional[int] = 0


class WorkerStateRequest(BaseModel):
    # Epoch milliseconds (preferred) or an ISO timestamp. Empty/None clears it.
    # The server normalises both via service.parse_timestamp.
    cooldown_until: Optional[Union[int, float, str]] = None
