/**
 * 把前端「實際的 payload 組裝函式」對幾組代表性表單狀態產生的 API 請求 body 輸出成 JSON（stdout），
 * 給後端 tests/integration/test_frontend_payload_contract.py 用真正的 Pydantic Create／Update schema 逐一驗證。
 *
 * 為什麼需要（2026-09-24）：Pages 上新增信用卡失敗，前端多送了 CardCreate 沒有的 is_active，
 * 後端 extra=forbid 回 400。TypeScript 展開物件不檢查多餘屬性、mock 測試看不到後端 schema、
 * 手寫 payload 的煙測驗的不是前端真正送出的東西——只有「前端組出來的物件 × 後端真正的 schema」才擋得住這一類。
 *
 * 規則：
 * - 這裡只能呼叫表單真正用的組裝函式（lib/card-payload.ts、lib/expense-payload.ts），不得手寫 payload 物件；
 * - 輸入用「使用者在輸入框打的字」（字串），走同一條 parse → payload 路徑；
 * - 每個 case 帶 schema（後端 Pydantic 類別名）與 scenario（後端測試用來檢查涵蓋面的標籤）。
 *
 * 執行：npm run payload:dump（tsx scripts/payload-dump.ts）
 */
import type { Card } from "../src/api/cards";
import { type CardFormValues, DEFAULT_CARD_COLOR, cardCreatePayload, cardUpdateFromCard, cardUpdatePayload, parseCardForm } from "../src/lib/card-payload";
import { type ExpenseFormValues, expenseCreatePayload, expenseUpdatePayload, parseExpenseForm } from "../src/lib/expense-payload";

type SchemaName = "CardCreate" | "CardUpdate" | "ExpenseCreate" | "ExpenseUpdate";

export type Scenario =
  | "card_create"
  | "card_edit"
  | "card_deactivate"
  | "card_reactivate"
  | "expense_create_cash"
  | "expense_create_credit_card"
  | "expense_create_mobile_pay"
  | "expense_create_transfer"
  | "expense_create_refund"
  | "expense_edit";

interface DumpCase {
  id: string;
  schema: SchemaName;
  scenario: Scenario;
  description: string;
  payload: unknown;
}

const cases: DumpCase[] = [];

function cardFields(values: CardFormValues) {
  const parsed = parseCardForm(values);
  if (!parsed.ok) throw new Error(`card form values rejected by frontend validation: ${JSON.stringify(parsed.errors)}`);
  return parsed.fields;
}

function expenseFields(values: ExpenseFormValues) {
  const parsed = parseExpenseForm(values);
  if (!parsed.ok) throw new Error(`expense form values rejected by frontend validation: ${JSON.stringify(parsed.errors)}`);
  return parsed.fields;
}

// ---------- 信用卡：新增（POST /cards，CardCreate） ----------

/** 新增表單的預設狀態 + 使用者輸入（與 CardForm.initialValues() 對齊：顏色預設 #FF8800、其餘空白） */
const emptyCardForm: CardFormValues = {
  name: "",
  bank: "",
  last4: "",
  statementDay: "",
  dueDay: "",
  offsetMode: "auto",
  color: DEFAULT_CARD_COLOR,
  openingBilledUnpaid: "",
  openingUnbilled: "",
  openingAsOf: "",
};

// ABow 2026-09-24 在 Pages 上實際失敗的那一筆
cases.push({
  id: "card_create_pages_2026-09-24",
  schema: "CardCreate",
  scenario: "card_create",
  description: "新增卡片：自動推算偏移、預設顏色、期初未出帳 14530、基準日 2026-09-24（Pages 上實際失敗的資料）",
  payload: cardCreatePayload(cardFields({ ...emptyCardForm, name: "賴點卡", bank: "聯邦銀行", last4: "8209", statementDay: "27", dueDay: "11", openingUnbilled: "14530", openingAsOf: "2026-09-24" })),
});
cases.push({
  id: "card_create_minimal",
  schema: "CardCreate",
  scenario: "card_create",
  description: "新增卡片：只填必填欄位，顏色清除（null）、期初全空白（0）、無基準日",
  payload: cardCreatePayload(cardFields({ ...emptyCardForm, name: "主卡", bank: "台新", last4: "1234", statementDay: "1", dueDay: "20", color: "" })),
});
cases.push({
  id: "card_create_manual_offset_decimal_opening",
  schema: "CardCreate",
  scenario: "card_create",
  description: "新增卡片：手動覆寫偏移 0、自訂顏色、期初金額含千分位與小數",
  payload: cardCreatePayload(cardFields({ ...emptyCardForm, name: "旅遊卡", bank: "玉山", last4: "0007", statementDay: "31", dueDay: "5", offsetMode: "0", color: "#1e90ff", openingBilledUnpaid: "1,234.5", openingUnbilled: "0", openingAsOf: "2026-01-31" })),
});

// ---------- 信用卡：編輯（PUT /cards/{id}，CardUpdate） ----------

const activeCard: Card = {
  id: 1,
  name: "賴點卡",
  bank: "聯邦銀行",
  last4: "8209",
  statement_day: 27,
  due_day: 11,
  due_month_offset: 1,
  opening_billed_unpaid: 0,
  opening_unbilled: 14530,
  opening_as_of: "2026-09-24",
  color: "#FF8800",
  is_active: true,
};
const inactiveCard: Card = { ...activeCard, id: 2, name: "舊卡", last4: "9999", color: null, is_active: false };

