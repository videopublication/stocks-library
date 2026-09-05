from typing import Optional, List, Union, Dict, Any
from pydantic import BaseModel, Field


# --- Auth & User Models -----------------------------------------------------

class LoginRequest(BaseModel):
    username: str = Field(..., description="User login username")
    password: str = Field(..., description="User login password")


class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str] = None
    total_downloads: Optional[int] = 0


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=4, max_length=128)
    full_name: Optional[str] = Field(default="")
    role: str = Field(default="editor", description="'editor' or 'admin'")


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=4, max_length=128)


class SystemSettingsUpdateRequest(BaseModel):
    daily_safety_limit: Optional[int] = None
    daily_limit_artlist: Optional[int] = None
    daily_limit_envato: Optional[int] = None
    working_hours_enabled: Optional[bool] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None
    cooldown_min_seconds: Optional[int] = None
    cooldown_max_seconds: Optional[int] = None
    show_host_tools_to_editors: Optional[bool] = None
    allow_editor_delete_all: Optional[bool] = None
    library_download_path: Optional[str] = None
    backup_directory: Optional[str] = None
    backup_auto_enabled: Optional[bool] = None


class AuditItem(BaseModel):
    job_id: str
    track_id: str
    requested_by: str
    url: str
    filename: Optional[str] = None
    bytes: Optional[int] = None
    status: str
    created_at: str
    completed_at: Optional[str] = None
    title: Optional[str] = None
    provider: Optional[str] = None
    category: Optional[str] = None


# --- Jobs & Library Models --------------------------------------------------

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
    url: Optional[str] = None
    provider: Optional[str] = "artlist"
    category: Optional[str] = "music"
    streamable: Optional[bool] = True
    is_archive: Optional[bool] = False


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
    authenticated: Optional[bool] = None
    download_dir: Optional[str] = None


class WorkerPhaseRequest(BaseModel):
    phase: str
    detail: Optional[str] = None
    progress_bytes: Optional[int] = 0
    total_bytes: Optional[int] = 0


class WorkerStateRequest(BaseModel):
    cooldown_until: Optional[Union[int, float, str]] = None
