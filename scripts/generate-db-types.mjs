import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { format } from "prettier";
const db = new PGlite();
await db.exec(
  "create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create role authenticated; create role anon;",
);
for (const name of readdirSync("supabase/migrations")
  .filter((n) => n.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
const enums = (
  await db.query(
    "select t.typname,e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid order by t.typname,e.enumsortorder",
  )
).rows;
const enumMap = {};
for (const e of enums) (enumMap[e.typname] ??= []).push(e.enumlabel);
const tsType = (c) =>
  enumMap[c.udt_name]
    ? enumMap[c.udt_name].map((x) => JSON.stringify(x)).join(" | ")
    : ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(
          c.udt_name,
        )
      ? "number"
      : c.udt_name === "bool"
        ? "boolean"
        : ["json", "jsonb"].includes(c.udt_name)
          ? "Json"
          : "string";
const tables = (
  await db.query(
    "select table_name,table_type from information_schema.tables where table_schema='public' order by table_name",
  )
).rows;
const output = { Tables: [], Views: [] };
for (const table of tables) {
  const cols = (
    await db.query(
      "select column_name,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      [table.table_name],
    )
  ).rows;
  const field = (c, mode) => {
    const triggerAccount =
      table.table_name === "transactions" &&
      c.column_name === "account_id" &&
      mode !== "Row";
    return (
      "        " +
      c.column_name +
      (mode === "Update" ||
      (mode === "Insert" &&
        (c.column_default !== null ||
          c.is_nullable === "YES" ||
          triggerAccount))
        ? "?"
        : "") +
      ": " +
      tsType(c) +
      (c.is_nullable === "YES" || triggerAccount ? " | null" : "") +
      ";"
    );
  };
  const parts = [
    "      Row: {",
    ...cols.map((c) => field(c, "Row")),
    "      };",
  ];
  if (table.table_type === "BASE TABLE")
    for (const mode of ["Insert", "Update"])
      parts.push(
        "      " + mode + ": {",
        ...cols.map((c) => field(c, mode)),
        "      };",
      );
  parts.push("      Relationships: [];");
  output[table.table_type === "BASE TABLE" ? "Tables" : "Views"].push(
    "    " + table.table_name + ": {\n" + parts.join("\n") + "\n    };",
  );
}
const funcs = {
  save_budget_plan:
    "{ Args: { p_month: string; p_total: number; p_allocations: Json }; Returns: string }",
  save_investment_entry:
    "{ Args: { p_operation: string; p_amount: number; p_request: string; p_investment?: string | null; p_category?: string | null; p_name?: string | null; p_platform?: string | null; p_account?: string | null; p_date?: string | null; p_description?: string | null; p_entry?: string | null; p_initial_capital?: number | null }; Returns: string }",
  generate_recurring_transactions:
    "{ Args: { p_until?: string; p_user?: string }; Returns: number }",
  suggest_descriptions:
    "{ Args: { p_query: string; p_limit?: number; p_type?: Database['public']['Enums']['transaction_type'] }; Returns: { description: string; type: Database['public']['Enums']['transaction_type']; category_id: string | null; account_id: string | null; amount_cents: number; uses: number }[] }",
};
writeFileSync(
  "src/lib/database.types.ts",
  "// Generado desde las migraciones: node scripts/generate-db-types.mjs\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: {\n  Tables: {\n" +
    output.Tables.join("\n") +
    "\n  };\n  Views: {\n" +
    output.Views.join("\n") +
    "\n  };\n  Functions: {\n" +
    Object.entries(funcs)
      .map(([k, v]) => "    " + k + ": " + v + ";")
      .join("\n") +
    "\n  };\n  Enums: {\n" +
    Object.entries(enumMap)
      .map(
        ([k, v]) =>
          "    " + k + ": " + v.map((x) => JSON.stringify(x)).join(" | ") + ";",
      )
      .join("\n") +
    "\n  };\n  CompositeTypes: Record<never, never>;\n} };\n",
);
writeFileSync(
  "src/lib/database.types.ts",
  await format(readFileSync("src/lib/database.types.ts", "utf8"), {
    parser: "typescript",
  }),
);
await db.close();
console.log("Tipos generados desde todas las migraciones.");
