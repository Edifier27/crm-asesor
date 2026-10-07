-- CRM Asesor - Conexion de Meta por numero: un numero que esta en otro portfolio de Meta (Gaby) usa su propia app
-- y token (variables WHATSAPP_TOKEN_<CONEXION> y WHATSAPP_APP_SECRET_<CONEXION> en Vercel). Vacio = la de Dario.
alter table public.numeros_whatsapp add column if not exists conexion text;
