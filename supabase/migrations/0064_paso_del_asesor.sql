-- 0064: el proximo paso que programa el asesor a mano no lo pisa nadie (Dario, 20-oct-2026: Gaby programo a Mirta para
-- el mes que viene, Mirta contesto "gracias" y la IA lo reprogramo a 9 dias). Mientras no llegue esa fecha, ni la IA ni
-- las secuencias automaticas lo cambian; solo el asesor, o la IA si el cliente acuerda otra fecha concreta.
-- Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists seguimiento_por_asesor boolean not null default false;

notify pgrst, 'reload schema';

-- Control
select count(*) filter (where seguimiento_por_asesor) as programados_por_el_asesor, count(*) as chats from public.conversaciones;
