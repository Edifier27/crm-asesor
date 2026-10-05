-- CRM Asesor – Notas de voz escuchadas (como WhatsApp): micrófono verde hasta que se escucha, azul después.
--   Audio del asesor: lo escuchó el cliente (Meta avisa "played").
--   Audio del cliente: lo escuchó el asesor en el CRM.
alter table public.mensajes add column escuchado_at timestamptz;
