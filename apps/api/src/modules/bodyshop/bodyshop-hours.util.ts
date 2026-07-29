/**
 * Único punto de la regla "horas de Pulida/Control Final por pieza".
 * Ver design: "Single shared pure helper" — el llamador canónico es
 * BodyshopService.create() (pieceCount → horas, una sola vez). NO
 * duplicar esta regla en otro lado.
 */

export const POLISH_HOURS_PER_PIECE = 0.5;
export const FINAL_CONTROL_FIXED_HOURS = 0.5;

/** POLISH (Pulida): 0.5h × cantidad de piezas. Nunca negativo. */
export function computePolishHours(pieceCount: number): number {
  const n = Math.max(0, Number(pieceCount) || 0);
  return n * POLISH_HOURS_PER_PIECE;
}

/** FINAL_CONTROL (Control Final): siempre 0.5h fijo por ingreso. */
export function computeFinalControlHours(): number {
  return FINAL_CONTROL_FIXED_HOURS;
}
