/**
 * Generador de iconos PWA.
 *
 * Dibuja el icono de CYCLERUN por software y escribe PNG validos usando solo
 * `zlib`, que forma parte de Node. Asi el repositorio no necesita binarios
 * comprometidos ni una dependencia de tratamiento de imagen para algo que se
 * ejecuta una vez.
 *
 *   npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [11, 15, 20]
const BG_LIGHT = [18, 26, 36]
const ACCENT = [0, 229, 160]
const ACCENT_DIM = [0, 170, 120]

/** Distancia de un punto al segmento AB, para dibujar barras redondeadas. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function mix(base, color, alpha) {
  return [
    Math.round(base[0] + (color[0] - base[0]) * alpha),
    Math.round(base[1] + (color[1] - base[1]) * alpha),
    Math.round(base[2] + (color[2] - base[2]) * alpha),
  ]
}

/** Cobertura suavizada: 1 dentro de la forma, 0 fuera, degradado en el borde. */
function coverage(distance, radius, feather = 1.2) {
  return Math.max(0, Math.min(1, (radius - distance) / feather + 0.5))
}

/**
 * Bicicleta estilizada: dos ruedas, cuadro, manillar y sillin.
 * `inset` reduce el dibujo para dejar la zona segura de los iconos maskable.
 */
function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 512
  const safe = maskable ? 0.76 : 1
  const cx = size / 2
  const cy = size / 2

  // Geometria de la bicicleta en un lienzo de referencia de 512 px.
  const unit = (value) => value * scale * safe
  const rearX = cx - unit(112)
  const frontX = cx + unit(112)
  const wheelY = cy + unit(52)
  const wheelR = unit(84)
  const wheelW = unit(15)

  const cranks = [cx - unit(6), cy + unit(52)]
  const seat = [cx - unit(46), cy - unit(52)]
  const bars = [cx + unit(62), cy - unit(58)]
  const head = [cx + unit(96), cy - unit(6)]

  const frame = [
    [cranks, seat],
    [seat, bars],
    [bars, head],
    [cranks, head],
    [seat, cranks],
    [rearX, wheelY, cranks[0], cranks[1]],
    [rearX, wheelY, seat[0], seat[1]],
    [head[0], head[1], frontX, wheelY],
    [bars[0] - unit(26), bars[1] - unit(6), bars[0] + unit(16), bars[1] - unit(2)],
    [seat[0] - unit(24), seat[1] - unit(10), seat[0] + unit(12), seat[1] - unit(10)],
  ]

  const bars2 = frame.map((item) =>
    Array.isArray(item[0]) ? [item[0][0], item[0][1], item[1][0], item[1][1]] : item,
  )

  const barWidth = unit(9)
  const cornerRadius = size * 0.22

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      // Fondo: rectangulo redondeado (o cuadrado completo si es maskable).
      let color
      let alpha = 1
      if (maskable) {
        color = mix(BG, BG_LIGHT, py / size)
      } else {
        const qx = Math.abs(px - cx) - (size / 2 - cornerRadius)
        const qy = Math.abs(py - cy) - (size / 2 - cornerRadius)
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - cornerRadius
        alpha = coverage(outside, 0, 1.5)
        color = mix(BG, BG_LIGHT, py / size)
      }

      // Ruedas.
      const rearDistance = Math.abs(Math.hypot(px - rearX, py - wheelY) - wheelR)
      const frontDistance = Math.abs(Math.hypot(px - frontX, py - wheelY) - wheelR)
      const wheel = Math.max(
        coverage(rearDistance, wheelW / 2),
        coverage(frontDistance, wheelW / 2),
      )
      if (wheel > 0) color = mix(color, ACCENT, wheel)

      // Cuadro.
      let frameCover = 0
      for (const [ax, ay, bx, by] of bars2) {
        frameCover = Math.max(frameCover, coverage(segmentDistance(px, py, ax, ay, bx, by), barWidth / 2))
      }
      if (frameCover > 0) color = mix(color, ACCENT, frameCover)

      // Bujes.
      const hubs = Math.max(
        coverage(Math.hypot(px - rearX, py - wheelY), unit(11)),
        coverage(Math.hypot(px - frontX, py - wheelY), unit(11)),
        coverage(Math.hypot(px - cranks[0], py - cranks[1]), unit(15)),
      )
      if (hubs > 0) color = mix(color, ACCENT_DIM, hubs)

      const offset = (y * size + x) * 4
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }

  return pixels
}

// ------------------------------------------------------------------ PNG basico

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits por canal
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // Cada fila lleva delante su byte de filtro (0 = sin filtro).
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const target of targets) {
  const pixels = drawIcon(target.size, { maskable: target.maskable })
  writeFileSync(resolve(OUT_DIR, target.file), encodePng(pixels, target.size))
  console.log(`✓ ${target.file} (${target.size}×${target.size})`)
}
