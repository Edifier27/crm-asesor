import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import BotonSalir from './componentes/BotonSalir';
import Link from 'next/link';
import RielLinks from './RielLinks';
import RielPlegable from './RielPlegable';
import Avisos from './componentes/Avisos';
import ReproductorGlobal from './componentes/ReproductorGlobal';
import VersionNueva from './componentes/VersionNueva';
import { estadoUso } from '@/lib/uso';
import { temaValido } from '@/lib/temas';
import { SALDO_BAJO_USD, saldosIa } from '@/lib/costos';
import './panel.css';
import './whatsapp.css';

// Una sola lectura del perfil por pedido: la comparten el título de la pestaña y el layout
const perfilActual = cache(async () => {
  const supabase = await createClient();
  const { data: sesion } = await supabase.auth.getClaims();
  const user = { id: sesion?.claims?.sub, email: sesion?.claims?.email };
  const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  return { user, perfil };
});

/** Pestaña con el nombre de quien está adentro: "AsesorCRM - Chats Gaby" (para no confundir un CRM con otro). */
export async function generateMetadata() {
  const { perfil } = await perfilActual();
  const nombre = (perfil?.nombre ?? '').trim().split(/\s+/)[0];
  return { title: { template: nombre ? `AsesorCRM - %s ${nombre}` : 'AsesorCRM - %s', default: nombre ? `AsesorCRM - ${nombre}` : 'AsesorCRM' } };
}

export default async function PanelLayout({ children }) {
  const supabase = await createClient();
  const [{ user, perfil }, { data: usoTodos }] = await Promise.all([
    perfilActual(),
    supabase.from('uso_sistema').select('*').maybeSingle()
  ]);
  const inicial = (perfil?.nombre ?? user.email ?? '?').slice(0, 2).toUpperCase();
  // Aviso para pasar Supabase a Pro (solo lo ve el administrador)
  const uso = perfil?.rol === 'admin' ? usoTodos : null;
  const alerta = estadoUso(uso);
  // Crédito de IA casi agotado (solo lo ve el administrador)
  const sinCredito = perfil?.rol === 'admin'
    ? (await saldosIa(supabase).catch(() => [])).filter((s) => s.credito && s.queda < SALDO_BAJO_USD)
    : [];

  return (
    <div className="app" data-tema={temaValido(perfil?.tema)}>
      {alerta.nivel !== 'ok' && (
        <Link href="/equipo#uso" className={`aviso-uso ${alerta.nivel}`}>
          {alerta.nivel === 'urgente' ? '⚠ Supabase está casi lleno' : '⚠ Supabase al'} {alerta.max}%{alerta.nivel === 'urgente' ? ': pasá a Pro ya para no perder datos' : ': es momento de pasar a Pro'}
        </Link>
      )}
      {sinCredito.length > 0 && (
        <Link href="/equipo#creditos" className="aviso-uso urgente">
          ⚠ Queda poco crédito de {sinCredito.map((s) => (s.servicio === 'claude' ? 'Claude' : 'OpenAI')).join(' y ')}: cargá saldo para que la IA no se corte
        </Link>
      )}
      <RielPlegable>
        <div className="riel-marca" title="AsesorCRM">AC</div>
        <RielLinks esAdmin={perfil?.rol === 'admin'} />
        <div className="riel-espacio" />
        <Link href="/perfil" className="riel-usuario" title={`${user.email} · mi perfil y color`}>{inicial}</Link>
        <BotonSalir />
      </RielPlegable>
      {children}
      <Avisos />
      <ReproductorGlobal />
      <VersionNueva actual={process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'} usuarioId={user.id ?? null} />
    </div>
  );
}
