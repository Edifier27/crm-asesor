-- 0053: "La IA no toca este chat" (Dario, 13-oct-2026). Un chat que esta trabajando el asesor queda fuera de la IA
-- aunque la cuenta pase a automatico (por ejemplo un fin de semana): la IA no le responde, no le manda seguimientos ni
-- plantillas y no le cambia la ficha, la etapa ni las etiquetas. Se pone y se saca desde el menu del chat.
-- Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists ia_bloqueada boolean not null default false;

-- Control
select count(*) filter (where ia_bloqueada) as bloqueados, count(*) as chats from public.conversaciones;
