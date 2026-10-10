# Diseño igual a WhatsApp: valores reales y análisis

Relevado el 2026-10-10 de la hoja de estilos de **web.whatsapp.com** (sistema de diseño WDS, tema por defecto
claro, clase `.xfmqtgv`). WhatsApp no publica estos valores: se leyeron de la página en vivo. Pueden cambiar sin aviso.

## Tipografía
- Fuente: **Roboto** (variable). Ya no usa Segoe UI.
- Escala (rem = 16 px):
  | Uso | Tamaño | Interlineado | Peso |
  |---|---|---|---|
  | Cuerpo (texto de mensajes, campo de escribir) | 15 px (.9375rem) | 1.2667 (19 px) | 400 |
  | Chico (vista previa, citas, fechas) | 13 px (.8125rem) | 1.3077 (17 px) | 400 / 500 |
  | Títulos de lista y cabecera | 17 px (1.063rem) | 1.2941 (22 px) | 400 |
  | Etiqueta mínima (hora del mensaje, contador) | 11 px (.6875rem) | 1.4545 (16 px) | 500 |
  | Título de pantalla ("Chats") | 24 px (1.5rem) | 1.1667 | 600 |

## Colores (modo claro)
| Rol | Valor |
|---|---|
| Acento (botones, verde de marca) | `#1DAA61` |
| Acento suave (filtro elegido, burbuja propia) | `#D9FDD3` |
| Acento fuerte (texto sobre acento suave) | `#15603E` |
| Acción / links | `#1B8755` |
| Texto | `#0A0A0A` |
| Texto secundario (horas, vistas previas) | `rgba(0,0,0,.6)` |
| Burbuja entrante | `#FFFFFF` |
| Burbuja saliente | `#D9FDD3` |
| Fondo del chat | `#F5F1EB`, dibujos `#EAE0D3` |
| Barras y bandeja (fondo de paneles) | `#F7F5F3` |
| Campo de escribir | `#FFFFFF` |
| Buscador / chip elegido | `#F1EEEB` |
| Fila activa / hover | `rgba(194,189,184,.15)` |
| Divisores | `rgba(0,0,0,.1)` |
| Contador sin leer / "en línea" | `#25D366` |
| Tildes de leído | `#007BFC` |
| Aviso de sistema (cifrado) | `#FFF0D4` |
| Burbuja de sistema (fechas) | `rgba(255,255,255,.9)` |
| Error | `#EA0038` |

Avatares sin foto (fondo / letra): gris `#EEEEEE/#757778`, cobalto `#D2E8FE/#0063CB`, verde `#D9FDD3/#1B8755`,
naranja `#FEE2D8/#C4532D`, rosa `#FFDAE7/#D42A66`, violeta `#E8E0FF/#5E47DE`, celeste `#CAECFA/#027EB5`,
turquesa `#CBF2EE/#028377`, amarillo `#FFF0D4/#9D6C2C`, marrón `#F4DED1/#855538`.

## Formas
- Burbuja: radio 7.5 px (con colita en la primera del grupo).
- Chips de filtro: píldora (radio 100 px). Botones: 18–22 px. Tarjetas: 16 px. Menús: 12 px.
- Campo de escribir: píldora blanca (radio ~24 px) flotando sobre la bandeja.

## API de WhatsApp (Cloud API)
- "Escribiendo…" y tilde azul: `POST /{phone_number_id}/messages` con
  `{ messaging_product: 'whatsapp', status: 'read', message_id, typing_indicator: { type: 'text' } }`.
  Marca el mensaje como leído y muestra "escribiendo…" hasta que respondés o 25 s. Mandarlo solo si se va a responder.
- Sin `typing_indicator` solo marca como leído.

## Qué cambia en el CRM (análisis)
1. Fuente Roboto, escala 15/13/17/11 y colores WDS en lista, cabecera, burbujas y campo de escribir.
2. Fecha flotante arriba al desplazarse por el chat.
3. Franja "N mensajes no leídos" al abrir un chat con mensajes nuevos (y abre ahí, no al final).
4. Citas con el nombre real; tocar una cita lleva al mensaje original y lo resalta.
5. Cabecera más limpia: íconos (buscar, menú ⋮) en vez de botones de texto.
6. Mensajes de la IA: marca chica en la burbuja en vez del rótulo "Asesor IA".
7. Buscar dentro del chat (panel lateral con resultados).
8. Fijar chats arriba de la lista y archivar (vuelve a la lista si el cliente escribe).
9. Destacar mensajes con estrella y verlos en un panel.
10. Reenviar un mensaje o archivo a otro chat (marca "Reenviado").
11. Arrastrar y soltar archivos: ya estaba.
12. Panel "Archivos, enlaces y documentos" del chat.
13. Tilde azul al abrir el chat y "escribiendo…" mientras escribís vos o la IA.
