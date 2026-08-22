# 🚴 CYCLERUN

Registra tus carreras en bicicleta mediante GPS.

Aplicación web instalable (PWA) que utiliza el GPS real del teléfono para
registrar un recorrido, calcular distancia, velocidades, tiempos y desnivel, y
guardarlo en la nube. Pensada para usarse **mientras se pedalea**: números
grandes, alto contraste, botones a los que se acierta sin mirar y
funcionamiento sin conexión.

- **Repositorio:** https://github.com/KBROSSNBK/CYCLERUN
- **Aplicación:** https://kbrossnbk.github.io/CYCLERUN/

---

## Índice

1. [Qué hace](#1-qué-hace)
2. [Tecnologías](#2-tecnologías)
3. [Instalación](#3-instalación)
4. [Configurar Firebase](#4-configurar-firebase)
5. [Ejecutar en local](#5-ejecutar-en-local)
6. [Compilar](#6-compilar)
7. [Desplegar en GitHub Pages](#7-desplegar-en-github-pages)
8. [Instalar como aplicación en el móvil](#8-instalar-como-aplicación-en-el-móvil)
9. [Amigos y ubicación en vivo](#9-amigos-y-ubicación-en-vivo)
10. [Limitaciones del GPS](#10-limitaciones-del-gps)
11. [Permisos necesarios](#11-permisos-necesarios)
12. [Arquitectura](#12-arquitectura)
13. [Pruebas](#13-pruebas)

---

## 1. Qué hace

**Durante la carrera**

- Espera a tener una señal GPS utilizable antes de empezar a registrar.
- Velocidad instantánea, media, máxima, distancia, tiempo total, tiempo en
  movimiento y tiempo detenido.
- Mapa con la posición actual, el rumbo y la ruta dibujándose en tiempo real.
- Pausa y reanudación: en pausa no se suma distancia ni tiempo de movimiento.
- Detección automática de parada (semáforos) con umbral configurable.
- Elige el **medio de transporte** y cámbialo a mitad de carrera: cada tramo
  queda registrado por separado y el filtro GPS se adapta al vehículo.
- Indicador permanente de calidad de señal y precisión (`±12 m`).

**Después**

- Reporte con resumen, mapa, gráfico de velocidad, gráfico de altitud y tabla
  de rendimiento por kilómetro.
- Historial ordenable por fecha, distancia, velocidad o duración.
- Estadísticas históricas, récords personales y comparación de dos carreras.
- Exportación a **GPX**, **CSV** y **JSON**.

**Sin conexión**

- La carrera se escribe en IndexedDB mientras se pedalea; si se cierra el
  navegador por accidente, la app ofrece recuperarla.
- Al terminar sin cobertura, la carrera queda en cola y se sube sola cuando
  vuelve la conexión.

**Social**

- Amigos por código de amistad o por correo de Google.
- Ubicación en vivo compartida solo entre amigos aceptados, y solo si la
  activas.

---

## 2. Tecnologías

| Pieza | Elección |
| --- | --- |
| Interfaz | React 18 + TypeScript |
| Empaquetado | Vite 6 |
| Mapas | Leaflet + OpenStreetMap |
| Gráficos | Recharts (carga diferida) |
| Ubicación | `navigator.geolocation.watchPosition` |
| Nube | Firebase Authentication + Cloud Firestore |
| Local | IndexedDB (`idb`) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Pruebas | Vitest |
| Alojamiento | GitHub Pages con GitHub Actions |

Sin librería de estado, sin framework de CSS y sin dependencias que no se usen.

---

## 3. Instalación

Requisitos: **Node.js 20 o superior**.

```bash
git clone https://github.com/KBROSSNBK/CYCLERUN.git
cd CYCLERUN
npm install
```

---

## 4. Configurar Firebase

La aplicación **arranca sin Firebase**: entra en «modo local» y guarda las
carreras solo en el dispositivo. Para sincronizar entre dispositivos y usar
amigos hay que conectar un proyecto.

### 4.1 Crear la aplicación web

1. Entra en la [consola de Firebase](https://console.firebase.google.com/) y
   abre tu proyecto (aquí: **CYCLERUN**, id `cyclerun-85a3f`).
2. ⚙️ **Configuración del proyecto → Tus apps → `</>` (Web)**.
3. Registra la app con el apodo `CYCLERUN Web`. **No** actives Firebase Hosting.
4. Copia el objeto `firebaseConfig` que aparece.

### 4.2 Variables de entorno

```bash
cp .env.example .env
```

Rellena `.env` con los valores del paso anterior:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=cyclerun-85a3f.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=cyclerun-85a3f
VITE_FIREBASE_STORAGE_BUCKET=cyclerun-85a3f.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abcdef
```

> Estas claves **no son secretas**: viajan en cualquier aplicación web de
> Firebase. Lo que protege los datos son las reglas de Firestore, no ocultarlas.

### 4.3 Activar el inicio de sesión con Google

**Authentication → Sign-in method → Google → Habilitar.**

### 4.4 Autorizar los dominios

**Authentication → Settings → Authorized domains → Add domain:**

```
kbrossnbk.github.io
```

`localhost` ya viene autorizado. Sin este paso el inicio de sesión falla en
producción con `auth/unauthorized-domain`.

### 4.5 Crear la base de datos

**Firestore Database → Crear base de datos → modo producción**, ubicación
`southamerica-west1 (Santiago)`.

> Ojo: no confundir con **Realtime Database**, que es otro producto y no se usa
> aquí. La ubicación de Firestore **no se puede cambiar** una vez creada.

### 4.6 Publicar las reglas de seguridad

Con la CLI de Firebase:

```bash
npx firebase-tools deploy --only firestore:rules
```

O a mano: copia el contenido de [`firestore.rules`](firestore.rules) en
**Firestore Database → Reglas → Publicar**.

Las reglas garantizan que:

- cada usuario solo lee y escribe `users/{suUid}/…`;
- no existe ningún listado de usuarios que se pueda explorar;
- la ubicación en vivo solo la leen los amigos incluidos en `visibleTo`;
- todo lo no contemplado queda denegado.

---

## 5. Ejecutar en local

```bash
npm run dev
```

Abre <http://localhost:5175>. La geolocalización funciona en `localhost` sin
HTTPS; desde otro dispositivo de la red **necesitas HTTPS** (por ejemplo con un
túnel), porque los navegadores solo dan la ubicación en contextos seguros.

---

## 6. Compilar

```bash
npm run build     # comprueba tipos y genera dist/
npm run preview   # sirve dist/ para revisarlo
```

---

## 7. Desplegar en GitHub Pages

### 7.1 Activar Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 7.2 Añadir las variables de Firebase

**Settings → Secrets and variables → Actions → New repository secret**, uno por
cada variable:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Si no los añades, el despliegue funciona igual pero la app queda en modo local.

### 7.3 Publicar

```bash
git push origin main
```

El workflow [`deploy.yml`](.github/workflows/deploy.yml) instala, pasa las
pruebas, compila y publica `dist/`.

### 7.4 Si cambias el nombre del repositorio

**No hay que tocar nada.** El workflow pasa la ruta base a Vite a partir del
nombre del repositorio:

```yaml
VITE_BASE_PATH: /${{ github.event.repository.name }}/
```

Para una compilación de producción **fuera** de GitHub Actions, indica la ruta
tú mismo:

```bash
VITE_BASE_PATH=/CYCLERUN/ npm run build
```

El valor por defecto está en `DEFAULT_BASE`, dentro de
[`vite.config.ts`](vite.config.ts). Si sirves la app en la raíz de un dominio,
usa `VITE_BASE_PATH=/`.

> El enrutado usa `HashRouter` (`.../CYCLERUN/#/history`) porque GitHub Pages
> sirve ficheros estáticos y no sabe reescribir rutas: sin el `#`, recargar en
> cualquier pantalla daría un 404.

---

## 8. Instalar como aplicación en el móvil

**Android (Chrome)**: abre la app y toca **Instalar** en la tarjeta del inicio,
o menú ⋮ → *Instalar aplicación*.

**iPhone (Safari)**: botón **Compartir** → *Añadir a pantalla de inicio*. iOS no
permite el diálogo automático de instalación.

Una vez instalada se abre a pantalla completa, sin barra del navegador, con su
icono propio, y funciona sin conexión.

---

## 9. Amigos y ubicación en vivo

1. Inicia sesión con Google (obligatorio para la parte social).
2. En **Amigos** verás tu **código de amistad** de 6 caracteres.
3. Para añadir a alguien, escribe su código o el correo de su cuenta de Google.
4. La otra persona recibe una solicitud y debe **aceptarla**.
5. Activa **Compartir ubicación en vivo** (está desactivada por defecto).

Os veis en dos situaciones:

- **Con la pantalla de Amigos abierta**, aunque nadie esté pedaleando. Es lo
  que permite quedar y veros llegar.
- **Mientras alguien graba una carrera**, con su velocidad y su distancia, tanto
  en la pantalla de Amigos como en el mapa de tu propia carrera.

El marcador es verde si esa persona está pedaleando, ámbar si está en pausa y
azul si solo tiene la app abierta. Al salir de la pantalla o terminar la
carrera, tu posición se **borra** de la nube.

Qué **no** ocurre nunca:

- Tus carreras guardadas no las ve nadie, ni siquiera tus amigos.
- Nadie que no sea amigo aceptado puede leer tu posición.
- No hay perfiles públicos ni buscador de usuarios.

---

## 10. Limitaciones del GPS

La precisión depende del teléfono, del entorno y del clima; **ninguna
aplicación puede garantizarla**, y CYCLERUN prefiere admitirlo a inventar
datos:

- Se muestra siempre la precisión real (`±12 m`) y el estado de la señal.
- Las lecturas con precisión peor que el límite configurado **se descartan**.
- Un desplazamiento imposible para el vehículo elegido se trata como salto del
  GPS y **no suma distancia**.
- La velocidad se suaviza con un filtro de mediana; si el receptor informa una
  velocidad que no concuerda con el desplazamiento real, manda el
  desplazamiento (hay teléfonos que devuelven siempre `0`).
- Sin lecturas recientes el tiempo cuenta como detenido, nunca como movimiento.
- Entre edificios altos, en túneles o en aparcamientos subterráneos es normal
  perder la señal.
- La altitud del GPS es imprecisa: el desnivel es orientativo.

En **Ajustes → Diagnóstico del GPS** puedes ver el estado real del receptor y
los motivos exactos si algo falla.

---

## 11. Permisos necesarios

| Permiso | Para qué | Si se deniega |
| --- | --- | --- |
| **Ubicación** | registrar el recorrido | la app lo explica y no deja empezar |
| **HTTPS** | requisito del navegador | no hay geolocalización |
| Mantener pantalla encendida | ver los datos al pedalear | la pantalla se apaga sola |
| Vibración | avisos al pausar o finalizar | sin vibración |
| Notificación de instalación | añadir a la pantalla de inicio | se instala a mano |

En Android conviene elegir **«Permitir mientras se usa la app»** y **activar la
ubicación precisa**.

---

## 12. Arquitectura

```
src/
  components/   piezas de interfaz (mapas, gráficos, tarjetas, diálogos)
  config/       ajustes por defecto y catálogo de medios de transporte
  firebase/     autenticación, carreras, amigos, ubicación en vivo, códec del track
  gps/          servicio GPS y detección de permisos
  hooks/        acceso reactivo a motor, ajustes, sesión y amigos
  pages/        una pantalla por ruta
  services/     motor de carrera, sincronización, ajustes, exportación
  storage/      IndexedDB
  styles/       tema, base y componentes
  types/        modelo de datos
```

Dos piezas concentran la lógica:

**`gps/gpsService.ts`** — arranca `watchPosition`, descarta lecturas imprecisas
y saltos imposibles, calcula la velocidad suavizada y detecta la pérdida de
señal. No sabe nada de carreras.

**`services/rideEngine.ts`** — máquina de estados de la carrera
(`idle → acquiring → recording ⇄ paused → finished`): distancia con Haversine,
reparto del tiempo entre movimiento, parada y pausa, desnivel, máximos, tramos
por medio de transporte y volcado continuo a IndexedDB. La interfaz solo lee su
estado; no calcula nada.

### Modelo de datos en Firestore

```
users/{uid}                          perfil (nombre, foto, código de amistad)
users/{uid}/rides/{rideId}           resumen + polilínea de vista previa
users/{uid}/rides/{rideId}/track/*   recorrido completo, troceado
users/{uid}/friends/{friendUid}      amistades aceptadas
users/{uid}/friendRequests/{fromUid} solicitudes recibidas
friendCodes/{code}                   índice público: solo un uid
emailIndex/{sha256(correo)}          índice por correo: solo un uid
liveLocations/{uid}                  posición en vivo + lista de destinatarios
```

El recorrido no se guarda como lista de objetos sino en **columnas de números**
troceadas en documentos de 500 puntos: Firestore no admite arrays dentro de
arrays y limita cada documento a 1 MB. Así una carrera larga ocupa unos 30 KB
por cada 500 puntos y el historial se lee sin descargar los recorridos.

### Preparado para lo siguiente

La arquitectura deja sitio, sin reescribir nada, para segmentos, rutas
favoritas, objetivos semanales, desafíos, clasificaciones y sensores Bluetooth
(pulso, cadencia, potencia): el motor ya publica un estado por tramos y los
puntos llevan marca de tiempo, de modo que una fuente de datos adicional es una
suscripción más.

---

## 13. Pruebas

```bash
npm test          # una pasada
npm run test:watch
```

58 pruebas sobre lo que no puede fallar: distancia con Haversine, simplificación
de la ruta, suavizado de velocidad, detección de parada, reparto de tiempos,
desnivel, tramos por medio de transporte, división por kilómetros, agregados,
récords, códec de Firestore y exportación GPX/CSV.

La interfaz se verifica en el navegador; el GPS real solo puede probarse
saliendo a la calle.

---

## Licencia

Uso personal. Los mapas son © colaboradores de
[OpenStreetMap](https://www.openstreetmap.org/copyright).
