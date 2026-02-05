"""3Dモデル生成APIエンドポイント"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.mesh3d import (
    check_3d_status,
    generate_3d_from_image,
)

router = APIRouter(prefix="/api", tags=["mesh3d"])


class Generate3DRequest(BaseModel):
    image_url: str = Field(..., description="3D化する画像のURL")


class Generate3DResponse(BaseModel):
    success: bool
    task_id: str | None = None
    status: str = "pending"
    model_url: str | None = None
    thumbnail_url: str | None = None
    error: str | None = None


@router.post("/generate-3d", response_model=Generate3DResponse)
async def generate_3d(req: Generate3DRequest):
    """画像から3Dモデル生成タスクを開始する。

    生成には数分かかるため、task_idを返し、
    /api/mesh3d-status/{task_id} でステータスを確認する。
    """
    result = await generate_3d_from_image(req.image_url)

    if not result.success:
        if "not configured" in (result.error or ""):
            raise HTTPException(status_code=503, detail="3D generation service not available")
        raise HTTPException(status_code=500, detail=result.error)

    return Generate3DResponse(
        success=result.success,
        task_id=result.task_id,
        status=result.status,
    )


@router.get("/mesh3d-status/{task_id}", response_model=Generate3DResponse)
async def get_3d_status(task_id: str):
    """3D生成タスクのステータスを確認する。"""
    result = await check_3d_status(task_id)

    return Generate3DResponse(
        success=result.success,
        task_id=result.task_id,
        status=result.status,
        model_url=result.model_url,
        thumbnail_url=result.thumbnail_url,
        error=result.error,
    )
