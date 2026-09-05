import asyncio
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, Header, HTTPException, Request, Response, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import settings, ALLOWED_ORIGINS
from backend.database import (
    init_db,
    get_db,
    get_user_by_username,
    get_user_by_id,
    list_users,
    create_user,
    update_user,
    delete_user,
    update_user_last_login,
    get_dynamic_setting,
    set_dynamic_setting,
    get_all_dynamic_settings,
    get_user_audit_stats,
    get_user_detailed_report,
    get_analytics_report,
    create_database_backup,
    list_database_backups,
    restore_database_from_backup,
    get_backup_directory,
)
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)
from backend.models import (
    JobCreateRequest,
    LoginRequest,
    LoginResponse,
    UserResponse,
    UserCreateRequest,
    UserUpdateRequest,
    ChangePasswordRequest,
    SystemSettingsUpdateRequest,
    WorkerDownloadedRequest,
    WorkerFailedRequest,
    WorkerHeartbeatRequest,
    WorkerPhaseRequest,
    WorkerStateRequest,
)
from backend.service import (
    submit_new_job,
    lookup_asset,
    claim_next_job_for_worker,
    complete_worker_job,
    fail_worker_job,
    get_status_summary,
    search_library,
    startup_reconciliation,
    reap_stale_claims,
    resume_queue,
    set_health,
    get_queue_view,
    update_job_phase,
    ConfigurationError,
    clear_job_history,
    clear_user_recent_history,
    cancel_job,
    retry_failed_job,
    delete_library_item,
    get_effective_library_path,
    get_today_str,
)

WEB_DIR = Path(__file__).resolve().parent / "web"


async def _reaper_loop():
    """Periodically requeue jobs whose worker died and ensure automated daily backups."""
    last_backup_check = 0.0
    while True:
        try:
            await asyncio.sleep(settings.REAPER_INTERVAL_SECONDS)
            await asyncio.to_thread(reap_stale_claims)

            # Check automated daily backup
            now_ts = asyncio.get_event_loop().time()
            if now_ts - last_backup_check > 600:
                last_backup_check = now_ts
                auto_enabled = get_dynamic_setting("backup_auto_enabled", "true")
                if str(auto_enabled).lower() == "true":
                    today_str = datetime.now().strftime("%Y%m%d")
                    bdir = get_backup_directory()
                    if not any(f.name.startswith(f"artlist_relay_backup_{today_str}") for f in bdir.glob("*.db")):
                        print(f"[Backup] Creating automated daily database snapshot for {today_str}...")
                        await asyncio.to_thread(create_database_backup)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[WARN] Reaper iteration notice: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    startup_reconciliation()
    task = asyncio.create_task(_reaper_loop())
    print(f"[INFO] Relay master key: {settings.AUTH_TOKEN}")
    print(f"[INFO] Dashboard:        http://{settings.HOST}:{settings.PORT}/")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


from starlette.middleware.gzip import GZipMiddleware

app = FastAPI(
    title="Stocks Library • Studio Media Hub",
    version="2.1.0",
    description="Universal local relay and shared asset library for Artlist and Envato Elements",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["Content-Disposition"],
)


# --------------------------------------------------------------------- auth deps

def get_current_user(
    authorization: str = Header(default=""),
    token: str = "",
) -> Dict[str, Any]:
    """
    Validates user bearer token or query token parameter.
    Fallback: Server master token grants system admin access.
    """
    raw_token = ""
    if authorization:
        parts = authorization.strip().split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            raw_token = parts[1]
        elif len(parts) == 1:
            raw_token = parts[0]
    elif token:
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Master token fallback (e.g. CLI or internal worker)
    if secrets.compare_digest(raw_token, settings.AUTH_TOKEN):
        return {
            "id": "system_master",
            "username": "admin",
            "full_name": "System Administrator",
            "role": "admin",
            "is_active": 1,
        }

    # Verify user token
    payload = decode_access_token(raw_token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
        )
    if not user.get("is_active", 1):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Please contact an administrator.",
        )

    return user


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Ensures current user has admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required for this action.",
        )
    return current_user


def verify_loopback(request: Request) -> None:
    """Worker routes are reachable only from the node itself."""
    client_host = request.client.host if request.client else ""
    allowed_hosts = {"127.0.0.1", "::1", "localhost", settings.HOST, "192.168.200.131", "10.50.1.222"}
    if client_host not in allowed_hosts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Worker routes are strictly restricted to loopback (127.0.0.1)",
        )


