export const metadata = { title: 'Eliminación de datos · AsesorCRM' };

// Página pública con las instrucciones para pedir la eliminación de datos (la exige Meta).
export default function EliminarDatos() {
  return (
    <main className="legal">
      <h1>Cómo pedir la eliminación de tus datos</h1>
      <p className="legal-fecha">Última actualización: 5 de octubre de 2026</p>

      <p>
        Si te comunicaste por WhatsApp con el asesor comercial Darío Bettalio y querés que eliminemos tus datos personales
        (nombre, teléfono, mensajes, datos de cotización y documentación), podés pedirlo de cualquiera de estas formas:
      </p>
      <ol>
        <li>Escribí <strong>&quot;Eliminar mis datos&quot;</strong> por WhatsApp al mismo número con el que hablaste con nosotros.</li>
        <li>O mandá un correo a <strong>bettaliodario@gmail.com</strong> con el asunto &quot;Eliminar mis datos&quot; y el número de teléfono con el que nos escribiste.</li>
      </ol>
      <p>
        Eliminamos tus datos dentro de los 10 días hábiles y te confirmamos por el mismo medio. Solo conservamos lo que una ley nos
        obligue a guardar, y te lo informamos.
      </p>
      <p>
        Más información en nuestra <a href="/privacidad">política de privacidad</a>.
      </p>
    </main>
  );
}
