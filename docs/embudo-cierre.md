# Embudo de cierre: del "sí" al cobro (Darío, 9-nov-2026)

Cómo sigue la venta cuando el cliente dice que sí, para directos (particular, monotributo) y desregulados
(derivan aportes). Lo que hace la IA, lo que hace el asesor y lo que hace el script de Salesforce (Tampermonkey).

## 1. Filtro de salud (todos: directo y desregulado) — lo hace la IA
Cuando el cliente confirma, antes del link, la IA pregunta en un solo mensaje, por cada integrante:
medicación, preexistencias, peso y altura. Solo cuenta lo del último año ("me quebré hace 10 años" → "eso no hace
falta ponerlo, solo va lo del último año").

| Resultado | Qué pasa |
|---|---|
| Nada, o solo hipotiroidismo (T4), hipertensión, miopía, astigmatismo o hipermetropía | Pasa al asesor como **listo para cerrar** ("Salud OK") |
| Otra preexistencia u otra medicación | Pasa al asesor como **tema de salud**, con el detalle (iría a auditoría médica) |
| IMC mayor a 34,5 o menor a 18,1 | Pasa al asesor como **tema de salud** (con más de 34,5 va a auditoría) |
| Falta algún dato | La IA no puede pasarlo: tiene que preguntar lo que falta |

Código: `lib/ia/salud.js` (lo que sigue y lo que no) y `lib/ia/asesor.js` (prompt de CIERRE y control en `pasar_a_humano`).

## 2. Link de alta (primer link, el mismo para directo y desregulado)
1. El asesor pide el link desde la ficha; el script de Salesforce lo genera y el CRM lo manda con el texto de alta online.
2. Qué tiene que hacer el cliente en el link (audio 2):
   - poner el DNI;
   - completar el cuestionario de salud con la verdad (si no tiene nada de lo que pregunta, va "no");
   - elegir la forma de pago;
   - elegir la vigencia.

### Vigencia
| Tipo | Vigencia | Qué paga |
|---|---|---|
| Directo, vigencia inmediata | Desde que paga | Un proporcional del mes |
| Directo, mes siguiente | El 1 del mes que viene | El mes entero |
| Desregulado | Siempre el 1 del mes siguiente (hasta el último día del mes se puede dar el 1 del que viene; el 1 de diciembre ya es 1 de enero) | Nada: se impacta solo; después le llega la factura |

### Medios de pago (si pregunta)
Tarjeta de crédito, débito, Rapipago, Pago Fácil y billeteras digitales.

## 3. Directo: cobro
1. A las 24 h de completar el link se genera el **link de pago**: `linkBienvenida(DNI, N° de precarga)` en `lib/venta.js`.
   Como el CRM ya tiene el DNI y el N° de precarga, se lo puede mandar solo.
2. Tiene **20 días** para pagarlo. Cuando paga, empieza la cobertura (y recién ahí se comisiona).
3. Seguimiento:
   - **Vigencia inmediata**: link de pago a las 24 h; si no paga, "¿pudiste abonar?" (secuencia de cobro).
   - **Vigencia del mes siguiente**: link de pago a las 24 h; si sigue sin pagar, volver a escribirle en la
     **última semana del mes**, que es cuando ya tiene que pagar.

## 4. Desregulado: segundo link
1. Cuando completa el primer link, se le manda el **link genérico de desregulación** (el mismo para todos).
2. Ahí adjunta el **recibo de sueldo**, la **opción de cambio** y pone la **vigencia** y el **CUIT de la empresa**.
3. No paga: se impacta directamente.

## 5. Planilla de ventas
Solo entran las ventas ya hechas: **impactadas** o **en falta de cobro** (lo dice Salesforce). Una pestaña por mes.
Columnas: nombre y apellido, DNI, N° de precarga, plan, carga BU (lo que se comisiona), directo o desregulado,
estado (impactada / falta de cobro), fecha de venta. Se puede cargar a mano también.

## Qué ya hace el CRM solo (PR del 9-nov, lib/cobro.js)
1. La IA cierra la salud OK → el CRM pide el link de alta a la cola del script (`pedirLinkAutomatico`, con el DNI
   leído de la foto).
2. El script devuelve el link → el CRM se lo manda al cliente con los pasos según directo o desregulado.
3. Directo: a las 24 h hábiles le manda el link de pago (si tiene DNI y N° de precarga); a las 48 h, un
   "¿pudiste abonar?"; si sigue sin pagar, al asesor.

## Falta definir / pedirle a Darío
- [ ] El **link genérico de desregulación** (segundo link).
- [ ] Confirmar que el **link de pago** es `linkBienvenida(DNI, N° de precarga)` y que sale a las 24 h (hoy
      `SECUENCIA_COBRO` en `lib/venta.js` lo manda a las 48 h).
- [ ] Quién pide el link de alta cuando la IA deja al cliente "listo para cerrar": el asesor con el botón, o el
      CRM solo (pedido automático a la cola de Salesforce).
