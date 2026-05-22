import os
import sys
import pytest

# Make `backend/` importable as the package root (mirrors Docker volume mounts)
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..")
PROJECT_DIR = os.path.join(BACKEND_DIR, "..")
sys.path.insert(0, BACKEND_DIR)
sys.path.insert(0, PROJECT_DIR)

from fastapi.testclient import TestClient
from main import app
from tests.seed import seed_elasticsearch, seed_clickhouse, cleanup_elasticsearch, cleanup_clickhouse

DEMO_TOTAL     = 17
ISOLATE_TOTAL  = 3

DEMO_STATUS_COUNTS = {
    "FULLY_PAID":     6,
    "PARTIALLY_PAID": 4,
    "UNPAID":         4,
    "ESCALATED":      3,
}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
def seed_data():
    """Insert dummy invoices into ES and ClickHouse once per test session."""
    seed_elasticsearch()
    seed_clickhouse()
    yield
    cleanup_elasticsearch()
    cleanup_clickhouse()
