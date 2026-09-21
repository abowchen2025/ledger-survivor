# syntax=docker/dockerfile:1.7
# 後端映像（Railway 服務以 Dockerfile builder 建置；部署設定在 Railway UI，見 docs/deployment-setup.md）。
# 兩階段：builder 用 uv 依 uv.lock 建 .venv；runtime 只帶 .venv 與程式碼，不帶 uv 與 dev 套件。

# ---------- builder ----------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# 先只裝相依套件（不裝專案本身），讓這一層在程式碼變動時仍可命中快取
COPY pyproject.toml uv.lock ./
# cache mount 的 id 必須用 Railway 規定的格式 id=s/<Railway service id>-<target>，
# 不是任意字串。Railway builder 驗證 Dockerfile 時會擋下缺 id 或格式不符的 cache mount
# （錯誤：dockerfile invalid ... missing an id argument / The Dockerfile failed validation），
# 本機 Docker BuildKit 不檢查所以本機 build 會過。service id 是 Railway 上 backend 服務的 id
# （部署網址 /service/<id>），若在 Railway 重建服務，這裡要跟著改。
# 兩個 RUN 的 id 相同是格式所限（由 target 決定），效果是共用同一份 uv 下載快取。不要拿掉 id。
RUN --mount=type=cache,id=s/374d7d08-9b81-47dd-9da9-23f4d73449ee-/root/.cache/uv,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# 再放程式碼並安裝專案
COPY . .
# 同上：id 用 Railway 規定格式，與上一個相同
RUN --mount=type=cache,id=s/374d7d08-9b81-47dd-9da9-23f4d73449ee-/root/.cache/uv,target=/root/.cache/uv \
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

# 這是唯一的啟動來源（Railway 的 config-as-code 對本服務不可用，見 docs/adr/0006）：只起 uvicorn。
# Railway 注入 PORT（目前 8080）；本機 docker run 沒設就用 8000。
# Migration 不在這裡跑：由 Railway UI 的 pre-deploy step（alembic upgrade head）在切流量前執行一次。
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
