"""SQLAlchemy models：一表一檔。匯入全部 model 讓 Base.metadata 完整。"""

from app.models.achievement import Achievement
from app.models.base import Base
from app.models.category import Category
from app.models.category_group import CategoryGroup
from app.models.credit_card import CreditCard
from app.models.expense import Expense
from app.models.extra_income import ExtraIncome
from app.models.installment import Installment
from app.models.monthly_income import MonthlyIncome
from app.models.recurring_expense import RecurringExpense
from app.models.reward_ledger import RewardLedger
from app.models.user import User
from app.models.weekly_target import WeeklyTarget

__all__ = [
    "Base",
    "User",
    "MonthlyIncome",
    "ExtraIncome",
    "RecurringExpense",
    "CreditCard",
    "Installment",
    "CategoryGroup",
    "Category",
    "Expense",
    "WeeklyTarget",
    "RewardLedger",
    "Achievement",
]
