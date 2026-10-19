-- 0060: carpeta "Importante" en Mis chats (Dario, 19-oct-2026). Los chats que el asesor manda ahi los gestiona el:
-- la IA no responde, no hay seguimientos, plantillas ni campanias, aunque la cuenta este en automatico.
-- Mandar a Importante = importante_at + ia_bloqueada (el candado "Sin IA" que ya respetan la IA y los seguimientos).
-- Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists importante_at timestamptz;
create index if not exists conversaciones_importante_idx on public.conversaciones (importante_at) where importante_at is not null;