/** 編輯表單開啟時的狀態（與 CardForm.initialValues(card) 對齊） */
function editFormFor(card: Card): CardFormValues {
  return {
    name: card.name,
    bank: card.bank,
    last4: card.last4,
    statementDay: String(card.statement_day),
    dueDay: String(card.due_day),
    offsetMode: "auto",
    color: card.color ?? "",
    openingBilledUnpaid: "",
    openingUnbilled: "",
    openingAsOf: "",
  };
}

cases.push({
  id: "card_edit_active",
  schema: "CardUpdate",
  scenario: "card_edit",
  description: "編輯啟用中的卡：改名、改繳款日、改顏色，偏移自動，is_active 沿用 true",
  payload: cardUpdatePayload(cardFields({ ...editFormFor(activeCard), name: "賴點卡（新）", dueDay: "15", color: "#00AA55" }), activeCard.is_active),
});
cases.push({
  id: "card_edit_inactive_manual_offset",
  schema: "CardUpdate",
  scenario: "card_edit",
  description: "編輯已停用的卡：手動覆寫偏移 1、清除顏色，is_active 沿用 false",
  payload: cardUpdatePayload(cardFields({ ...editFormFor(inactiveCard), offsetMode: "1", color: "" }), inactiveCard.is_active),
});

// ---------- 信用卡：停用／重新啟用（PUT /cards/{id}，CardUpdate，從既有卡片組出） ----------

cases.push({ id: "card_deactivate", schema: "CardUpdate", scenario: "card_deactivate", description: "停用：從既有卡片組出整筆 PUT，只翻 is_active", payload: cardUpdateFromCard(activeCard, { is_active: false }) });
cases.push({ id: "card_reactivate", schema: "CardUpdate", scenario: "card_reactivate", description: "重新啟用：從既有（已停用、無顏色）卡片組出整筆 PUT", payload: cardUpdateFromCard(inactiveCard, { is_active: true }) });

// ---------- 花費：新增（POST /expenses，ExpenseCreate） ----------

/** 首頁快速記帳的預設狀態（與 QuickEntryForm.defaults() 對齊；日期由頁面帶入今天） */
const emptyExpenseForm: ExpenseFormValues = {
  date: "2026-09-24",
  amountInput: "",
  refund: false,
  item: "",
  categoryId: null,
  paymentMethod: "cash",
  cardId: null,
  note: "",
};

cases.push({
  id: "expense_create_cash",
  schema: "ExpenseCreate",
  scenario: "expense_create_cash",
  description: "現金：最常見的一筆（金額、品項、分類），無備註",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "120", item: "午餐", categoryId: 1 })),
});
cases.push({
  id: "expense_create_credit_card",
  schema: "ExpenseCreate",
  scenario: "expense_create_credit_card",
  description: "信用卡：綁卡、金額含千分位與小數、有備註",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "1,299.5", item: "耳機", categoryId: 3, paymentMethod: "credit_card", cardId: 1, note: "特價" })),
});
cases.push({
  id: "expense_create_mobile_pay_with_card",
  schema: "ExpenseCreate",
  scenario: "expense_create_mobile_pay",
  description: "行動支付：有選卡（綁卡）",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "60", item: "飲料", categoryId: 1, paymentMethod: "mobile_pay", cardId: 1 })),
});
cases.push({
  id: "expense_create_mobile_pay_without_card",
  schema: "ExpenseCreate",
  scenario: "expense_create_mobile_pay",
  description: "行動支付：未選卡（card_id null）",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "60", item: "飲料", categoryId: 1, paymentMethod: "mobile_pay" })),
});
cases.push({
  id: "expense_create_transfer_stale_card_cleared",
  schema: "ExpenseCreate",
  scenario: "expense_create_transfer",
  description: "轉帳：狀態裡殘留上一筆的 cardId，送出時必須清成 null",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "3000", item: "房租", categoryId: 5, paymentMethod: "transfer", cardId: 1 })),
});
cases.push({
  id: "expense_create_refund",
  schema: "ExpenseCreate",
  scenario: "expense_create_refund",
  description: "退款：切換開啟 → 金額為負數",
  payload: expenseCreatePayload(expenseFields({ ...emptyExpenseForm, amountInput: "500", refund: true, item: "退貨", categoryId: 3, paymentMethod: "credit_card", cardId: 1 })),
});

// ---------- 花費：編輯（PUT /expenses/{id}，ExpenseUpdate） ----------

cases.push({
  id: "expense_edit_credit_card",
  schema: "ExpenseUpdate",
  scenario: "expense_edit",
  description: "編輯：信用卡、改日期與金額、備註留空（null）",
  payload: expenseUpdatePayload(expenseFields({ ...emptyExpenseForm, date: "2026-09-20", amountInput: "350", item: "晚餐", categoryId: 1, paymentMethod: "credit_card", cardId: 1, note: "  " })),
});
cases.push({
  id: "expense_edit_refund_cash",
  schema: "ExpenseUpdate",
  scenario: "expense_edit",
  description: "編輯：退款、改成現金（卡片欄位隱藏 → card_id null）",
  payload: expenseUpdatePayload(expenseFields({ ...emptyExpenseForm, date: "2026-09-18", amountInput: "80", refund: true, item: "退咖啡", categoryId: 1, paymentMethod: "cash", cardId: 1 })),
});

process.stdout.write(JSON.stringify({ generated_by: "frontend/scripts/payload-dump.ts", cases }) + "\n");
