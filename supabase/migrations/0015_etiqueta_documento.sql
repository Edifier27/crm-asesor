-- CRM Asesor – Nombre corto de cada documento ("DNI TITULAR", "RECIBO DE SUELDO (Juan Pérez)"…)
-- Lo propone la IA al leerlo y el asesor lo puede cambiar. Reemplaza en el chat la descripción larga del archivo.
alter table public.documentos_cliente
  add column etiqueta text,
  add column persona text check (persona in ('titular', 'conyuge', 'hijo', 'otro'));
