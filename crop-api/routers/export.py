from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, date, timezone, timedelta
import csv, io
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/v1/export", tags=["export"])

# JST = UTC+9
JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    """JSTの現在時刻を返す（タイムゾーン情報なしのnaive datetime）"""
    return datetime.now(JST).replace(tzinfo=None)


def _csv_response(rows: list[list], headers: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    # BOM付きUTF-8（Excelで文字化けしない）
    buf.write('\ufeff')
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/work-logs")
def export_work_logs(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.WorkLog).options(
        joinedload(models.WorkLog.item).joinedload(models.Item.field),
        joinedload(models.WorkLog.work_type),
        joinedload(models.WorkLog.user),
        joinedload(models.WorkLog.agro_inputs),
    )
    if item_id:
        q = q.filter(models.WorkLog.item_id == item_id)
    if from_:
        q = q.filter(models.WorkLog.worked_at >= datetime.combine(from_, datetime.min.time()))
    if to:
        q = q.filter(models.WorkLog.worked_at <= datetime.combine(to, datetime.max.time()))
    logs = q.order_by(models.WorkLog.worked_at.desc()).all()

    headers = ["作業日時", "品目", "品種", "圃場", "作業種別", "農薬・資材", "メモ", "記録者"]
    rows = []
    for log in logs:
        agro = " / ".join(
            f"{a.product_name}{' ' + a.quantity + (a.unit or '') if a.quantity else ''}"
            for a in log.agro_inputs
        )
        rows.append([
            log.worked_at.strftime("%Y/%m/%d %H:%M"),
            log.item.name if log.item else "",
            log.item.variety if log.item and log.item.variety else "",
            log.item.field.name if log.item and log.item.field else "",
            log.work_type.name if log.work_type else "",
            agro,
            log.memo or "",
            log.user.name if log.user else "",
        ])

    ts = now_jst().strftime("%Y%m%d")
    return _csv_response(rows, headers, f"work_logs_{ts}.csv")


@router.get("/harvests")
def export_harvests(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Harvest).options(
        joinedload(models.Harvest.item).joinedload(models.Item.field),
    )
    if item_id:
        q = q.filter(models.Harvest.item_id == item_id)
    if from_:
        q = q.filter(models.Harvest.harvested_at >= from_)
    if to:
        q = q.filter(models.Harvest.harvested_at <= to)
    harvests = q.order_by(models.Harvest.harvested_at.desc()).all()

    headers = ["収穫日", "品目", "品種", "圃場", "収穫量", "単位", "出荷", "メモ"]
    rows = []
    for h in harvests:
        rows.append([
            h.harvested_at.strftime("%Y/%m/%d"),
            h.item.name if h.item else "",
            h.item.variety if h.item and h.item.variety else "",
            h.item.field.name if h.item and h.item.field else "",
            h.quantity if h.quantity is not None else "",
            h.unit or "",
            "出荷済" if h.shipped else "",
            h.memo or "",
        ])

    ts = now_jst().strftime("%Y%m%d")
    return _csv_response(rows, headers, f"harvests_{ts}.csv")
