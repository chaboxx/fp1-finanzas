export type AccountType = "cash" | "debit" | "credit" | "savings";
export type CategoryKind = "expense" | "income" | "investment";
export type TransactionType = "expense" | "income" | "transfer" | "invest" | "divest";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Tarjeta de crédito",
  savings: "Ahorro",
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Gastos",
  income: "Ingresos",
  investment: "Inversiones",
};

// Fila de la vista account_balances + datos de accounts.
export type AccountWithBalance = {
  id: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  initial_balance_cents: number;
  balance_cents: number;
};

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  is_active: boolean;
};

// Paleta para categorías (legible en modo claro y oscuro).
export const CATEGORY_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#64748b", "#84cc16",
];

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  is_active: boolean;
};

// Movimiento tal como lo edita el formulario.
export type Movement = {
  id: string;
  type: TransactionType;
  amount_cents: number;
  occurred_on: string;
  description: string | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
};
