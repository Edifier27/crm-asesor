-- Cada número puede ser de una cuenta de WhatsApp (WABA) distinta: la de Gaby está en su propio portfolio de Meta
alter table public.numeros_whatsapp add column if not exists waba_id text;
