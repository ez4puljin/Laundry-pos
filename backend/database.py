"""Салбар мэдэрдэг DB холболт.

Салбар бүр өөрийн SQLite файлтай (central.py). `get_db` нь хүсэлт бүрд
харгалзах салбарын сесс өгнө — роутерууд өөрчлөгдөхгүй.

`engine` / `SessionLocal` нь ЭХНИЙ салбарынх — migration, seed зэрэг
скрипт хэрэглээнд зориулав.
"""
from fastapi import Request
from sqlalchemy.orm import declarative_base

import central

Base = declarative_base()


def get_db(request: Request):
    """FastAPI dependency — хүсэлтийн салбарын сесс."""
    branch = central_branch(request)
    db = central.session_for(branch)
    try:
        yield db
    finally:
        db.close()


def central_branch(request: Request):
    """Хүсэлтийн салбарыг нэг л удаа тодорхойлж, хүсэлтэд хадгална."""
    branch = getattr(request.state, "branch", None)
    if branch is None:
        from branch_ctx import resolve_branch
        branch = resolve_branch(request)
        request.state.branch = branch
    return branch


def _default_pair():
    """Эхний салбарын engine + SessionLocal (скрипт/migration-д)."""
    central.bootstrap()
    branch = central.default_branch()
    return central.engine_for(branch)


engine, SessionLocal = _default_pair()
