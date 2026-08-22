import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where, deleteDoc, writeBatch } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Pruebas de las reglas de seguridad contra el emulador de Firestore.
 *
 * Verifican lo que no se puede comprobar leyendo el codigo de la aplicacion:
 * que Firestore autoriza exactamente las operaciones que la app necesita y
 * ninguna mas. Es la parte critica de la funcion de amigos, porque un fallo
 * aqui no da error visible: simplemente el mapa se queda vacio.
 *
 *   npm run test:rules
 */

const PROJECT_ID = 'demo-cyclerun'

let testEnv: RulesTestEnvironment

const ANA = 'uid-ana'
const BETO = 'uid-beto'
const EXTRANO = 'uid-extrano'

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

/** Deja a Ana y Beto como amigos aceptados, saltandose las reglas. */
async function seedFriendship() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', ANA, 'friends', BETO), {
      uid: BETO,
      displayName: 'Beto',
      photoURL: null,
      since: Date.now(),
    })
    await setDoc(doc(db, 'users', BETO, 'friends', ANA), {
      uid: ANA,
      displayName: 'Ana',
      photoURL: null,
      since: Date.now(),
    })
  })
}

function presenceOf(uid: string, visibleTo: string[]) {
  return {
    uid,
    displayName: 'Ciclista',
    photoURL: null,
    latitude: -33.4489,
    longitude: -70.6693,
    accuracy: 8,
    speed: 5,
    heading: 90,
    distance: 1200,
    status: 'recording',
    rideId: 'r1',
    updatedAt: Date.now(),
    visibleTo,
  }
}

describe('carreras', () => {
  it('cada usuario escribe y lee las suyas', async () => {
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await assertSucceeds(
      setDoc(doc(ana, 'users', ANA, 'rides', 'r1'), { distance: 1000, startTime: 1 }),
    )
    await assertSucceeds(getDoc(doc(ana, 'users', ANA, 'rides', 'r1')))
  })

  it('nadie puede leer las carreras de otro, ni siquiera un amigo', async () => {
    await seedFriendship()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', ANA, 'rides', 'r1'), { distance: 1000 })
    })

    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(getDoc(doc(beto, 'users', ANA, 'rides', 'r1')))

    const extrano = testEnv.authenticatedContext(EXTRANO).firestore()
    await assertFails(getDoc(doc(extrano, 'users', ANA, 'rides', 'r1')))
  })

  it('nadie puede escribir carreras en la cuenta de otro', async () => {
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(setDoc(doc(beto, 'users', ANA, 'rides', 'r9'), { distance: 1 }))
  })

  it('el recorrido troceado hereda la misma proteccion', async () => {
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await assertSucceeds(
      setDoc(doc(ana, 'users', ANA, 'rides', 'r1', 'track', '0000'), { index: 0, count: 0 }),
    )
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(getDoc(doc(beto, 'users', ANA, 'rides', 'r1', 'track', '0000')))
  })

  it('sin sesion iniciada no se lee nada', async () => {
    const anonimo = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonimo, 'users', ANA, 'rides', 'r1')))
  })
})

describe('solicitudes de amistad', () => {
  it('se puede enviar una solicitud en nombre propio', async () => {
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await assertSucceeds(
      setDoc(doc(ana, 'users', BETO, 'friendRequests', ANA), {
        fromUid: ANA,
        displayName: 'Ana',
        photoURL: null,
        email: 'ana@example.cl',
        createdAt: Date.now(),
      }),
    )
  })

  it('no se puede enviar una solicitud suplantando a otro', async () => {
    const extrano = testEnv.authenticatedContext(EXTRANO).firestore()
    await assertFails(
      setDoc(doc(extrano, 'users', BETO, 'friendRequests', ANA), {
        fromUid: ANA,
        createdAt: Date.now(),
      }),
    )
  })

  it('solo el destinatario ve su bandeja de solicitudes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', BETO, 'friendRequests', ANA), {
        fromUid: ANA,
        createdAt: Date.now(),
      })
    })
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertSucceeds(getDocs(collection(beto, 'users', BETO, 'friendRequests')))

    const extrano = testEnv.authenticatedContext(EXTRANO).firestore()
    await assertFails(getDocs(collection(extrano, 'users', BETO, 'friendRequests')))
  })

  it('aceptar una solicitud escribe la amistad en las dos listas', async () => {
    // Ana envia la solicitud a Beto.
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await setDoc(doc(ana, 'users', BETO, 'friendRequests', ANA), {
      fromUid: ANA,
      displayName: 'Ana',
      photoURL: null,
      email: 'ana@example.cl',
      createdAt: Date.now(),
    })

    // Beto acepta: escribe en su lista y en la de Ana, y borra la solicitud.
    const beto = testEnv.authenticatedContext(BETO).firestore()
    const batch = writeBatch(beto)
    batch.set(doc(beto, 'users', BETO, 'friends', ANA), { uid: ANA, since: Date.now() })
    batch.set(doc(beto, 'users', ANA, 'friends', BETO), { uid: BETO, since: Date.now() })
    batch.delete(doc(beto, 'users', BETO, 'friendRequests', ANA))
    await assertSucceeds(batch.commit())
  })

  it('sin solicitud previa no se puede colar en la lista de otro', async () => {
    const extrano = testEnv.authenticatedContext(EXTRANO).firestore()
    await assertFails(
      setDoc(doc(extrano, 'users', ANA, 'friends', EXTRANO), {
        uid: EXTRANO,
        since: Date.now(),
      }),
    )
  })

  it('cualquiera de los dos puede deshacer la amistad', async () => {
    await seedFriendship()
    const beto = testEnv.authenticatedContext(BETO).firestore()
    // Beto borra su propia entrada y tambien la que tiene Ana de el.
    await assertSucceeds(deleteDoc(doc(beto, 'users', BETO, 'friends', ANA)))
    await assertSucceeds(deleteDoc(doc(beto, 'users', ANA, 'friends', BETO)))
  })
})

