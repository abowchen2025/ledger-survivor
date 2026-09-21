# syntax=docker/dockerfile:1.7
# 後端映像（Railway 用 backend/railway.json 指到這份 Dockerfile）。
# 兩階段：builder 用 uv 依 uv.lock 建 .venv；runtime 只帶 .venv 與程式碼，不帶 uv 與 dev 套件。

# ---------- builder ----------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# 先只裝相依套件（不裝專案本身），讓這一層在程式碼變動時仍可命中快取
COPY pyproject.toml uv.lock ./
# cache mount 一定要帶 id：Railway 的 builder 驗證 Dockerfile 時要求明確 id，缺少會直接報
# "dockerfile invalid: flag '--mount=type=cache,...' is missing an id argument"。
# 本機 Docker BuildKit 會自動推導 id 所以本機測不出來。兩個 RUN 用不同 id，避免互相覆蓋。不要拿掉。
RUN --mount=type=cache,id=uv-cache-deps,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# 再放程式碼並安裝專案
COPY . .
# 同上：id 為 Railway builder 必要，且與上一個 cache mount 的 id 不同
RUN --mount=type=cache,id=uv-cache-project,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ---------- runtime ----------
# 與 builder 同一個 python:3.12-slim-bookworm 基底，.venv 內的直譯器路徑才會一致
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Taipei \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

COPY --from=builder --chown=app:app /app /app

USER app

EXPOSE 8000

# Railway 以 PORT 環境變數指定對外埠；本機 docker run 沒設就用 8000。
# Migration 由 railway.json 的 startCommand 在啟動前執行；這裡的 CMD 只給本機 docker run 用。
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
