from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    __table_args__ = (UniqueConstraint("polygon_hash", "year", name="uq_polygon_year"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    polygon_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    geojson: Mapped[str] = mapped_column(Text, nullable=False)

    eroded_pixels: Mapped[float] = mapped_column(Float, nullable=False)
    hectares_lost: Mapped[float] = mapped_column(Float, nullable=False)
    total_carbon_emitted: Mapped[float] = mapped_column(Float, nullable=False)

    mask_h: Mapped[int] = mapped_column(Integer, nullable=False)
    mask_w: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

