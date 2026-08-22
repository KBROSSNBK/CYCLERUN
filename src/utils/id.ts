/**
 * Identificadores de carrera.
 * Van prefijados con la marca temporal en base 36 para que ordenen de forma
 * natural tanto en Firestore como en IndexedDB, y llevan una parte aleatoria
 * que evita colisiones si se generan dos en el mismo milisegundo.
 */
export function createId(): string {
  const time = Date.now().toString(36)
  return `${time}-${randomPart()}`
}

function randomPart(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(36).slice(2, 14)
}