# ------------------------------------------------------- user auth endpoints

@app.post("/api/v1/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticate user with username and password."""
    clean_username = req.username.strip().lower()
    user = get_user_by_username(clean_username)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is deactivated. Contact an admin.",
        )

    update_user_last_login(user["id"])
    token = create_access_token({
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user.get("full_name") or "",
            "role": user["role"],
            "is_active": bool(user["is_active"]),
            "created_at": user["created_at"],
            "last_login": user.get("last_login"),
        },
    }


@app.get("/api/v1/auth/me")
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return profile of currently logged-in user."""
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "full_name": current_user.get("full_name") or "",
        "role": current_user["role"],
        "is_active": bool(current_user["is_active"]),
    }


@app.post("/api/v1/auth/logout")
async def logout():
    """Clear user session on client side."""
    return {"status": "logged_out"}


@app.post("/api/v1/auth/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Change password for currently authenticated user."""
    user = get_user_by_id(current_user["id"])
    if not user or not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password incorrect.")
    new_hash = hash_password(req.new_password)
    update_user(current_user["id"], {"password_hash": new_hash})
    return {"status": "password_updated"}


# ------------------------------------------------------- admin endpoints

@app.get("/api/v1/admin/users", dependencies=[Depends(require_admin)])
async def admin_list_users():
    """List all registered users with download statistics."""
    return list_users()


@app.post("/api/v1/admin/users", dependencies=[Depends(require_admin)])
async def admin_create_user(req: UserCreateRequest):
    """Create a new user (Editor or Admin)."""
    clean_username = req.username.strip().lower()
    existing = get_user_by_username(clean_username)
    if existing:
        raise HTTPException(status_code=400, detail=f"Username '{clean_username}' already exists.")
    
    role = req.role if req.role in ("admin", "editor") else "editor"
    pwd_hash = hash_password(req.password)
    created = create_user(
        username=clean_username,
        password_hash=pwd_hash,
        role=role,
        full_name=req.full_name or "",
    )
    return created


@app.patch("/api/v1/admin/users/{user_id}", dependencies=[Depends(require_admin)])
async def admin_update_user(user_id: str, req: UserUpdateRequest):
    """Update user role, active status, full name, or reset password."""
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    
    updates = {}
    if req.full_name is not None:
        updates["full_name"] = req.full_name.strip()
    if req.role is not None and req.role in ("admin", "editor"):
        updates["role"] = req.role
    if req.is_active is not None:
        updates["is_active"] = 1 if req.is_active else 0
    if req.password:
        updates["password_hash"] = hash_password(req.password)

    updated = update_user(user_id, updates)
    return updated


@app.delete("/api/v1/admin/users/{user_id}", dependencies=[Depends(require_admin)])
async def admin_delete_user(user_id: str):
    """Delete a user account."""
    try:
        deleted = delete_user(user_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="User not found.")
        return {"status": "deleted", "user_id": user_id}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@app.get("/api/v1/users/{user_identifier}/report")
