"""Shared fixtures. Builds the synthetic artifact bundle once per session."""
import runpy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def fixtures_dir():
    if not (FIXTURES / "model.pt").exists():
        runpy.run_path(str(FIXTURES / "make_fixtures.py"), run_name="__main__")
    return FIXTURES


@pytest.fixture
def live(monkeypatch, fixtures_dir):
    """Point the backend at the synthetic bundle (mode == 'live')."""
    from horizon_api import artifacts as art

    monkeypatch.setattr(art, "artifacts_dir", lambda: fixtures_dir)
    art.reset_cache()
    yield
    art.reset_cache()


@pytest.fixture
def stub(monkeypatch, tmp_path):
    """Point the backend at an empty dir (mode == 'stub')."""
    from horizon_api import artifacts as art

    monkeypatch.setattr(art, "artifacts_dir", lambda: tmp_path)
    art.reset_cache()
    yield
    art.reset_cache()
