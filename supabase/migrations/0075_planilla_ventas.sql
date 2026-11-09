-- 0075: planilla de ventas por mes (Dario, 9-nov-2026: "que todas las ventas se empiecen a impactar, asi no las tengo
-- que cargar manualmente"). Una fila por venta, con lo que se comisiona: nombre, DNI, N° de precarga, plan, carga BU,
-- directo o desregulado, impactada o falta de cobro, fecha de la venta y vigencia.
--   · Las ventas del CRM entran solas: cuando un contacto tiene venta (boton "Venta hecha", link de alta enviado, etc.)
--     un trigger crea o actualiza su fila. El estado sigue a la etapa: Ganado = impactada, Falta de cobro = falta de cobro,
--     Perdido = baja (no se ve en la planilla salvo que se pida).
--   · Tambien se cargan a mano (ventas que no pasaron por el CRM). Lo que se corrige a mano no lo pisa el trigger.
--   · El mes de la planilla es el de la fecha de la venta.
-- Se puede correr mas de una vez.

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  cuenta uuid not null references public.perfiles (id),
  contacto_id uuid unique references public.contactos (id) on delete set null,
  nombre text,
  dni text,
  precarga text,
  plan text,
  carga_bu numeric,
  cuota numeric,
  tipo text check (tipo in ('directo', 'desregulado')),
  estado text not null default 'falta_de_cobro' check (estado in ('impactada', 'falta_de_cobro', 'baja')),
  fecha_venta date not null default current_date,
  vigencia date,
  notas text,
  editada_a_mano boolean not null default false,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists ventas_mes_idx on public.ventas (cuenta, fecha_venta);

alter table public.ventas enable row level security;
drop policy if exists "cada uno lo suyo" on public.ventas;
create policy "cada uno lo suyo" on public.ventas for all to authenticated
  using (public.es_miembro() and cuenta = auth.uid()) with check (public.es_miembro() and cuenta = auth.uid());

-- La cuenta se completa sola al cargar a mano
drop trigger if exists fijar_cuenta on public.ventas;
create trigger fijar_cuenta before insert on public.ventas for each row execute function public.fijar_cuenta_propia();

-- La venta del contacto → su fila en la planilla
create or replace function public.venta_a_planilla()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_etapa text;
  v_estado text;
  v_fecha date;
  v_tipo text;
begin
  if new.venta is null or new.venta->>'fecha' is null then
    return new;
  end if;
  select nombre into v_etapa from public.etapas where id = new.etapa_id;
  v_tipo := case when new.venta->>'tipo' in ('directo', 'desregulado') then new.venta->>'tipo' end;
  v_estado := case
    when v_etapa = 'Perdido' or new.venta->>'baja_at' is not null then 'baja'
    when v_etapa = 'Ganado' or new.venta->>'pagado_at' is not null then 'impactada'
    when v_etapa = 'Falta de cobro' then 'falta_de_cobro'
    when v_tipo = 'desregulado' then 'impactada'
    else 'falta_de_cobro'
  end;
  v_fecha := ((new.venta->>'fecha')::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date;

  insert into public.ventas (cuenta, contacto_id, nombre, dni, precarga, plan, cuota, tipo, estado, fecha_venta, vigencia)
  values (
    new.cuenta, new.id, new.nombre, nullif(new.venta->>'dni', ''), nullif(new.venta->>'precarga', ''),
    coalesce(new.venta->>'plan', new.plan_cotizado), nullif(new.venta->>'monto', '')::numeric, v_tipo, v_estado, v_fecha,
    -- Desregulado: la vigencia es siempre el 1 del mes siguiente a la venta
    case when v_tipo = 'desregulado' then (date_trunc('month', v_fecha) + interval '1 month')::date end
  )
  on conflict (contacto_id) do update set
    -- El estado sigue siempre a la venta; lo demás solo se completa si está vacío y la fila no se corrigió a mano
    estado = excluded.estado,
    dni = coalesce(public.ventas.dni, excluded.dni),
    precarga = coalesce(public.ventas.precarga, excluded.precarga),
    nombre = case when public.ventas.editada_a_mano then public.ventas.nombre else coalesce(public.ventas.nombre, excluded.nombre) end,
    plan = case when public.ventas.editada_a_mano then public.ventas.plan else coalesce(excluded.plan, public.ventas.plan) end,
    cuota = case when public.ventas.editada_a_mano then public.ventas.cuota else coalesce(excluded.cuota, public.ventas.cuota) end,
    tipo = coalesce(public.ventas.tipo, excluded.tipo),
    vigencia = coalesce(public.ventas.vigencia, excluded.vigencia),
    actualizado_at = now();
  return new;
end $$;

drop trigger if exists contactos_venta_a_planilla on public.contactos;
create trigger contactos_venta_a_planilla
  after insert or update of venta, etapa_id on public.contactos
  for each row execute function public.venta_a_planilla();

-- Las ventas que ya estaban en el CRM
update public.contactos set venta = venta where venta->>'fecha' is not null;

notify pgrst, 'reload schema';

-- Control: ventas por mes y estado en cada CRM
select p.nombre as crm, to_char(v.fecha_venta, 'YYYY-MM') as mes, v.estado, count(*) as ventas
  from public.ventas v left join public.perfiles p on p.id = v.cuenta
 group by 1, 2, 3 order by 1, 2, 3;
