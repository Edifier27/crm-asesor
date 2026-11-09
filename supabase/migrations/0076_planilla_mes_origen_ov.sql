-- 0076: planilla de ventas, segunda parte (Dario, 9-nov-2026). Se puede correr mas de una vez.
--   1) Mes de produccion: la produccion de un mes no siempre cierra el ultimo dia (la de octubre puede cerrar el 4, el 5 o
--      el 6 de noviembre). Se completa solo con el mes de la fecha de venta y se cambia a mano. Las pestanas filtran por el.
--   2) Origen del dato (Salesforce, PrepagaYa, Botmaker, Kommo, WhatsApp directo, Web...): el mismo del tablero de ventas.
--   3) Hecha por OV larga (onboarding): ventas que se hacen en el otro sistema; se marcan y se ven en otro color.

alter table public.ventas add column if not exists mes date;
update public.ventas set mes = date_trunc('month', fecha_venta)::date where mes is null;
create index if not exists ventas_mes_produccion_idx on public.ventas (cuenta, mes);

-- Al crearse (sola desde el CRM o a mano), el mes es el de la fecha de venta; despues solo cambia a mano
create or replace function public.ventas_mes_de_produccion()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.mes is null then
    new.mes := date_trunc('month', coalesce(new.fecha_venta, current_date))::date;
  else
    new.mes := date_trunc('month', new.mes)::date;
  end if;
  return new;
end $$;

drop trigger if exists ventas_mes_de_produccion on public.ventas;
create trigger ventas_mes_de_produccion before insert or update of mes on public.ventas
  for each row execute function public.ventas_mes_de_produccion();

-- 2) y 3) Origen y onboarding
alter table public.ventas add column if not exists origen text;
alter table public.ventas add column if not exists onboarding boolean not null default false;

-- Origen de las que ya estaban: el de la venta, o el que sale del lead (mismas reglas que lib/fuentes.js)
update public.ventas v set origen = coalesce(nullif(c.venta->>'origen', ''), case
    when c.origen_detalle ~* '^prepaga\s*ya' then 'PrepagaYa'
    when c.origen_detalle ~* '^kommo' then 'Kommo'
    when c.origen_detalle ~* '^sgc\M' then 'SGC'
    when c.origen_detalle ~* '^salesforce' then 'Salesforce'
    when c.origen_detalle ~* '^(botmaker|bot)\M' then 'Botmaker'
    when c.origen = 'whatsapp' then 'WhatsApp directo'
    when c.origen = 'manual' then 'Carga manual'
    when c.origen = 'web' then 'Web'
    when c.origen = 'swiss_medical' then 'Swiss Medical (otros)'
  end)
  from public.contactos c
 where c.id = v.contacto_id and v.origen is null;

-- La venta del contacto → su fila en la planilla (la de la 0075 + origen y onboarding)
create or replace function public.venta_a_planilla()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_etapa text; v_estado text; v_fecha date; v_tipo text;
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
  insert into public.ventas (cuenta, contacto_id, nombre, dni, precarga, plan, cuota, tipo, estado, fecha_venta, vigencia, origen, onboarding)
  values (
    new.cuenta, new.id, new.nombre, nullif(new.venta->>'dni', ''), nullif(new.venta->>'precarga', ''),
    coalesce(new.venta->>'plan', new.plan_cotizado), nullif(new.venta->>'monto', '')::numeric, v_tipo, v_estado, v_fecha,
    case when v_tipo = 'desregulado' then (date_trunc('month', v_fecha) + interval '1 month')::date end,
    nullif(new.venta->>'origen', ''), coalesce((new.venta->>'onboarding')::boolean, false)
  )
  on conflict (contacto_id) do update set
    estado = excluded.estado,
    dni = coalesce(public.ventas.dni, excluded.dni),
    precarga = coalesce(public.ventas.precarga, excluded.precarga),
    nombre = case when public.ventas.editada_a_mano then public.ventas.nombre else coalesce(public.ventas.nombre, excluded.nombre) end,
    plan = case when public.ventas.editada_a_mano then public.ventas.plan else coalesce(excluded.plan, public.ventas.plan) end,
    cuota = case when public.ventas.editada_a_mano then public.ventas.cuota else coalesce(excluded.cuota, public.ventas.cuota) end,
    tipo = coalesce(public.ventas.tipo, excluded.tipo),
    vigencia = coalesce(public.ventas.vigencia, excluded.vigencia),
    origen = coalesce(public.ventas.origen, excluded.origen),
    onboarding = public.ventas.onboarding or excluded.onboarding,
    actualizado_at = now();
  return new;
end $$;

notify pgrst, 'reload schema';

-- Control: ventas por mes de produccion y origen
select p.nombre as crm, to_char(v.mes, 'YYYY-MM') as mes_produccion, coalesce(v.origen, 'sin origen') as origen,
       count(*) filter (where v.onboarding) as por_onboarding, count(*) as ventas
  from public.ventas v left join public.perfiles p on p.id = v.cuenta
 group by 1, 2, 3 order by 1, 2, 3;
