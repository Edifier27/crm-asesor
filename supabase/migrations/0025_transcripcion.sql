-- CRM Asesor – Transcripción de audios (OpenAI)
-- Las notas de voz del cliente y del asesor se pasan a texto: se ven debajo del audio en el chat,
-- la IA las entiende (copiloto) y el modo aprendizaje aprende también de lo que se dice hablando.
alter table public.mensajes add column if not exists transcripcion text;
alter table public.mensajes add column if not exists transcripcion_intentos smallint not null default 0;
create index if not exists mensajes_sin_transcribir_idx on public.mensajes (creado_at)
  where tipo = 'audio' and transcripcion is null and media_path is not null;
