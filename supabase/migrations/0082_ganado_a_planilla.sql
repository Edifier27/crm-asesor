-- Ganado a mano -> planilla de ventas (Darío, 17-nov-2026).
-- Antes la fila de la planilla solo se creaba si el lead tenia datos de venta (fecha). Ahora, cuando el lead se pasa a la
-- etapa "Ganado" (a mano, ej. ventas hechas por onboarding) y no tiene venta cargada, entra igual: estado impactada,
-- fecha de venta = hoy, plan = el cotizado. La carga BU se calcula con la cotizacion y todo se corrige en la planilla.
-- Solo al CAMBIAR a Ganado (no al importar leads ya ganados).
create or replace function public.venta_a_planilla()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_etapa text; v_estado text; v_fecha date; v_tipo text; v_firme boolean;
begin
  select nombre into v_etapa from public.etapas where id = new.etapa_id;
  -- Sin datos de venta cargados: igual entra a la planilla si el lead se pasa a "Ganado" (a mano o por onboarding)
  if new.venta is null or new.venta->>'fecha' is null then
    if not (tg_op = 'UPDATE' and v_etapa = 'Ganado' and old.etapa_id is distinct from new.etapa_id) then
      return new;
    end if;
  end if;
  v_tipo := case when new.venta->>'tipo' in ('directo', 'desregulado') then new.venta->>'tipo' end;
  v_estado := case
    when v_etapa = 'Perdido' or new.venta->>'baja_at' is not null then 'baja'
    when v_etapa = 'Ganado' or new.venta->>'pagado_at' is not null then 'impactada'
    when v_etapa = 'Falta de cobro' then 'falta_de_cobro'
    when v_tipo = 'desregulado' then 'impactada'
    else 'falta_de_cobro'
  end;
  -- El lead ya se definio (ganado, pagado, perdido o baja): ahi si se sale de la auditoria medica
  v_firme := coalesce(v_etapa in ('Perdido', 'Ganado'), false) or new.venta->>'baja_at' is not null or new.venta->>'pagado_at' is not null;
  v_fecha := case when new.venta->>'fecha' is not null
    then ((new.venta->>'fecha')::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date
    else (now() at time zone 'America/Argentina/Buenos_Aires')::date end;
  insert into public.ventas (cuenta, contacto_id, nombre, dni, precarga, plan, cuota, tipo, estado, fecha_venta, vigencia, origen, onboarding)
  values (
    new.cuenta, new.id, new.nombre, nullif(new.venta->>'dni', ''), nullif(new.venta->>'precarga', ''),
    coalesce(new.venta->>'plan', new.plan_cotizado), nullif(new.venta->>'monto', '')::numeric, v_tipo, v_estado, v_fecha,
    case when v_tipo = 'desregulado' then (date_trunc('month', v_fecha) + interval '1 month')::date end,
    nullif(new.venta->>'origen', ''), coalesce((new.venta->>'onboarding')::boolean, false)
  )
  on conflict (contacto_id) do update set
    estado = case when public.ventas.estado = 'auditoria_medica' and not v_firme then public.ventas.estado else excluded.estado end,
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
