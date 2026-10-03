export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, boxShadow: '0 1px 3px #0001' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0B6E5F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>CRM</div>
        <h1 style={{ fontSize: 22, margin: '16px 0 8px' }}>CRM Asesor</h1>
        <p style={{ color: '#4A5753', margin: 0, lineHeight: 1.5 }}>Proyecto creado. Webhook de WhatsApp listo en /api/whatsapp. Próximo paso: login, base de datos y bandeja de chats.</p>
      </div>
    </main>
  );
}
