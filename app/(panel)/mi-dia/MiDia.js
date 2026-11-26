import Link from 'next/link';
import { colorAvatar, iniciales, nombreVisible } from '@/lib/formato';
import { pesos } from '@/lib/cotizador';

// Mi día (Darío, 26-nov-2026): una sola pantalla con lo que hay que hacer ahora, en vez de recorrer la bandeja, el embudo y la
// planilla. Sin estado ni efectos: recibe lo calculado por armarMiDia (lib/mi-dia.js). CSS: .midia-* en whatsapp-2025.css
const SIN_TEXTO = { audio: '🎤 Nota de voz', imagen: '📷 Foto', video: '🎥 Video', documento: '📄 Documento', ubicacion: '📍 Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumen = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : '');
const MAX_POR_SECCION = 8;

function Fila({ href, contacto, nombre, sub, subAlerta = false, derecha, derechaAlerta = false }) {
  return (
    <li>
      <Link href={href} className="midia-fila">
        <span className="avatar" style={colorAvatar(contacto?.telefono ?? nombre)}>{iniciales(contacto ?? { nombre })}</span>
        <span className="midia-textos">
          <strong>{contacto ? nombreVisible(contacto) : nombre}</strong>
          {sub ? <span className={subAlerta ? 'midia-alerta' : undefined}>{sub}</span> : null}
        </span>
        {derecha ? <span className={`midia-chip${derechaAlerta ? ' alerta' : ''}`}>{derecha}</span> : null}
      </Link>
    </li>
  );
}

function Seccion({ titulo, ayuda, cantidad, alerta = false, children }) {
  if (!cantidad) return null;
  return (
    <section className={`midia-seccion${alerta ? ' alerta' : ''}`}>
      <h2>{titulo} <span className="midia-cuenta">{cantidad}</span></h2>
      {ayuda ? <p className="selector-detalle">{ayuda}</p> : null}
      <ul className="midia-lista">{children}</ul>
      {cantidad > MAX_POR_SECCION ? <Link href="/bandeja" className="midia-mas">y {cantidad - MAX_POR_SECCION} más en Mis chats</Link> : null}
    </section>
  );
}

export default function MiDia({ datos, ahora }) {
  const { erroneos, esperan, hoy, cobros, resumen: mes, total } = datos;
  const fecha = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ahora));
  return (
    <main className="pagina midia">
      <div className="tablero-cabecera">
        <div>
          <h1>Mi día</h1>
          <p className="selector-detalle midia-fecha">{fecha.charAt(0).toUpperCase() + fecha.slice(1)} · {total ? `${total} ${total === 1 ? 'cosa' : 'cosas'} para hacer` : 'todo al día'}</p>
        </div>
        <Link href="/bandeja" className="boton-secundario">Mis chats</Link>
      </div>

      <Link href="/ventas/planilla" className="midia-cifras" aria-label="Ventas del mes: ver la planilla">
        <span><small>Ventas del mes</small><strong>{mes.ventas}</strong></span>
        <span><small>Impactadas</small><strong>{mes.impactadas}</strong></span>
        <span><small>Falta de cobro</small><strong>{mes.faltaDeCobro}</strong></span>
        <span><small>Carga BU</small><strong>{pesos(mes.cargaBU)}</strong></span>
      </Link>

      {total === 0 ? <p className="midia-vacio">Todo al día 🎉 No hay nada pendiente ahora.</p> : null}

      <Seccion titulo="Mensaje erróneo" cantidad={erroneos.length} alerta ayuda="No salió el último mensaje o el teléfono no es válido: corregilo en la ficha.">
        {erroneos.slice(0, MAX_POR_SECCION).map(({ c, motivo }) => (
          <Fila key={c.id} href={`/bandeja/${c.id}`} contacto={c.contacto} sub={motivo} subAlerta />
        ))}
      </Seccion>

      <Seccion titulo="Te esperan" cantidad={esperan.length} ayuda="Te escribieron y falta contestarles (primero los que hace más esperan).">
        {esperan.slice(0, MAX_POR_SECCION).map(({ c, espera }) => (
          <Fila key={c.id} href={`/bandeja/${c.id}`} contacto={c.contacto} sub={resumen(c.ultimo_mensaje_texto)} derecha={espera.texto} derechaAlerta={espera.larga} />
        ))}
      </Seccion>

      <Seccion titulo="Para hoy" cantidad={hoy.length} ayuda="Lo que dejaste programado para hoy o que ya venció.">
        {hoy.slice(0, MAX_POR_SECCION).map(({ c, paso, motivo }) => (
          <Fila key={c.id} href={`/bandeja/${c.id}`} contacto={c.contacto} sub={motivo} derecha={paso.texto} derechaAlerta={paso.vencido} />
        ))}
      </Seccion>

      <Seccion titulo="Falta de cobro" cantidad={cobros.length} ayuda="Ventas que todavía no impactaron: los que llevan 2 días o más van marcados.">
        {cobros.slice(0, MAX_POR_SECCION).map(({ v, dias, urgente, vigencia, chat }) => (
          <Fila key={v.id} href={chat ? `/bandeja/${chat}` : '/ventas/planilla'} nombre={v.nombre || 'Sin nombre'}
            sub={`${v.plan || 'Plan sin cargar'} · hace ${dias === 0 ? 'menos de 1 día' : `${dias} d`}${vigencia ? ` · ${vigencia}` : ''}`}
            derecha={urgente ? 'Reclamar' : null} derechaAlerta={urgente} />
        ))}
      </Seccion>
    </main>
  );
}
