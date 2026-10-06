'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TEMAS } from '@/lib/temas';

export default function Perfil({ id, email, nombreInicial, temaInicial }) {
  const router = useRouter();
  const [tema, setTema] = useState(temaInicial);
  const [aviso, setAviso] = useState('');

  async function guardar(campos, previo) {
    const { error } = await createClient().from('perfiles').update(campos).eq('id', id);
    if (error) { previo?.(); setAviso('No se pudo guardar'); return; }
    setAviso('Guardado');
    setTimeout(() => setAviso(''), 2000);
    router.refresh();
  }

  function elegir(t) {
    const anterior = tema;
    const app = document.querySelector('.app');
    // Se ve al instante; si falla el guardado vuelve al color anterior
    setTema(t); if (app) app.dataset.tema = t;
    guardar({ tema: t }, () => { setTema(anterior); if (app) app.dataset.tema = anterior; });
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1>Mi perfil</h1>
        <p>{email}</p>
      </header>

      <section className="tarjeta">
        <label className="campo">
          <span>Tu nombre</span>
          <input defaultValue={nombreInicial} placeholder="Cómo te ve el equipo" maxLength={60}
            onBlur={(e) => e.target.value.trim() !== nombreInicial && guardar({ nombre: e.target.value.trim() || null })} />
        </label>
      </section>

      <section className="tarjeta">
        <h2>Color de tu aplicación</h2>
        <p className="selector-detalle">Solo cambia cómo la ves vos. Los clientes no ven ninguna diferencia.</p>
        <div className="temas" role="radiogroup" aria-label="Color de la aplicación">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tema === t.id}
              className={`tema-opcion${tema === t.id ? ' activo' : ''}`} onClick={() => elegir(t.id)}>
              <span className="tema-muestra" style={{ background: `linear-gradient(135deg, ${t.riel} 0 50%, ${t.muestra} 50% 100%)` }} />
              {t.nombre}
            </button>
          ))}
        </div>
        {aviso && <p className="pp-aviso" role="status">{aviso}</p>}
      </section>

      <section className="tarjeta">
        <h2>Contraseña</h2>
        <Link href="/bienvenida" className="boton-secundario">Cambiar contraseña</Link>
      </section>
    </div>
  );
}
