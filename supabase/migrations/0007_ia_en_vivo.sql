-- CRM Asesor – estado en vivo de la IA (para el indicador "la IA está escribiendo…")
alter table public.conversaciones
  add column ia_pensando_desde timestamptz;  -- con valor mientras la IA prepara una respuesta

create index conversaciones_modo_idx on public.conversaciones (modo, ultimo_mensaje_at desc);
