export const metadata = { title: 'Política de privacidad · DatoCRM' };

// Página pública que Meta exige para publicar la app de WhatsApp.
export default function Privacidad() {
  return (
    <main className="legal">
      <h1>Política de privacidad</h1>
      <p className="legal-fecha">Última actualización: 5 de octubre de 2026</p>

      <p>
        DatoCRM es la herramienta que usa el asesor comercial Darío Bettalio para atender por WhatsApp a las personas que consultan
        por planes de medicina prepaga. Esta política explica qué datos se tratan, para qué y cuáles son tus derechos, de acuerdo con
        la Ley 25.326 de Protección de Datos Personales de la República Argentina.
      </p>

      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Nombre, número de teléfono y los mensajes que nos enviás por WhatsApp.</li>
        <li>Los datos que nos das para cotizar: integrantes del grupo familiar, edades, provincia y situación laboral.</li>
        <li>La documentación que nos envíes para tramitar un alta (por ejemplo DNI, recibo de sueldo u opción de cambio de obra social).</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Responder tu consulta, armar cotizaciones y hacer el seguimiento comercial.</li>
        <li>Tramitar el alta en la cobertura que elijas.</li>
        <li>Enviarte, si no te opusiste, mensajes sobre planes y promociones. Podés pedir no recibir más mensajes en cualquier momento respondiendo &quot;No&quot;.</li>
      </ul>

      <h2>Con quién los compartimos</h2>
      <p>
        No vendemos ni cedemos tus datos. Se usan proveedores que hacen funcionar el servicio: Meta (WhatsApp), Supabase (base de datos),
        Vercel (alojamiento) y Anthropic (asistente que ayuda a ordenar la información). La documentación de un alta se comparte solo con la
        empresa de medicina prepaga elegida para tramitarla.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Las conversaciones se conservan mientras dure la relación comercial. La documentación personal (DNI, recibos, formularios) se borra
        automáticamente a los 90 días de cerrada la gestión.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceder, rectificar o eliminar tus datos escribiendo al mismo número de WhatsApp o a bettaliodario@gmail.com.
        La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos por
        incumplimiento de las normas de protección de datos personales.
      </p>

      <h2>Eliminación de datos</h2>
      <p>
        Para que eliminemos todos tus datos, escribinos &quot;Eliminar mis datos&quot; por WhatsApp o a bettaliodario@gmail.com.
        Lo hacemos dentro de los 10 días hábiles y te confirmamos por el mismo medio.
      </p>
    </main>
  );
}
