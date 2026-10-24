-- =============================================================================
-- Metas financieras para la pestaña Métricas.
--
-- Una fila por mes en que el usuario cambió sus metas. Para evaluar un mes se
-- usa la fila más reciente con effective_month <= ese mes: cambiar las metas
-- hoy no reescribe cómo se evaluaron los meses anteriores.
-- =============================================================================
create table public.financial_targets (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_month          date not null check (extract(day from effective_month) = 1),
  savings_rate_bps         integer not null default 2000 check (savings_rate_bps between 0 and 10000),
  monthly_investment_cents bigint not null default 0 check (monthly_investment_cents >= 0), -- 0 = sin meta
  emergency_months         integer not null default 6 check (emergency_months between 1 and 24),
  updated_at               timestamptz not null default now(),
  unique (user_id, effective_month)
);

alter table public.financial_targets enable row level security;
create policy "propio: leer" on public.financial_targets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "propio: crear" on public.financial_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "propio: editar" on public.financial_targets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Cuentas que cuentan para el fondo de emergencia (dinero disponible ya).
-- Las tarjetas de crédito nunca cuentan, aunque tengan este valor en true.
alter table public.accounts
  add column in_emergency_fund boolean not null default true;
