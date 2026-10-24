// Postgres en memoria (PGlite) con TODAS las migraciones reales de supabase/migrations
// y lo mínimo que Supabase agrega por fuera: auth.users, auth.uid() y los roles.
import { PGlite, types } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dirname, "..", "..", "supabase", "migrations");

export async function createTestDb() {
  // Mismos tipos que devuelve Supabase por HTTP: fechas como texto, enteros como number.
  const db = new PGlite({
    parsers: {
      [types.DATE]: (v: string) => v,
      [types.TIMESTAMP]: (v: string) => v,
      [types.TIMESTAMPTZ]: (v: string) => v,
      [types.INT8]: (v: string) => Number(v),
      [types.NUMERIC]: (v: string) => Number(v),
    },
  });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    create role anon nologin;
    create role service_role nologin bypassrls;
    grant usage on schema auth to authenticated, service_role;
  `);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public to authenticated, service_role;
    grant all on all tables in schema public to authenticated, service_role;
    grant execute on all functions in schema public to authenticated, service_role;
  `);
  return db;
}

export type TestUser = { id: string; email: string };

export async function createUser(db: PGlite, email: string): Promise<TestUser> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

// Hoy en Lima según la base (lo mismo que usa user_today()).
export async function dbToday(db: PGlite): Promise<string> {
  const r = await db.query<{ d: string }>("select (now() at time zone 'America/Lima')::date::text d");
  return r.rows[0].d;
}
