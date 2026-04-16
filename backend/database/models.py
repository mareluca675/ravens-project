"""
RAVENS ORM models — SQLite-compatible (no PostGIS / GeoAlchemy2).
Lat/lon stored as plain Float columns.
"""

from sqlalchemy import Column, Integer, Float, String, DateTime, Text
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class WasteDetection(Base):
    __tablename__ = "waste_detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    category = Column(String(50), nullable=False)       # plastic, metal, organic, construction, liquid, background
    confidence = Column(Float, nullable=False)
    volume = Column(Float)
    features_json = Column(Text)                         # JSON string of feature dict
    source_file = Column(String(255))


class DumpingIncident(Base):
    __tablename__ = "dumping_incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    classification = Column(String(50), nullable=False)  # CONFIRMED, SUSPECTED, NEGATIVE
    confidence = Column(Float, nullable=False)
    thermal_score = Column(Float)
    optical_score = Column(Float)
    lidar_score = Column(Float)
    substance_type = Column(String(100))


class TrajectoryPrediction(Base):
    __tablename__ = "trajectory_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    origin_lat = Column(Float, nullable=False)
    origin_lon = Column(Float, nullable=False)
    hour_1_geojson = Column(Text)
    hour_6_geojson = Column(Text)
    hour_12_geojson = Column(Text)
    hour_24_geojson = Column(Text)
    discharge_at_prediction = Column(Float)