describe('indices de busqueda', () => {
  it('el codigo de amistad se puede consultar con sesion iniciada', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendCodes', 'ABC123'), { uid: ANA })
    })
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertSucceeds(getDoc(doc(beto, 'friendCodes', 'ABC123')))
  })

  it('no se puede reclamar un codigo apuntando a otra persona', async () => {
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(setDoc(doc(beto, 'friendCodes', 'XYZ999'), { uid: ANA }))
    await assertSucceeds(setDoc(doc(beto, 'friendCodes', 'XYZ999'), { uid: BETO }))
  })

  it('no se puede secuestrar el codigo ya registrado por otro', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'friendCodes', 'ABC123'), { uid: ANA })
    })
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(setDoc(doc(beto, 'friendCodes', 'ABC123'), { uid: BETO }))
  })

  it('sin sesion no se puede consultar el directorio', async () => {
    const anonimo = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonimo, 'friendCodes', 'ABC123')))
  })
})

describe('ubicacion en vivo', () => {
  it('un amigo incluido en visibleTo puede leer la posicion', async () => {
    await seedFriendship()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'liveLocations', ANA),
        presenceOf(ANA, [BETO]),
      )
    })

    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertSucceeds(getDoc(doc(beto, 'liveLocations', ANA)))
  })

  it('la consulta que usa la app devuelve a los amigos que comparten', async () => {
    await seedFriendship()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'liveLocations', ANA), presenceOf(ANA, [BETO]))
      await setDoc(doc(db, 'liveLocations', EXTRANO), presenceOf(EXTRANO, ['otro-uid']))
    })

    const beto = testEnv.authenticatedContext(BETO).firestore()
    const resultado = await assertSucceeds(
      getDocs(
        query(collection(beto, 'liveLocations'), where('visibleTo', 'array-contains', BETO)),
      ),
    )
    // Solo debe llegar la de Ana, nunca la del desconocido.
    expect(resultado.size).toBe(1)
    expect(resultado.docs[0].id).toBe(ANA)
  })

  it('quien no esta en visibleTo no puede leer la posicion', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'liveLocations', ANA), presenceOf(ANA, [BETO]))
    })
    const extrano = testEnv.authenticatedContext(EXTRANO).firestore()
    await assertFails(getDoc(doc(extrano, 'liveLocations', ANA)))
  })

  it('no se puede listar el conjunto de posiciones sin filtrar', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'liveLocations', ANA), presenceOf(ANA, [BETO]))
    })
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(getDocs(collection(beto, 'liveLocations')))
  })

  it('cada uno solo publica su propia posicion', async () => {
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await assertSucceeds(setDoc(doc(ana, 'liveLocations', ANA), presenceOf(ANA, [BETO])))
    // Firmar el documento con otro uid queda descartado.
    await assertFails(setDoc(doc(ana, 'liveLocations', ANA), presenceOf(BETO, [BETO])))
    // Y escribir directamente en el documento ajeno, tambien.
    await assertFails(setDoc(doc(ana, 'liveLocations', BETO), presenceOf(BETO, [ANA])))
  })

  it('cada uno puede retirar su posicion', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'liveLocations', ANA), presenceOf(ANA, [BETO]))
    })
    const ana = testEnv.authenticatedContext(ANA).firestore()
    await assertSucceeds(deleteDoc(doc(ana, 'liveLocations', ANA)))
  })

  it('nadie puede borrar la posicion de otro', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'liveLocations', ANA), presenceOf(ANA, [BETO]))
    })
    const beto = testEnv.authenticatedContext(BETO).firestore()
    await assertFails(deleteDoc(doc(beto, 'liveLocations', ANA)))
  })

  it('sin sesion iniciada no se ve ninguna posicion', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'liveLocations', ANA), presenceOf(ANA, [BETO]))
    })
    const anonimo = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonimo, 'liveLocations', ANA)))
  })
})
