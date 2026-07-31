// Almacén global del taller activo (sincrónico, para uso fuera de React)

export function getActiveWorkshopId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('activeWorkshopId') || '';
}

export function setActiveWorkshopIdStorage(id: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeWorkshopId', id);
  }
}

// Caché de la última lista de talleres obtenida con éxito. En una recarga
// dura (F5), useWorkshops() siempre arranca en [] hasta que resuelve la red
// — durante esa ventana, useActiveWorkshop() no encuentra el taller activo y
// cae al fallback 'MECHANIC', causando un parpadeo visible (nav, selector de
// taller) hacia contenido de Mecánica en talleres de Chapería. Usar esta
// caché como initialData de React Query cierra esa ventana: el primer render
// ya tiene datos reales (puede estar levemente desactualizado) mientras la
// query real refresca en background.
const WORKSHOPS_CACHE_KEY = 'workshopsCache';

export function getCachedWorkshops<T>(): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WORKSHOPS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCachedWorkshops<T>(workshops: T[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSHOPS_CACHE_KEY, JSON.stringify(workshops));
  } catch {
    // localStorage lleno o inaccesible — no es crítico, la query real sigue andando.
  }
}
