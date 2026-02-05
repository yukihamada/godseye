"""Meshy.ai API連携 — 画像から3Dモデルを生成する。"""

import asyncio
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class Mesh3DResult:
    """3D生成結果"""
    success: bool = False
    task_id: str | None = None
    status: str = "pending"  # pending, processing, completed, failed
    model_url: str | None = None  # GLBファイルURL
    thumbnail_url: str | None = None
    error: str | None = None


MESHY_API_BASE = "https://api.meshy.ai/v2"


async def generate_3d_from_image(image_url: str) -> Mesh3DResult:
    """画像から3Dモデルを生成する（非同期タスク開始）。

    Args:
        image_url: 元画像のURL

    Returns:
        Mesh3DResult: タスクID含む結果（完了まで polling 必要）
    """
    api_key = settings.meshy_api_key
    if not api_key:
        return Mesh3DResult(success=False, error="Meshy API key not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Image to 3D タスクを作成
            resp = await client.post(
                f"{MESHY_API_BASE}/image-to-3d",
                headers=headers,
                json={
                    "image_url": image_url,
                    "enable_pbr": True,  # PBRテクスチャ有効
                },
            )

            if resp.status_code != 200 and resp.status_code != 202:
                return Mesh3DResult(
                    success=False,
                    error=f"Meshy API error: {resp.status_code} {resp.text}",
                )

            data = resp.json()
            task_id = data.get("result")

            return Mesh3DResult(
                success=True,
                task_id=task_id,
                status="pending",
            )

        except Exception as e:
            return Mesh3DResult(success=False, error=str(e))


async def check_3d_status(task_id: str) -> Mesh3DResult:
    """3D生成タスクの状態を確認する。

    Args:
        task_id: タスクID

    Returns:
        Mesh3DResult: 現在の状態
    """
    api_key = settings.meshy_api_key
    if not api_key:
        return Mesh3DResult(success=False, error="Meshy API key not configured")

    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(
                f"{MESHY_API_BASE}/image-to-3d/{task_id}",
                headers=headers,
            )

            if resp.status_code != 200:
                return Mesh3DResult(
                    success=False,
                    task_id=task_id,
                    error=f"Meshy API error: {resp.status_code}",
                )

            data = resp.json()
            status = data.get("status", "unknown")

            result = Mesh3DResult(
                success=True,
                task_id=task_id,
                status=status,
            )

            if status == "SUCCEEDED":
                result.model_url = data.get("model_urls", {}).get("glb")
                result.thumbnail_url = data.get("thumbnail_url")
            elif status == "FAILED":
                result.error = data.get("message", "Generation failed")
                result.success = False

            return result

        except Exception as e:
            return Mesh3DResult(success=False, task_id=task_id, error=str(e))


async def generate_3d_and_wait(
    image_url: str,
    max_wait_seconds: int = 120,
    poll_interval: int = 5,
) -> Mesh3DResult:
    """画像から3Dモデルを生成し、完了まで待機する。

    Args:
        image_url: 元画像のURL
        max_wait_seconds: 最大待機時間（秒）
        poll_interval: ポーリング間隔（秒）

    Returns:
        Mesh3DResult: 完了した3Dモデル情報
    """
    # タスク開始
    result = await generate_3d_from_image(image_url)
    if not result.success or not result.task_id:
        return result

    task_id = result.task_id
    elapsed = 0

    # 完了まで待機
    while elapsed < max_wait_seconds:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

        result = await check_3d_status(task_id)

        if result.status == "SUCCEEDED":
            return result
        elif result.status == "FAILED":
            return result
        # PENDING, IN_PROGRESS は継続

    return Mesh3DResult(
        success=False,
        task_id=task_id,
        status="timeout",
        error=f"Timeout after {max_wait_seconds} seconds",
    )