async def get_user_report(
    user_identifier: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieve comprehensive report and download history for a user.
    Admins can view any user's report.
    Editors can ONLY view their own report.
    """
    is_admin = current_user.get("role") == "admin"
    is_self = (
        current_user.get("id") == user_identifier or 
        current_user.get("username", "").lower() == user_identifier.lower()
    )
    if not is_admin and not is_self:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only view your own user report.",
        )

    report = await asyncio.to_thread(get_user_detailed_report, user_identifier)
    if not report:
        raise HTTPException(status_code=404, detail=f"User '{user_identifier}' not found.")
    return report


@app.get("/api/v1/admin/settings", dependencies=[Depends(require_admin)])
async def admin_get_settings():
    """Retrieve all dynamic system and safety settings."""
    return get_all_dynamic_settings()


@app.post("/api/v1/admin/settings", dependencies=[Depends(require_admin)])
async def admin_update_settings(req: SystemSettingsUpdateRequest):
    """Update runtime safety limits, quota, and working hours."""
    if req.daily_limit_artlist is not None:
        if req.daily_limit_artlist < 1 or req.daily_limit_artlist > 500:
            raise HTTPException(status_code=400, detail="Artlist daily limit must be between 1 and 500.")
        set_dynamic_setting("daily_limit_artlist", str(req.daily_limit_artlist))

    if req.daily_limit_envato is not None:
        if req.daily_limit_envato < 1 or req.daily_limit_envato > 500:
            raise HTTPException(status_code=400, detail="Envato daily limit must be between 1 and 500.")
        set_dynamic_setting("daily_limit_envato", str(req.daily_limit_envato))

    if req.daily_safety_limit is not None:
        if req.daily_safety_limit < 1 or req.daily_safety_limit > 500:
            raise HTTPException(status_code=400, detail="Daily safety limit must be between 1 and 500.")
        set_dynamic_setting("daily_safety_limit", str(req.daily_safety_limit))

    if req.working_hours_enabled is not None:
        set_dynamic_setting("working_hours_enabled", "true" if req.working_hours_enabled else "false")

    if req.working_hours_start is not None:
        set_dynamic_setting("working_hours_start", req.working_hours_start.strip())

    if req.working_hours_end is not None:
        set_dynamic_setting("working_hours_end", req.working_hours_end.strip())

    if req.cooldown_min_seconds is not None:
        set_dynamic_setting("cooldown_min_seconds", str(max(0, req.cooldown_min_seconds)))

    if req.cooldown_max_seconds is not None:
        set_dynamic_setting("cooldown_max_seconds", str(max(0, req.cooldown_max_seconds)))

    if req.show_host_tools_to_editors is not None:
        set_dynamic_setting("show_host_tools_to_editors", "true" if req.show_host_tools_to_editors else "false")

    if req.allow_editor_delete_all is not None:
        set_dynamic_setting("allow_editor_delete_all", "true" if req.allow_editor_delete_all else "false")

    if req.library_download_path is not None:
        clean_path = req.library_download_path.strip()
        if clean_path:
            p = Path(clean_path)
            try:
                p.mkdir(parents=True, exist_ok=True)
                set_dynamic_setting("library_download_path", str(p.resolve()))
                # Re-run reconciliation on the newly selected directory
                startup_reconciliation()
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Cannot configure library folder '{clean_path}': {exc}")

    if req.backup_directory is not None:
        clean_bpath = req.backup_directory.strip()
        if clean_bpath:
            bp = Path(clean_bpath)
            try:
                bp.mkdir(parents=True, exist_ok=True)
                set_dynamic_setting("backup_directory", str(bp.resolve()))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Cannot configure backup folder '{clean_bpath}': {exc}")
        else:
            set_dynamic_setting("backup_directory", "")

    if req.backup_auto_enabled is not None:
        set_dynamic_setting("backup_auto_enabled", "true" if req.backup_auto_enabled else "false")

    return {"status": "updated", "settings": get_all_dynamic_settings()}


@app.get("/api/v1/admin/audit", dependencies=[Depends(require_admin)])
async def admin_get_audit():
    """Retrieve audit log of user download activity."""
    return get_user_audit_stats()


@app.get("/api/v1/admin/analytics", dependencies=[Depends(require_admin)])
async def admin_get_analytics(period: str = "daily", days: int = 30):
    """Retrieve aggregated daily, weekly, or monthly analytics reports."""
    return get_analytics_report(period=period, days=days)


@app.get("/api/v1/admin/reuses", dependencies=[Depends(require_admin)])
async def admin_get_reuses(days: int = 30):
    """Retrieve detailed asset reuse statistics and top reused assets across the studio."""
    from backend.database import get_reuse_statistics
    return get_reuse_statistics(days=days)


@app.get("/api/v1/admin/analytics/export", dependencies=[Depends(require_admin)])
async def admin_export_analytics(period: str = "daily", days: int = 30):
    """Export analytics report as downloadable CSV."""
    import io, csv
    report = get_analytics_report(period=period, days=days)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["STOCKS LIBRARY • STUDIO ANALYTICS REPORT"])
    writer.writerow(["Period", report["period"].upper()])
    writer.writerow(["Cutoff Date", report["cutoff_date"]])
    writer.writerow(["Total Requests", report["summary"]["total_requests"]])
    writer.writerow(["Completed Downloads", report["summary"]["completed_downloads"]])
    writer.writerow(["Failed Downloads", report["summary"]["failed_downloads"]])
    writer.writerow(["Total Bandwidth (Bytes)", report["summary"]["total_bytes"]])
    writer.writerow(["Success Rate", f"{report['summary']['success_rate']}%"])
    writer.writerow(["Active Editors", report["summary"]["active_editors_count"]])
    writer.writerow([])

    writer.writerow(["TIMELINE BREAKDOWN"])
    writer.writerow(["Bucket", "Requests", "Completed", "Failed", "Bytes"])
    for item in report.get("timeline", []):
        writer.writerow([item["bucket"], item["requests"], item["completed"], item["failed"], item["bytes"]])
    writer.writerow([])

    writer.writerow(["EDITOR UTILIZATION"])
    writer.writerow(["Username", "Full Name", "Total Requests", "Completed", "Bytes", "Last Active"])
    for ed in report.get("leaderboard", []):
        writer.writerow([ed["username"], ed["full_name"], ed["total_requests"], ed["completed"], ed["bytes"], ed["last_active"]])

    output.seek(0)
    filename = f"stocks_library_report_{report['period']}_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/v1/admin/backup/download", dependencies=[Depends(require_admin)])
async def admin_download_backup():
    """Generate on-the-fly online database backup and download directly to client."""
    backup_path = await asyncio.to_thread(create_database_backup)
    return FileResponse(
        path=str(backup_path),
        filename=backup_path.name,
        media_type="application/x-sqlite3",
    )


@app.post("/api/v1/admin/backup/create", dependencies=[Depends(require_admin)])
async def admin_create_backup():
    """Trigger a local/NAS database backup snapshot."""
    backup_path = await asyncio.to_thread(create_database_backup)
    return {
        "status": "success",
        "filename": backup_path.name,
        "path": str(backup_path),
        "size_bytes": backup_path.stat().st_size,
        "message": "Database backup created successfully."
    }


@app.get("/api/v1/admin/backup/list", dependencies=[Depends(require_admin)])
async def admin_list_backups():
    """List all stored database backups."""
    backups = await asyncio.to_thread(list_database_backups)
    backup_dir = get_backup_directory()
    return {
        "backup_directory": str(backup_dir),
        "count": len(backups),
        "backups": backups
    }


@app.post("/api/v1/admin/backup/restore", dependencies=[Depends(require_admin)])
async def admin_restore_backup(req: Dict[str, str]):
    """Restore database from an existing backup snapshot in backup directory."""
    filename = req.get("filename", "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required.")
    backup_dir = get_backup_directory()
    target_path = backup_dir / filename
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail=f"Backup file '{filename}' not found.")

    try:
        await asyncio.to_thread(restore_database_from_backup, target_path)
        return {"status": "success", "message": f"Database successfully restored from {filename}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore database: {e}")


# ------------------------------------------------------- client API endpoints

@app.post("/api/v1/jobs")
async def create_job(
    req: JobCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Submit a track URL to download with user identity attribution."""
    try:
        username = current_user.get("username", "local_editor")
        res = await asyncio.to_thread(
            submit_new_job,
            req.url,
            req.variant,
            req.format,
            username,
        )
        if res.get("type") == "cached":
            return JSONResponse(status_code=status.HTTP_200_OK, content=res)
        return JSONResponse(status_code=status.HTTP_201_CREATED, content=res)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(pe))
    except OSError as oe:
        raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE, detail=str(oe))


