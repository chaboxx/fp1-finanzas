// Cliente "Supabase" mínimo que traduce las llamadas de supabase-js a SQL sobre PGlite.
// Cada consulta corre como el rol `authenticated` con el usuario de la sesión, así que
// RLS, triggers y CHECKs se aplican exactamente igual que en producción.
// Solo implementa lo que usa la app: from().select/insert/update/upsert/delete con
// filtros eq, neq, gt, gte, lt, lte, in, is, not, order, range, limit, single,
// maybeSingle; y rpc().
import type { PGlite, Transaction } from "@electric-sql/pglite";

export type DbError = { code: string; message: string; details: string | null; hint: string | null };
type Result = { data: unknown; error: DbError | null; count?: number | null };

const ident = (name: string) => `"${name.trim().replace(/"/g, '""')}"`;

function toError(e: unknown): DbError {
  const x = e as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: x.code ?? "XX000", message: x.message ?? String(e), details: x.detail ?? null, hint: x.hint ?? null };
}

// JSON para objetos/arrays (parámetros jsonb); el resto tal cual.
const param = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

export async function runAs<T>(db: PGlite, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

type Condition = { col: string; op: string; value: unknown };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private returning: string | null = null;
  private rows: Record<string, unknown>[] = [];
  private onConflict?: string;
  private ignoreDuplicates = false;
  private where: Condition[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private offset?: number;
  private max?: number;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private db: PGlite,
    private userId: string | null,
    private table: string,
  ) {}

  select(columns = "*") {
    if (this.op === "select") this.columns = columns;
    else this.returning = columns;
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    this.onConflict = options.onConflict;
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates);
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.rows = [values];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private add(col: string, op: string, value: unknown) {
    this.where.push({ col, op, value });
    return this;
  }
  eq(col: string, v: unknown) { return this.add(col, "=", v); }
  neq(col: string, v: unknown) { return this.add(col, "<>", v); }
  gt(col: string, v: unknown) { return this.add(col, ">", v); }
  gte(col: string, v: unknown) { return this.add(col, ">=", v); }
  lt(col: string, v: unknown) { return this.add(col, "<", v); }
  lte(col: string, v: unknown) { return this.add(col, "<=", v); }
  in(col: string, v: unknown[]) { return this.add(col, "in", v); }
  is(col: string, v: null | boolean) { return this.add(col, "is", v); }
  not(col: string, op: string, v: unknown) { return this.add(col, "not " + op, v); }
  order(col: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: options.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private whereSql(params: unknown[]) {
    if (!this.where.length) return "";
    // Las listas de in()/not in() van como array de Postgres, no como JSON.
    const p = (v: unknown) => {
      params.push(Array.isArray(v) ? v : param(v));
      return `$${params.length}`;
    };
    const parts = this.where.map(({ col, op, value }) => {
      const c = ident(col);
      if (op === "in") return `${c} = any(${p(value)})`;
      if (op === "is") return `${c} is ${value === null ? "null" : value ? "true" : "false"}`;
      if (op === "not is") return `${c} is not ${value === null ? "null" : value ? "true" : "false"}`;
      if (op === "not in") {
        const list = String(value).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
        return `not (${c} = any(${p(list)}))`;
      }
      if (op.startsWith("not ")) throw new Error(`Filtro no soportado en el doble: ${op}`);
      return `${c} ${op} ${p(value)}`;
    });
    return " where " + parts.join(" and ");
  }

  private build(params: unknown[]) {
    const t = `public.${ident(this.table)}`;
    const ret = this.returning ? ` returning ${this.returning}` : "";
    if (this.op === "select") {
      let sql = `select ${this.columns} from ${t}${this.whereSql(params)}`;
      if (this.orders.length) sql += " order by " + this.orders.map((o) => `${ident(o.col)} ${o.asc ? "asc" : "desc"}`).join(", ");
      if (this.max !== undefined) sql += ` limit ${this.max}`;
      if (this.offset !== undefined) sql += ` offset ${this.offset}`;
      return sql;
    }
    if (this.op === "delete") return `delete from ${t}${this.whereSql(params)}${ret}`;
    if (this.op === "update") {
      const sets = Object.entries(this.rows[0])
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => {
          params.push(param(v));
          return `${ident(k)} = $${params.length}`;
        });
      return `update ${t} set ${sets.join(", ")}${this.whereSql(params)}${ret}`;
    }
    // insert / upsert
    const cols = [...new Set(this.rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
    const values = this.rows
      .map(
        (r) =>
          "(" +
          cols
            .map((c) => {
              if (r[c] === undefined) return "default";
              params.push(param(r[c]));
              return `$${params.length}`;
            })
            .join(", ") +
          ")",
      )
      .join(", ");
    let sql = `insert into ${t} (${cols.map(ident).join(", ")}) values ${values}`;
    if (this.op === "upsert") {
      const target = (this.onConflict ?? "id").split(",").map(ident).join(", ");
      const updates = cols.filter((c) => !(this.onConflict ?? "id").split(",").map((s) => s.trim()).includes(c));
      sql +=
        this.ignoreDuplicates || !updates.length
          ? ` on conflict (${target}) do nothing`
          : ` on conflict (${target}) do update set ` + updates.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ");
    }
    return sql + ret;
  }

  async execute(): Promise<Result> {
    const params: unknown[] = [];
    const sql = this.build(params);
    try {
      const rows = await runAs(this.db, this.userId, async (tx) => (await tx.query<Record<string, unknown>>(sql, params)).rows);
      const returnsRows = this.op === "select" || this.returning !== null;
      if (!returnsRows) return { data: null, error: null };
      if (this.mode === "many") return { data: rows, error: null };
      if (rows.length === 1) return { data: rows[0], error: null };
      if (rows.length === 0 && this.mode === "maybe") return { data: null, error: null };
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null },
      };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }

  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.execute().then(ok, fail);
  }
}

export function createFakeClient(db: PGlite, userId: string | null) {
  return {
    from: (table: string) => new Query(db, userId, table),
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
      const names = Object.keys(args).filter((k) => args[k] !== undefined);
      const params = names.map((k) => param(args[k]));
      const sql = `select * from public.${ident(fn)}(${names.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
      try {
        const res = await runAs(db, userId, (tx) => tx.query<Record<string, unknown>>(sql, params));
        // Función escalar: una sola columna con el nombre de la función.
        if (res.fields.length === 1 && res.fields[0].name === fn) return { data: res.rows[0]?.[fn] ?? null, error: null };
        return { data: res.rows, error: null };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    },
  };
}
