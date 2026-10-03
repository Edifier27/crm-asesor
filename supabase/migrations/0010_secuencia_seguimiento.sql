-- CRM Asesor – secuencia de seguimiento: cuántas veces y cada cuánto insistir si el lead no responde
-- Ej.: {48,72,120} = primer mensaje a las 48 h, si no contesta otro a las 72 h y otro a los 5 días.
-- Si el lead responde, el contador vuelve a 0 (registrar_mensaje_entrante) y la secuencia arranca de nuevo.
alter table public.conversaciones
  add column seguimiento_cadencia integer[];
