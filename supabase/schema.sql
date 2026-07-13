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
  selected_car text not null default 'golf_gti',
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

-- ---------- catálogo (espelha shared/cars.ts — todos free) ----------

insert into public.cars_catalog (id, name, class, price_coins, attrs) values
  ('beetle',      'VW Fusca',                'C', 0, '{"maxSpeedKmh":118}'),
  ('golf_gti',    'VW Golf GTI Mk1',         'C', 0, '{"maxSpeedKmh":152}'),
  ('jetta',       'VW Jetta',                'B', 0, '{"maxSpeedKmh":168}'),
  ('m3_e46',      'BMW M3 E46 GTR',          'A', 0, '{"maxSpeedKmh":208}'),
  ('skyline_r34', 'Nissan Skyline GT-R R34', 'A', 0, '{"maxSpeedKmh":200}'),
  ('supra_a90',   'Toyota Supra A90 LB',     'A', 0, '{"maxSpeedKmh":212}'),
  ('m4_g82',      'BMW M4 G82 ADRO',         'A', 0, '{"maxSpeedKmh":220}')
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
  -- libera o catálogo inteiro no cadastro
  insert into public.owned_cars (profile_id, car_id)
  select new.id, c.id from public.cars_catalog c
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- garante posse de carros free (migração + novos IDs)
create or replace function public.ensure_owned_free_cars()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  insert into public.owned_cars (profile_id, car_id)
  select auth.uid(), c.id
  from public.cars_catalog c
  where c.price_coins = 0
  on conflict do nothing;
end;
$$;

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

-- ---------- tuning (única via de gastar moedas em upgrades) ----------
-- Custos e níveis espelham shared/tuning.ts; o autoritativo é ESTE.

create or replace function public.upgrade_car(p_car_id text, p_category text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tuning jsonb;
  v_level int;
  v_base_cost int;
  v_cost int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  -- carros free entram automaticamente na garagem
  perform public.ensure_owned_free_cars();

  v_base_cost := case p_category
    when 'motor' then 400
    when 'turbo' then 500
    when 'pneus' then 300
    when 'suspensao' then 250
    when 'peso' then 350
    when 'cambio' then 300
    else null
  end;
  if v_base_cost is null then
    raise exception 'categoria inválida';
  end if;

  select tuning into v_tuning
  from owned_cars
  where profile_id = auth.uid() and car_id = p_car_id
  for update;
  if not found then
    raise exception 'carro não possuído';
  end if;

  v_level := coalesce((v_tuning ->> p_category)::int, 0);
  if v_level >= 3 then
    raise exception 'nível máximo atingido';
  end if;

  v_cost := v_base_cost * (v_level + 1);
  -- débito atômico; check (coins >= 0) barra saldo insuficiente
  update profiles set coins = coins - v_cost where id = auth.uid();

  update owned_cars
  set tuning = jsonb_set(coalesce(v_tuning, '{}'), array[p_category], to_jsonb(v_level + 1))
  where profile_id = auth.uid() and car_id = p_car_id;
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


-- ======================================================================
-- FASE 2 — Time Trial, desafios diários e amigos
-- (Bloco idempotente: pode ser rodado sobre um schema Fase 1 já aplicado.)
-- ======================================================================

-- ---------- Time Trial: aceitar o modo nos resultados/ranking ----------
-- Sem isto, apply_race_result('timetrial', ...) viola o check e o servidor
-- falha ao creditar a corrida.
alter table public.race_results drop constraint if exists race_results_mode_check;
alter table public.race_results
  add constraint race_results_mode_check
  check (mode in ('circuit', 'drift', 'timetrial'));

-- ranking: circuit e timetrial são "menor é melhor" (tempo); drift é "maior".
create or replace view public.leaderboards as
select
  r.mode,
  r.track,
  r.profile_id,
  p.nick,
  case when r.mode in ('circuit', 'timetrial') then min(r.metric) else max(r.metric) end as best_metric,
  count(*) as races
from race_results r
join profiles p on p.id = r.profile_id
where r.validated
group by r.mode, r.track, r.profile_id, p.nick;

-- ---------- desafios diários ----------
-- Condições espelham shared/challenges.ts (o autoritativo é ESTE). O resgate
-- valida o progresso a partir de race_results de HOJE e credita uma única vez.

create table if not exists public.daily_claims (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id int not null,
  day date not null default current_date,
  reward int not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, challenge_id, day)
);

alter table public.daily_claims enable row level security;
drop policy if exists daily_claims_read on public.daily_claims;
create policy daily_claims_read on public.daily_claims for select using (profile_id = auth.uid());
-- escrita só via claim_daily (SECURITY DEFINER); nenhuma policy de insert p/ cliente.

create or replace function public.claim_daily(p_challenge_id int)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reward int;
  v_goal numeric;
  v_progress numeric;
begin
  if v_uid is null then
    raise exception 'não autenticado';
  end if;

  -- catálogo de desafios (espelha shared/challenges.ts)
  select reward, goal into v_reward, v_goal from (values
    (0, 150, 1),      -- vencer 1 corrida (circuit) hoje
    (1, 150, 8000),   -- 8.000 pontos de drift hoje
    (2, 100, 3)       -- completar 3 corridas (qualquer modo) hoje
  ) as c(id, reward, goal) where id = p_challenge_id;
  if v_reward is null then
    raise exception 'desafio inválido';
  end if;

  if exists (
    select 1 from daily_claims
    where profile_id = v_uid and challenge_id = p_challenge_id and day = current_date
  ) then
    raise exception 'já resgatado hoje';
  end if;

  v_progress := case p_challenge_id
    when 0 then (
      select count(*) from race_results
      where profile_id = v_uid and mode = 'circuit' and position = 1
        and created_at >= current_date)
    when 1 then (
      select coalesce(sum(metric), 0) from race_results
      where profile_id = v_uid and mode = 'drift'
        and created_at >= current_date)
    when 2 then (
      select count(*) from race_results
      where profile_id = v_uid and created_at >= current_date)
  end;

  if v_progress < v_goal then
    raise exception 'progresso insuficiente';
  end if;

  insert into daily_claims (profile_id, challenge_id, reward)
  values (v_uid, p_challenge_id, v_reward);
  update profiles set coins = coins + v_reward where id = v_uid;
  return v_reward;
end;
$$;

-- ---------- amigos (modelo "seguir": você adiciona pelo id do perfil) ----------

create table if not exists public.friendships (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, friend_id),
  check (profile_id <> friend_id)
);

alter table public.friendships enable row level security;
drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships for select using (profile_id = auth.uid());

create or replace function public.add_friend(p_friend_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not exists (select 1 from profiles where id = p_friend_id) then
    raise exception 'perfil inexistente';
  end if;
  insert into friendships (profile_id, friend_id)
  values (auth.uid(), p_friend_id)
  on conflict do nothing;
end;
$$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  delete from friendships where profile_id = auth.uid() and friend_id = p_friend_id;
end;
$$;
