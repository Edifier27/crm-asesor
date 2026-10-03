-- CRM Asesor – respuestas citadas, reacciones, correcciones y mensajes editados/eliminados por el cliente

alter table public.mensajes
  add column responde_a uuid references public.mensajes (id) on delete set null,  -- mensaje citado
  add column reacciones jsonb not null default '{}'::jsonb,                        -- { "contacto": "👍", "asesor": "❤️" }
  add column editado_at timestamptz,          -- el cliente lo editó en WhatsApp
  add column texto_original text,             -- texto antes de la edición
  add column eliminado_at timestamptz,        -- el cliente lo eliminó para todos
  add column corregido_por uuid references public.mensajes (id) on delete set null; -- corrección enviada por el asesor

create index mensajes_responde_a_idx on public.mensajes (responde_a) where responde_a is not null;
