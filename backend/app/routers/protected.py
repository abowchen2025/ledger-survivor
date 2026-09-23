"""受 REQ-AUTH-000 金鑰閘門保護的 router 集合。

所有業務 router（收入、信用卡、花費、分類、分期……）一律 include 到這裡，
不要各自在 main.py include：閘門掛在這個 router 的層級，include 進來就自動受檢，
新增端點不會忘記加。唯一不經這裡的是 routers/health.py（三個 health 端點豁免）。
"""

from fastapi import APIRouter, Depends

from app.routers import auth, cards, categories, income
from app.security import require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])

router.include_router(auth.router)
router.include_router(categories.router)
router.include_router(cards.router)
router.include_router(income.router)
