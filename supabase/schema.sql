-- Race Flow — schema Fase 1
-- Aplicar no SQL Editor do Supabase (ou supabase db push).
-- Princípio: cliente LÊ; saldo/itens/resultados só são escritos por
-- função SECURITY DEFINER ou pelo service role (servidor de jogo).

-- ---------- tabelas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nick text not null,
  avatar text,
  level int not null default 1,
  xp int not null default 0,
  coins int not null default 500 check (coins >= 0),
  selected_car text not null default 'vega',
  created_at timestamptz not null default now()
);

create table if not exists public.cars_catalog (
  id text primary key,
  name text not null,
  class text not null check (class in ('C', 'B', 'A', 'S')),
  price_coins int not null check (price_coins >= 0),
  attrs jsonb not null default '{}',
  cosmetic_only boolean not null default false
);

create table if not exists public.owned_cars (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  car_id text not null references public.cars_catalog (id),
  tuning jsonb not null default '{}',
  cosmetics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (profile_id, car_id)
);

create table if not exists public.race_results (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('circuit', 'drift')),
  track text not null,
  -- circuit: tempo total em ms (menor é melhor) · drift: pontos (maior é melhor)
  metric bigint not null,
  position int not null,
  coins_awarded int not null default 0,
  validated boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists race_results_leaderboard_idx
  on public.race_results (mode, track, metric);

-- ---------- catálogo (espelha shared/cars.ts — preço autoritativo é ESTE) ----------

insert into public.cars_catalog (id, name, class, price_coins, attrs) values
  ('vega',     'Vega',     'C', 0,    '{"maxSpeedKmh":138}'),
  ('falcao',   'Falcão',   'B', 1500, '{"maxSpeedKmh":168}'),
  ('tempesta', 'Tempesta', 'A', 4000, '{"maxSpeedKmh":198}')
on conflict (id) do update
  set name = excluded.name, class = excluded.class,
      price_coins = excluded.price_coins, attrs = excluded.attrs;

-- ---------- perfil automático no cadastro ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nick)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nick', ''), 'Piloto' || substr(new.id::text, 1, 4))
  );
  insert into public.owned_cars (profile_id, car_id) values (new.id, 'vega');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- compra de carro (única via de gastar moedas) ----------

create or replace function public.buy_car(p_car_id text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_price int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select price_coins into v_price from cars_catalog where id = p_car_id;
  if v_price is null then
    raise exception 'carro inexistente';
  end if;
  if exists (select 1 from owned_cars where profile_id = auth.uid() and car_id = p_car_id) then
    raise exception 'carro já possuído';
  end if;

  -- débito atômico; check (coins >= 0) impede saldo negativo em corrida concorrente
  update profiles set coins = coins - v_price where id = auth.uid();
  if not found then
    raise exception 'perfil não encontrado';
  end if;

  insert into owned_cars (profile_id, car_id) values (auth.uid(), p_car_id);
end;
$$;

-- ---------- crédito de resultado (SÓ o servidor de jogo, via service role) ----------

create or replace function public.apply_race_result(
  p_profile_id uuid,
  p_mode text,
  p_track text,
  p_metric bigint,
  p_position int,
  p_coins int
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into race_results (profile_id, mode, track, metric, position, coins_awarded)
  values (p_profile_id, p_mode, p_track, p_metric, p_position, p_coins);

  update profiles
  set coins = coins + greatest(p_coins, 0),
      xp = xp + 20 + greatest(p_coins, 0),
      level = 1 + floor((xp + 20 + greatest(p_coins, 0)) / 1000)
  where id = p_profile_id;
end;
$$;

-- cliente NÃO pode chamar o crédito
revoke execute on function public.apply_race_result from public, anon, authenticated;

-- ---------- leaderboard ----------

create or replace view public.leaderboards as
select
  r.mode,
  r.track,
  r.profile_id,
  p.nick,
  case when r.mode = 'circuit' then min(r.metric) else max(r.metric) end as best_metric,
  count(*) as races
from race_results r
join profiles p on p.id = r.profile_id
where r.validated
group by r.mode, r.track, r.profile_id, p.nick;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.cars_catalog enable row level security;
alter table public.owned_cars enable row level security;
alter table public.race_results enable row level security;

-- leitura: perfis públicos (nick/level p/ ranking), catálogo público,
-- carros próprios, resultados públicos
create policy profiles_read on public.profiles for select using (true);
create policy catalog_read on public.cars_catalog for select using (true);
create policy owned_read on public.owned_cars for select using (profile_id = auth.uid());
create policy results_read on public.race_results for select using (true);

-- escrita client-side: só colunas inofensivas do próprio perfil.
-- coins/xp/level ficam FORA do grant de coluna — imutáveis pelo cliente.
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (nick, avatar, selected_car) on public.profiles to authenticated;

-- owned_cars/race_results: nenhuma policy de insert/update/delete p/ cliente
-- (escrita só via buy_car/apply_race_result/service role).