@app.get("/api/v1/jobs/{job_id}", dependencies=[Depends(get_current_user)])
async def get_job_detail(job_id: str):
    """Get the status and metadata of a specific job."""
    with get_db(write=False) as conn:
        job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return dict(job)


@app.get("/api/v1/library", dependencies=[Depends(get_current_user)])
async def get_library_tracks(q: str = "", category: str = "all", sort_by: str = "downloaded_at", sort_dir: str = "desc"):
    """Search and browse all tracks in the library with user attribution and column sorting."""
    return await asyncio.to_thread(search_library, q, category, sort_by, sort_dir)


@app.get("/api/v1/library/file")
async def download_library_file(
    track_id: str,
    variant: str = "main",
    token: str = "",
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Stream a library file directly to user's workstation and increment reuse count."""
    username = current_user.get("username", "studio_editor")

    with get_db(write=True) as conn:
        row = conn.execute(
            "SELECT * FROM tracks WHERE track_id = ? AND variant = ?",
            (track_id, variant),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Track not in library")

        path = Path(row["library_path"])
        effective_lib_path = get_effective_library_path()
        try:
            path.resolve().relative_to(effective_lib_path.resolve())
        except ValueError:
            try:
                path.resolve().relative_to(settings.LIBRARY_PATH.resolve())
            except ValueError:
                raise HTTPException(status_code=403, detail="Path outside the library")

        if not path.exists():
            raise HTTPException(status_code=410, detail="File is indexed but missing from disk")

        # Debounce hit_count and audit log: ignore duplicate rapid clicks within 20s from the same user
        recent_log = conn.execute(
            """
            SELECT id, completed_at FROM jobs 
            WHERE track_id = ? AND variant = ? AND requested_by = ? AND source = 'web_library'
            ORDER BY created_at DESC LIMIT 1
            """,
            (track_id, variant, username)
        ).fetchone()

        should_log = True
        if recent_log and recent_log["completed_at"]:
            try:
                last_time = datetime.fromisoformat(recent_log["completed_at"])
                if (datetime.now() - last_time).total_seconds() < 20:
                    should_log = False
            except Exception:
                pass

        if should_log:
            conn.execute(
                "UPDATE tracks SET hit_count = hit_count + 1 WHERE track_id = ? AND variant = ?",
                (track_id, variant),
            )
            today = get_today_str()
            conn.execute("""
                INSERT INTO counters (day, downloads, cache_hits) VALUES (?, 0, 1)
                ON CONFLICT(day) DO UPDATE SET cache_hits = cache_hits + 1
            """, (today,))

            # Record audit log entry in jobs table and reuse_events
            now_iso = datetime.now().isoformat()
            reuse_job_id = str(uuid.uuid4())
            conn.execute("""
                INSERT INTO jobs (id, url, track_id, variant, format, requested_by, source, status, filename, library_path, bytes, created_at, completed_at, provider, category)
                VALUES (?, ?, ?, ?, ?, ?, 'web_library', 'completed', ?, ?, ?, ?, ?, ?, ?)
            """, (
                reuse_job_id,
                row["url"] or "",
                track_id,
                variant,
                row["filename"].split(".")[-1].upper(),
                username,
                row["filename"],
                str(path),
                row["bytes"],
                now_iso,
                now_iso,
                row["provider"],
                row["category"],
            ))

            orig_downloader = row["requested_by"] or "studio"
            conn.execute("""
                INSERT INTO reuse_events (id, track_id, variant, title, filename, reused_by, original_downloader, bytes, provider, category, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'library_download', ?)
            """, (
                reuse_job_id,
                track_id,
                variant,
                row["title"] or row["filename"] or track_id,
                row["filename"],
                username,
                orig_downloader,
                row["bytes"],
                row["provider"],
                row["category"],
                now_iso,
            ))

    import mimetypes
    import urllib.parse
    filename = row["filename"]
    safe_ascii = filename.encode("ascii", "ignore").decode("ascii") or "asset.wav"

    # Precise MIME type detection for archives, audio, and video
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        fn_lower = filename.lower()
        if fn_lower.endswith(".zip"):
            mime_type = "application/zip"
        elif fn_lower.endswith(".wav"):
            mime_type = "audio/wav"
        elif fn_lower.endswith(".mp3"):
            mime_type = "audio/mpeg"
        elif fn_lower.endswith((".mp4", ".mov")):
            mime_type = "video/mp4"
        else:
            mime_type = "application/octet-stream"

    headers = {
        "Content-Disposition": f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{urllib.parse.quote(filename)}',
        "Access-Control-Expose-Headers": "Content-Disposition",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    }
    return FileResponse(
        path,
        media_type=mime_type,
        headers=headers,
    )


@app.get("/api/v1/library/stream/{track_id}", dependencies=[Depends(get_current_user)])
async def stream_library_audio(track_id: str, variant: str = "main", token: str = ""):
    """Streams audio preview directly to browser player."""
    with get_db(write=False) as conn:
        row = conn.execute(
            "SELECT filename, library_path FROM tracks WHERE track_id = ? AND variant = ?",
            (track_id, variant),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Asset not in library")

    path = Path(row["library_path"])
    try:
        path.resolve().relative_to(settings.LIBRARY_PATH.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Path outside the library")

    if not path.exists():
        raise HTTPException(status_code=410, detail="Audio file missing from disk")

    suffix = path.suffix.lower()
    media_type = "audio/wav"
    if suffix == ".mp3":
        media_type = "audio/mpeg"
    elif suffix in (".m4a", ".mp4"):
        media_type = "audio/mp4"
    elif suffix == ".flac":
        media_type = "audio/flac"
    elif suffix == ".ogg":
        media_type = "audio/ogg"

    return FileResponse(
        path,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"},
    )


@app.get("/api/v1/library/lookup", dependencies=[Depends(get_current_user)])
async def lookup_library_asset(url: str, variant: str = "main"):
    """Report whether a URL is already in the archive."""
    return await asyncio.to_thread(lookup_asset, url, variant)


@app.post("/api/v1/library/{track_id}/reveal", dependencies=[Depends(get_current_user)])
async def reveal_library_file(track_id: str, variant: str = "main"):
    """Highlights file in Windows Explorer on the host node."""
    import subprocess
    with get_db(write=False) as conn:
        row = conn.execute(
            "SELECT filename, library_path FROM tracks WHERE track_id = ? AND variant = ?",
            (track_id, variant),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Asset not in library")

    path = Path(row["library_path"])
    if not path.exists():
        raise HTTPException(status_code=410, detail="File missing from disk")

    try:
        subprocess.Popen(f'explorer.exe /select,"{path.resolve()}"')
        return {"status": "opened", "path": str(path.resolve())}
    except Exception as e:
        return {"status": "fallback", "path": str(path.resolve()), "error": str(e)}


@app.delete("/api/v1/library/{track_id}")
async def delete_library_item_endpoint(
    track_id: str,
    variant: str = "main",
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Permanently delete an asset from the library and remove its file from disk. Restricted to administrators."""
    username = current_user.get("username", "admin")
    try:
        return await asyncio.to_thread(delete_library_item, track_id, variant, username, is_admin=True)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except OSError as oe:
        raise HTTPException(status_code=500, detail=f"Filesystem deletion error: {str(oe)}")


@app.get("/api/v1/status", dependencies=[Depends(get_current_user)])
async def get_system_status():
    """Retrieve queue, daily quota, and worker health telemetry."""
    return await asyncio.to_thread(get_status_summary)


@app.get("/api/v1/queue")
async def get_queue(
    current_user: Dict[str, Any] = Depends(get_current_user),
    user: str = "",
):
    """Live queue telemetry. Editors see their own recent history; Admins see all studio history."""
    username = current_user.get("username", "")
    for_user = None
    if current_user.get("role") != "admin":
        for_user = username
    elif user:
        for_user = user.strip()
    return await asyncio.to_thread(get_queue_view, for_user=for_user, requesting_user=username)


@app.post("/api/v1/history/clear")
async def clear_history(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Dismiss recent transports history for the requesting user."""
    username = current_user.get("username", "local_editor")
    cleared_at = await asyncio.to_thread(clear_user_recent_history, username)
    return {"status": "cleared", "username": username, "cleared_at": cleared_at}


@app.post("/api/v1/jobs/{job_id}/cancel")
async def cancel_job_endpoint(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Cancel a queued or in-flight job, capturing the user's identity."""
    username = current_user.get("username", "local_editor")
    try:
        return await asyncio.to_thread(cancel_job, job_id, actor_username=username)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/v1/jobs/{job_id}/retry")
async def retry_job_endpoint(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Resume or retry a cancelled or failed download job."""
    try:
        username = current_user.get("username", "local_editor")
        is_admin = current_user.get("role") == "admin"
        return await asyncio.to_thread(retry_failed_job, job_id, username, is_admin)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except PermissionError as pe:
        if "Daily Limit reached" in str(pe):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(pe))
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except OSError as oe:
        raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE, detail=str(oe))


@app.post("/api/v1/resume", dependencies=[Depends(get_current_user)])
@app.post("/api/v1/session/reauth", dependencies=[Depends(get_current_user)])
async def resume_queue_endpoint():
    """Resumes the queue and unpauses circuit breaker."""
    def _resume():
        with get_db(write=True) as conn:
            set_health(conn, "queue_paused", "false")
            set_health(conn, "consecutive_failures", "0")
            set_health(conn, "session_authenticated", "true")
            now = datetime.now().isoformat()
            set_health(conn, "last_heartbeat", now)
            set_health(conn, "worker_type", "os_agent")

    await asyncio.to_thread(_resume)
    return {"status": "resumed"}


# ------------------------------------------------------- worker API endpoints

@app.get("/api/v1/worker/config")
async def worker_config(request: Request):
    """Single source of truth for pacing values, consumed by the extension."""
    verify_loopback(request)
    return {
        "cooldown_min_seconds": settings.COOLDOWN_MIN_SECONDS,
        "cooldown_max_seconds": settings.COOLDOWN_MAX_SECONDS,
        "job_timeout_seconds": settings.STALE_CLAIM_TIMEOUT_SECONDS,
    }


@app.get("/api/v1/worker/next")
async def worker_claim_next(request: Request):
    """Worker polling endpoint to atomically claim the next FIFO job."""
    verify_loopback(request)
    job = await asyncio.to_thread(claim_next_job_for_worker)
    if not job:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return job


@app.post("/api/v1/worker/jobs/{job_id}/downloaded")
async def worker_job_downloaded(job_id: str, req: WorkerDownloadedRequest, request: Request):
    """Worker signals the download finished in staging."""
    verify_loopback(request)
    try:
        return await asyncio.to_thread(
            complete_worker_job, job_id, req.temp_filename, req.bytes, req.title
        )
    except ConfigurationError as ce:
        await asyncio.to_thread(fail_worker_job, job_id, str(ce), False)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ce))
    except ValueError as ve:
        await asyncio.to_thread(fail_worker_job, job_id, f"Verification failed: {ve}", False)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        await asyncio.to_thread(fail_worker_job, job_id, f"Move error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.post("/api/v1/worker/jobs/{job_id}/phase")
async def worker_job_phase(job_id: str, req: WorkerPhaseRequest, request: Request):
    """Worker reports which pipeline step a job has reached."""
    verify_loopback(request)
    await asyncio.to_thread(
        update_job_phase, job_id, req.phase, req.detail,
        req.progress_bytes or 0, req.total_bytes or 0,
    )
    return {"status": "phase_recorded", "phase": req.phase}


@app.post("/api/v1/worker/state")
async def worker_state(req: WorkerStateRequest, request: Request):
    """Worker reports its cooldown deadline."""
    verify_loopback(request)

    def _write():
        with get_db(write=True) as conn:
            set_health(conn, "cooldown_until",
                       "" if req.cooldown_until in (None, "") else str(req.cooldown_until))

    await asyncio.to_thread(_write)
    return {"status": "ok"}


@app.post("/api/v1/worker/jobs/{job_id}/failed")
async def worker_job_failed(job_id: str, req: WorkerFailedRequest, request: Request):
    """Worker reports a failure during DOM interaction or download."""
    verify_loopback(request)
    retryable = "NO_STEMS" not in (req.reason or "")
    await asyncio.to_thread(fail_worker_job, job_id, req.reason, retryable)
    return {"status": "failed_recorded", "job_id": job_id, "retryable": retryable}


@app.post("/api/v1/worker/heartbeat")
async def worker_heartbeat(req: WorkerHeartbeatRequest, request: Request):
    """Worker reports authentication state."""
    verify_loopback(request)
    now = datetime.now().isoformat()

    def _write():
        with get_db(write=True) as conn:
            if req.authenticated is not None:
                set_health(conn, "session_authenticated", "true" if req.authenticated else "false")
            if req.download_dir:
                set_health(conn, "chrome_download_dir", req.download_dir)
            set_health(conn, "last_heartbeat", now)
            set_health(conn, "worker_type", "extension")

    await asyncio.to_thread(_write)
    return {"status": "heartbeat_ok", "timestamp": now}


# ------------------------------------------------------------ static dashboard

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    fav_file = WEB_DIR / "favicon.svg"
    if fav_file.exists():
        return FileResponse(fav_file, media_type="image/svg+xml")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    """Serve the dashboard application."""
    index_file = WEB_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>Artlist Relay API is running.</h1><p>Web portal files pending.</p>")
    html = index_file.read_text(encoding="utf-8")
    return HTMLResponse(html)
