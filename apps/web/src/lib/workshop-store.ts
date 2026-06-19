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
