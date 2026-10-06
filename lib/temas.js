// Colores de la aplicación por persona (perfiles.tema). Los valores CSS viven en whatsapp.css.
export const TEMAS = [
  { id: 'verde', nombre: 'Verde', muestra: '#00A884', riel: '#11302C' },
  { id: 'rosa', nombre: 'Rosa viejo', muestra: '#A8677A', riel: '#3A2329' },
  { id: 'violeta', nombre: 'Violeta', muestra: '#7E57C2', riel: '#2A1A47' },
  { id: 'azul', nombre: 'Azul', muestra: '#1E88E5', riel: '#0F2A47' },
  { id: 'turquesa', nombre: 'Turquesa', muestra: '#00A3B4', riel: '#0D3236' },
  { id: 'coral', nombre: 'Coral', muestra: '#F06A3F', riel: '#45201A' }
];

export const temaValido = (t) => (TEMAS.some((x) => x.id === t) ? t : 'verde');
