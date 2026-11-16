-- 0081: link de pago en la planilla de ventas (Dario, 16-nov-2026). El mail de Swiss "Pago de primera cuota" trae el link
-- de pago real; el CRM lo deja en la fila de la planilla. Desde ahi se manda con el boton "Enviar link de pago" y queda
-- marcado como enviado. A las 48 h (o a fin de mes si la vigencia es del mes que viene) la planilla avisa que hay que
-- preguntarle al socio si abono; "aviso_at" recuerda que ya se le pregunto. Se puede correr mas de una vez.

alter table public.ventas add column if not exists link_pago text;
alter table public.ventas add column if not exists link_pago_mail_at timestamptz;
alter table public.ventas add column if not exists link_pago_enviado_at timestamptz;
alter table public.ventas add column if not exists link_pago_aviso_at timestamptz;
alter table public.ventas add column if not exists monto_primera_cuota text;
alter table public.ventas add column if not exists vence_primera_cuota date;

notify pgrst, 'reload schema';

-- Control: ventas con link de pago, enviado y sin enviar
select count(*) filter (where link_pago is not null) as con_link,
       count(*) filter (where link_pago_enviado_at is not null) as enviados,
       count(*) filter (where link_pago is not null and link_pago_enviado_at is null) as por_enviar
  from public.ventas;
