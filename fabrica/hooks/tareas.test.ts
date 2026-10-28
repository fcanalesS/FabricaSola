import { describe, expect, test } from 'claude-code/testing'
import {
  anotar, candidatos, editaCamposDelMod, enShell, esArchivoDeTarea, escribeCamposDelMod, esNombreDeAgente,
  fijarEnConfig, leerConfig, nombreDeCopia, renombrarAgente, lineaDeEstado, mover, partir, siguienteId, slug, tareaDesde, tareaNueva,
  unir, veredictoDesde, vigente, type Datos, seccion, ponerSeccion, masBarato, notaDelModeloDeSpec, specElegidaPorEl, construccionElegidaPorEl, yaAnotado, PARA_LA_MEMORIA_VACIA,
  aCrlf, archivosQueGitProtege, archivosQueToca, archivosSql, baseDeComparacion, choquesDe, cicloDeDependencias, comandoDeLint,
  conArchivos, conHallazgoDeConflicto, decidirIntegracion, enComun, enlaceDeNodeModules, esLockfile, esRamaProtegida, extensiones, protegidaSinWorktree, ramaDeOrigen, ramaParaLaTarea,
  archivarHallazgos, bloqueantesEn, CONFIG_SOLO_EL_USUARIO, esConfigDeLaFabrica, frenaConfig, esDeLaMemoria, frenaHabilidades, frenaMemoria, frenaProcesos, PLAN_DE_VUELTA, salidaEnLaTarea, HABILIDADES_SOLO_EL_USUARIO, PROCESOS_SOLO_EL_USUARIO, MEMORIA_SOLO_EL_USUARIO, rutaNormal, liberadaPor, reintentoDeIntegracion, revisarDependencias, rutasDePorcelain, tieneMarcadores, tieneWorktreePropio, tomadaPorOtra, usaCrlf, TOMA_MS,
} from './tareas'
import { cambiosDeNumstat, decidirCodigo, decidirModelo, decidirSpec, delProyecto, decidirPruebas, decidirSeguridad, decidirUi, estadoParaJev, PREGUNTA_DE_INTEGRACION, reutilizaCodigo, soloSinLogica, UMBRALES } from './jev'
import {
  AGENTE_DE_RETRABAJO, candidatosDeLaCorrida, ETAPA_DE_ROL, frenaHabilidad, frenaSinHabilidades, habilidadesDeEtapa, habilidadesDeLaCorridaDesde, habilidadesDeLaTarea, habilidadesParaLosAgentes, huellaDe,
  lineaDeHabilidades, nombreConHabilidades, rolConHabilidades, rolDeAgente, specConHabilidades, tareaDelEncargo, ultimaDeLaBitacoraEs, usosDelCatalogo,
} from './habilidades'
import { comandoDeAntigravity, comandoDeCodex, comandoDeEspera, comandoDelLanzador, estadoDelTrabajo, hallazgosEnMarkdown, leerRevisionDeCodex, leerSpecDeAntigravity, pedidoDeRevision, tokensDeCodex } from './externos'
import { AGENTE_DE_ANUNCIO, anotarVeredicto, anuncioEnLaTarea, PARA_EL_PR, PARA_PROBAR_A_MANO, ponerSeccionAntesDeLaBitacora, sinLoDeLabel } from './tareas'
import { clasificar, LO_DELICADO, loDelicado, nucleoDeLaFicha, topesDesde } from './integracion'
import { debioEsperar, esControl, lineasDeJev, pendientes, sinLoRetirado, resultadoDePruebas, resultadosAlMover, seguridadConBloqueantes, umbralesAjustados, type LineaDeJev } from './aprendizaje'
import {
  choquesConLaMemoria, cierreEnLaMemoria, copiaDe, documentoDePropuesta, envolver, lineaDeBitacora, memoriaParaLosAgentes, nombreDeDocumento, notaDeChoques,
  pedidoDeUnIssue, prohibicionesDe, propuestasDe, siguientePropuesta, terminosDe,
} from './memoria'

const T = '2026-10-16T12:00:00.000Z'
const cfg = (extra = '') => leerConfig(`---\nbuild: dotnet build\ntest: dotnet test\n${extra}\n---\n`)
const base = (estado: string, extra: Datos = {}): Datos =>
  ({ id: 'F-001', titulo: 'Algo', estado, vueltas: '0', verificacion: 'pendiente', aprobacion_agente: 'pendiente', ...extra })

describe('Frontmatter', () => {
  test('ida y vuelta conserva claves, orden y cuerpo', () => {
    const md = tareaNueva('F-001', 'Exportar: clientes a CSV', 'El pedido', T)
    const { datos, cuerpo } = partir(md)
    expect(datos.id).toBe('F-001')
    expect(datos.titulo).toBe('Exportar: clientes a CSV')
    expect(datos.estado).toBe('pendiente')
    expect(partir(unir(datos, cuerpo)).datos).toEqual(datos)
    expect(cuerpo).toContain('## Pedido')
  })

  test('lee archivos con CRLF y BOM', () => {
    const { datos } = partir('﻿---\r\nid: F-002\r\nestado: spec\r\n---\r\ncuerpo')
    expect(datos).toEqual({ id: 'F-002', estado: 'spec' })
  })

  test('la bitácora crece al final de su sección, antes de la siguiente', () => {
    const c = anotar('## Bitácora\n\n- uno\n\n## Otra\n\nx\n', 'dos')
    expect(c.indexOf('- dos')).toBeGreaterThan(c.indexOf('- uno'))
    expect(c.indexOf('- dos')).toBeLessThan(c.indexOf('## Otra'))
    expect(anotar('texto', 'nueva')).toContain('## Bitácora\n\n- nueva')
  })
})

describe('Configuración', () => {
  test('valores por defecto y límites', () => {
    const c = leerConfig(undefined)
    expect(c.maxVueltas).toBe(3)
    expect(c.aprobacion).toBe('agente')
    expect(leerConfig('---\nmax_vueltas: 99\nparalelo_max: 0\n---').maxVueltas).toBe(10)
    expect(leerConfig('---\nparalelo_max: 0\n---').paraleloMax).toBe(1)
  })

  test('el puente solo acepta http(s)', () => {
    expect(leerConfig('---\npuente_url: http://127.0.0.1:3000/x\n---').puenteUrl).toBe('http://127.0.0.1:3000/x')
    expect(leerConfig('---\npuente_url: file:///etc\n---').puenteUrl).toBe('')
  })
})

describe('Transiciones', () => {
  test('el camino feliz', () => {
    let d = base('pendiente')
    for (const a of ['spec', 'construccion', 'revision', 'verificacion'] as const) {
      const r = mover(d, { a, ahora: T }, cfg())
      expect(r.ok).toBe(true)
      if (r.ok) d = r.datos
    }
    expect(mover(d, { a: 'aprobacion', ahora: T }, cfg()).ok).toBe(false)
    d = { ...d, verificacion: 'ok' }
    const r = mover(d, { a: 'aprobacion', ahora: T }, cfg())
    expect(r.ok).toBe(true)
    if (r.ok) d = r.datos
    expect(mover(d, { a: 'hecho', ahora: T }, cfg()).ok).toBe(false)
    const fin = mover({ ...d, aprobacion_agente: 'aprobada' }, { a: 'hecho', ahora: T }, cfg())
    expect(fin.ok && fin.datos.estado).toBe('hecho')
  })

  test('no se salta etapas', () => {
    const r = mover(base('pendiente'), { a: 'revision', ahora: T }, cfg())
    expect(r.ok).toBe(false)
    expect(mover(base('hecho'), { a: 'construccion', ahora: T }, cfg()).ok).toBe(false)
  })

  test('el retrabajo cuenta vueltas y, al pasarse, manda a un humano', () => {
    const c = cfg('max_vueltas: 2')
    const r1 = mover(base('revision', { vueltas: '1', verificacion: 'ok' }), { a: 'construccion', nota: 'falta validar', ahora: T }, c)
    expect(r1.ok && r1.datos.vueltas).toBe('2')
    expect(r1.ok && r1.datos.verificacion).toBe('pendiente')
    const r2 = mover(base('verificacion', { vueltas: '2' }), { a: 'construccion', nota: 'otra vez', ahora: T }, c)
    expect(r2.ok && r2.datos.estado).toBe('necesita-humano')
    expect(r2.ok && r2.forzado).toContain('Superó 2 vueltas')
  })

  test('mandar a un humano pide motivo, y salir de ahí lo limpia', () => {
    expect(mover(base('spec'), { a: 'necesita-humano', ahora: T }, cfg()).ok).toBe(false)
    const r = mover(base('spec'), { a: 'necesita-humano', nota: 'pedido ambiguo', ahora: T }, cfg())
    expect(r.ok && r.datos.motivo).toBe('pedido ambiguo')
    const vuelta = r.ok ? mover(r.datos, { a: 'spec', ahora: T }, cfg()) : undefined
    expect(vuelta?.ok && vuelta.datos.motivo).toBe('')
  })

  test('se puede volver a preguntar, con motivo nuevo', () => {
    const d = base('necesita-humano', { motivo: 'vieja', actualizada: '2026-10-16T10:00:00.000Z' })
    expect(mover(d, { a: 'necesita-humano', ahora: T }, cfg()).ok).toBe(false)
    const r = mover(d, { a: 'necesita-humano', nota: 'pregunta nueva', ahora: T }, cfg())
    expect(r.ok && r.datos.motivo).toBe('pregunta nueva')
    expect(r.ok && r.datos.actualizada).toBe(T)
  })

  test('con aprobación externa hace falta su veredicto', () => {
    const c = cfg('aprobacion: ambas')
    const d = base('aprobacion', { verificacion: 'ok', aprobacion_agente: 'aprobada' })
    expect(mover(d, { a: 'hecho', ahora: T }, c).ok).toBe(false)
    expect(mover(d, { a: 'hecho', ahora: T, veredictoExterno: 'rechazada' }, c).ok).toBe(false)
    expect(mover(d, { a: 'hecho', ahora: T, veredictoExterno: 'aprobada' }, c).ok).toBe(true)
    const soloExterna = cfg('aprobacion: externa')
    expect(mover({ ...d, aprobacion_agente: 'pendiente' }, { a: 'hecho', ahora: T, veredictoExterno: 'aprobada' }, soloExterna).ok).toBe(true)
  })

  test('un veredicto externo de una vuelta anterior no vale', () => {
    const r = mover(base('verificacion', { verificacion: 'ok' }), { a: 'aprobacion', ahora: T }, cfg())
    expect(r.ok && r.datos.en_aprobacion_desde).toBe(T)
    const t = Date.parse(T)
    expect(vigente(t - 60_000, T)).toBe(false)
    expect(vigente(t + 1, T)).toBe(true)
    expect(vigente(0, undefined)).toBe(true)
  })

  test('el evento dice de dónde a dónde y quién', () => {
    const r = mover(base('spec'), { a: 'construccion', agente: 'fabrica:spec-escritor', ahora: T }, cfg())
    expect(r.ok && r.evento).toEqual({ ts: T, tarea: 'F-001', de: 'spec', a: 'construccion', agente: 'fabrica:spec-escritor' })
  })
})

describe('Roles y agentes', () => {
  test('auto usa el de la fábrica, que ya trae su oficio', () => {
    const c = cfg()
    expect(c.agentes.construccion).toBe('auto')
    expect(candidatos('construccion', 'auto')).toEqual(['fabrica:constructor'])
    expect(candidatos('spec', 'auto')).toEqual(['fabrica:spec-escritor'])
    // Un agente de un mod elegido a mano también se busca sin el nombre del mod: así llega a las corridas de la aplicación.
    expect(candidatos('construccion', 'otro-mod:implementacion')).toEqual(['otro-mod:implementacion', 'implementacion', 'fabrica:constructor'])
  })

  test('un agente configurado va primero, con el de fábrica detrás', () => {
    const c = cfg('agente_construccion: fabrica-constructor\nagente_revision_codigo: Mal Nombre')
    expect(c.agentes.construccion).toBe('fabrica-constructor')
    expect(c.agentes.revision_codigo).toBe('auto')
    expect(candidatos('construccion', c.agentes.construccion)).toEqual(['fabrica-constructor', 'fabrica:constructor'])
  })

  test('fijar en config conserva el resto y renombrar cambia solo el name', () => {
    const base = '---\nbuild: dotnet build\n---\n\nNotas.\n'
    const nuevo = fijarEnConfig(base, 'agente_ui', 'mi-revisor')
    expect(partir(nuevo).datos).toEqual({ build: 'dotnet build', agente_ui: 'mi-revisor' })
    expect(partir(nuevo).cuerpo).toContain('Notas.')
    const agente = '---\nname: constructor\ndescription: "Fábrica: hace \\"cosas\\""\ntools: Read, Edit\n---\n\n# Constructor\n'
    const copia = partir(renombrarAgente(agente, nombreDeCopia('construccion')))
    expect(copia.datos.name).toBe('fabrica-constructor')
    expect(copia.datos.description).toBe('Fábrica: hace "cosas"')
    expect(copia.cuerpo).toContain('# Constructor')
  })

  test('nombres de agente', () => {
    expect(esNombreDeAgente('otro-mod:implementacion')).toBe(true)
    expect(esNombreDeAgente('fabrica-constructor')).toBe(true)
    expect(esNombreDeAgente('../../etc')).toBe(false)
    expect(esNombreDeAgente('Mayus')).toBe(false)
  })
})

describe('Guarda de campos del mod', () => {
  const md = tareaNueva('F-001', 'x', 'p', T)

  test('solo aplica a archivos de tarea', () => {
    expect(esArchivoDeTarea('C:\\repo\\factory\\tareas\\F-001-x.md')).toBe(true)
    expect(esArchivoDeTarea('/repo/factory/config.md')).toBe(false)
    expect(esArchivoDeTarea('/repo/docs/tareas/F-001.md')).toBe(false)
  })

  test('un Edit sobre el estado se frena; sobre la spec, no', () => {
    expect(editaCamposDelMod('estado: spec', 'estado: hecho')).toBe(true)
    expect(editaCamposDelMod('x\nverificacion: fallo', 'x\nverificacion: ok')).toBe(true)
    expect(editaCamposDelMod('_(la escribe el agente de especificación)_', '**Objetivo:** algo')).toBe(false)
  })

  test('un Write que reescribe todo pasa si los campos del mod no cambian', () => {
    expect(escribeCamposDelMod(md, md.replace('El pedido', 'p'))).toBe(false)
    expect(escribeCamposDelMod(md, md.replace('estado: pendiente', 'estado: hecho'))).toBe(true)
    expect(escribeCamposDelMod(undefined, md)).toBe(false)
    expect(escribeCamposDelMod(undefined, md.replace('estado: pendiente', 'estado: aprobacion'))).toBe(true)
  })
})

describe('Utilidades', () => {
  test('ids y slugs', () => {
    expect(siguienteId([])).toBe('F-001')
    expect(siguienteId(['F-001', 'F-009', 'otra'])).toBe('F-010')
    expect(slug('Exportar Clientes a CSV — versión 2')).toBe('exportar-clientes-a-csv-version-2')
  })

  test('la tarea se lee del frontmatter', () => {
    const t = tareaDesde(tareaNueva('F-003', 'Login', '', T), 'x.md')
    expect(t?.estado).toBe('pendiente')
    expect(t?.rama).toBe('fabrica/F-003')
    expect(tareaDesde('sin frontmatter', 'y.md')).toBeUndefined()
  })

  test('línea de estado', () => {
    const t = (estado: string) => tareaDesde(tareaNueva('F-1', 'x', '', T).replace('estado: pendiente', `estado: ${estado}`), 'a')!
    expect(lineaDeEstado([])).toBeUndefined()
    expect(lineaDeEstado([t('construccion'), t('necesita-humano'), t('hecho'), t('pendiente')]))
      .toBe('fábrica · 1 en curso · 1 en cola · ⚠ 1 esperan humano · 1 hechas')
  })

  test('shell por sistema y veredicto externo', () => {
    expect(enShell('dotnet build', true)[0]).toBe('powershell')
    expect(enShell('make', false)).toEqual(['sh', '-c', 'make'])
    expect(veredictoDesde('{"veredicto":"aprobada","por":"live2d"}')?.por).toBe('live2d')
    expect(veredictoDesde('{"veredicto":"quizas"}')).toBeUndefined()
    expect(veredictoDesde('no es json')).toBeUndefined()
  })
})

describe('Lo que decide Jev', () => {
  const docs = cambiosDeNumstat('3\t1\tREADME.md\n0\t0\tdocs/logo.png\n')
  const codigo = cambiosDeNumstat('12\t4\tsrc/rut.ts\n-\t-\tassets/icono.ico\n')

  test('el numstat de git se lee, binarios incluidos', () => {
    expect(codigo).toEqual([{ ruta: 'src/rut.ts', agregadas: 12, quitadas: 4 }, { ruta: 'assets/icono.ico', agregadas: 0, quitadas: 0 }])
    expect(soloSinLogica(docs)).toBe(true)
    expect(soloSinLogica(codigo)).toBe(false)
    expect(soloSinLogica([])).toBe(false)
  })

  test('las pruebas: las reglas van antes que Jev, y ante la duda se corren', () => {
    expect(decidirPruebas({ conJev: true, fallóAntes: true, cambios: docs }).si).toBe(true)
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: null }).si).toBe(true)
    expect(decidirPruebas({ conJev: false, fallóAntes: false, cambios: docs })).toEqual({ si: false, por: 'regla', p: null, motivo: 'solo cambiaron documentación, textos, imágenes o estilos' })
    expect(decidirPruebas({ conJev: false, fallóAntes: false, cambios: cambiosDeNumstat('3\t1\tsrc/estilos.css\n') }).si).toBe(false)
    // Con lógica se corren sin preguntar, aunque Jev diga que no: un título engañoso lo despistó una vez.
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: codigo, jev: 0.05 })).toEqual({ si: true, por: 'regla', p: null, motivo: 'cambió código con lógica (src/rut.ts)' })
    // En medio (vistas, plantillas, configuración) decide Jev: sin respuesta se corren, con duda también.
    const vista = cambiosDeNumstat('4\t2\tViews/Boleta.cshtml\n')
    expect(decidirPruebas({ conJev: false, fallóAntes: false, cambios: vista }).si).toBe(true)
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: vista }).por).toBe('sin_jev')
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: vista, jev: 0.45 }).si).toBe(true)
    // El umbral medido es 0,15: un 0,17 todavía se corre; con lo aprendido, el umbral puede venir más bajo.
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: vista, jev: 0.17 }).si).toBe(true)
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: vista, jev: 0.08 })).toEqual({ si: false, por: 'jev', p: 0.08, motivo: 'Jev ve claro que no hacen falta (p=0.08, umbral 0.15)' })
    expect(decidirPruebas({ conJev: true, fallóAntes: false, cambios: vista, jev: 0.08, umbral: 0.05 }).si).toBe(true)
    // Lo de la propia fábrica no cuenta como cambio.
    expect(delProyecto(cambiosDeNumstat('9\t1\tfactory/tareas/F-001.md\n2\t1\tsrc/a.css\n')).map(c => c.ruta)).toEqual(['src/a.css'])
  })

  test('los revisores: código siempre que cambie código, seguridad con Jev, UI con la regla de config', () => {
    expect(decidirCodigo(docs).si).toBe(false)
    expect(decidirCodigo(codigo).si).toBe(true)
    expect(decidirCodigo(null).si).toBe(true)
    expect(decidirSeguridad({ conJev: true, cambios: codigo, jev: 0.6 }).si).toBe(true)
    expect(decidirSeguridad({ conJev: true, cambios: codigo, jev: 0.25 }).si).toBe(false)
    expect(decidirSeguridad({ conJev: true, cambios: codigo, jev: 0.35 }).si).toBe(true)
    expect(decidirSeguridad({ conJev: false, cambios: codigo }).si).toBe(true)
    expect(decidirSeguridad({ conJev: true, cambios: cambiosDeNumstat('5\t0\tsrc/auth/sesion.ts\n'), jev: 0.01 }).motivo).toBe('toca algo sensible (src/auth/sesion.ts)')
    expect(decidirUi('auto', codigo).si).toBe(false)
    expect(decidirUi('auto', cambiosDeNumstat('1\t1\tsrc/Servicio.cs\n')).si).toBe(false)
    // Un .ts de lógica no es una vista; uno de componentes, sí.
    expect(decidirUi('auto', cambiosDeNumstat('9\t1\tsrc/lib/plaza.ts\n')).si).toBe(false)
    expect(decidirUi('auto', cambiosDeNumstat('3\t1\twwwroot/js/contacto.js\n')).si).toBe(true)
    expect(decidirUi('no', codigo).si).toBe(false)
  })

  test('a Jev le llegan el título y los archivos, nunca el contenido', () => {
    expect(estadoParaJev('Validar RUT', codigo)).toEqual({
      tarea: 'Validar RUT', archivos_cambiados: ['src/rut.ts (+12 −4)', 'assets/icono.ico (+0 −0)'], total_de_archivos: 2, lineas_cambiadas: 16,
    })
  })

  test('la config apaga a Jev, y las pruebas omitidas son un campo del mod', () => {
    expect(cfg().jev).toBe('auto')
    expect(cfg('jev: no').jev).toBe('no')
    expect(escribeCamposDelMod(unir(base('verificacion'), ''), unir(base('verificacion', { pruebas: 'omitidas' }), ''))).toBe(true)
    expect(tareaDesde(unir(base('aprobacion', { pruebas: 'omitidas' }), ''), 'x')?.pruebas).toBe('omitidas')
  })
})

describe('Spec y modelo con Jev', () => {
  const pedido = 'Agregar un botón Exportar CSV en Clientes, con RUT, nombre y correo; deshabilitado si la lista está vacía.'

  test('la spec se salta solo la primera vez, con un pedido de verdad y si Jev lo ve claro', () => {
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: true, jev: 0.9 }).si).toBe(true)
    expect(decidirSpec({ conJev: true, pedido: 'Validar RUT.', yaTieneSpec: false, jev: 0.9 }).motivo).toBe('el pedido es demasiado corto para ser una spec')
    expect(decidirSpec({ conJev: false, pedido, yaTieneSpec: false }).si).toBe(true)
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: false, jev: 0.45 }).si).toBe(true)
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: false, jev: 0.71 })).toEqual({ si: false, por: 'jev', p: 0.71, motivo: 'Jev ve claro que el pedido ya es una spec (p=0.71, umbral 0.50)' })
  })

  test('el modelo barato, solo en la primera construcción y si es simple', () => {
    expect(decidirModelo({ conJev: true, vueltas: 1, jev: 0.95 }).si).toBe(true)
    expect(decidirModelo({ conJev: true, vueltas: 0, jev: 0.38 }).si).toBe(true)
    expect(decidirModelo({ conJev: true, vueltas: 0, jev: 0.83 }).si).toBe(false)
  })

  test('secciones del archivo de la tarea', () => {
    const cuerpo = tareaNueva('F-009', 'Exportar', pedido, T)
    const { cuerpo: c } = partir(cuerpo)
    expect(seccion(c, 'Pedido')).toBe(pedido)
    expect(seccion(c, 'Spec')).toBe('')
    const nuevo = ponerSeccion(c, 'Spec', 'La spec.')
    expect(seccion(nuevo, 'Spec')).toBe('La spec.')
    expect(seccion(nuevo, 'Pedido')).toBe(pedido)
    expect(nuevo).toContain('## Hallazgos de revisión')
  })
})

describe('Lo que se aprende de Jev', () => {
  const ts = T
  const decision = (tarea: string, d: 'pruebas' | 'seguridad' | 'spec' | 'modelo', p: number, ahorra: boolean, control = false): LineaDeJev => ({ t: 'decision', ts, tarea, decision: d, p, umbral: 0.5, ahorra, control })

  test('la muestra de control sale una de cada tantas, y nunca con 0', () => {
    expect(esControl(0.1, 4)).toBe(true)
    expect(esControl(0.3, 4)).toBe(false)
    expect(esControl(0, 0)).toBe(false)
  })

  test('cada paso resuelve lo que puede: spec al salir de construcción, modelo al llegar a aprobación o volver', () => {
    const abiertas = pendientes([decision('F-1', 'spec', 0.8, true), decision('F-1', 'modelo', 0.9, true)], 'F-1')
    expect(resultadosAlMover(abiertas, 'construccion', 'revision', '', ts).map(r => r.t === 'resultado' && [r.decision, r.acierto])).toEqual([['spec', true]])
    expect(resultadosAlMover(abiertas, 'revision', 'construccion', '', ts).map(r => r.t === 'resultado' && [r.decision, r.acierto])).toEqual([['modelo', false]])
    expect(resultadosAlMover(abiertas, 'construccion', 'necesita-humano', '', ts).map(r => r.t === 'resultado' && [r.decision, r.acierto])).toEqual([['spec', false]])
    // Lo resuelto ya no queda pendiente.
    expect(pendientes([decision('F-1', 'spec', 0.8, true), ...resultadosAlMover(abiertas, 'construccion', 'revision', '', ts)], 'F-1')).toEqual([])
  })

  test('la seguridad se aprende de la muestra de control, mirando sus hallazgos', () => {
    const conBloqueante = '## Hallazgos de revisión\n\n### Código\n- MENOR: nombre\n\n### Seguridad\n- BLOQUEANTE: SQL armado a mano\n\n## Veredicto\n'
    const sinBloqueante = '## Hallazgos de revisión\n\n### Código\n- BLOQUEANTE: se cae\n\n### Seguridad\n- MENOR: falta un log\n\n## Veredicto\n'
    expect(seguridadConBloqueantes(conBloqueante)).toBe(true)
    expect(seguridadConBloqueantes(sinBloqueante)).toBe(false)
    const control = pendientes([decision('F-2', 'seguridad', 0.1, false, true)], 'F-2')
    expect(resultadosAlMover(control, 'revision', 'construccion', conBloqueante, ts)[0]).toMatchObject({ decision: 'seguridad', acierto: false })
    expect(resultadosAlMover(control, 'revision', 'verificacion', sinBloqueante, ts)[0]).toMatchObject({ decision: 'seguridad', acierto: true })
    // Una seguridad saltada sin control no tiene cómo saberse: no se resuelve.
    expect(resultadosAlMover(pendientes([decision('F-3', 'seguridad', 0.1, true)], 'F-3'), 'revision', 'verificacion', sinBloqueante, ts)).toEqual([])
  })

  test('las pruebas se aprenden cuando se corren: en la muestra de control o en una verificación posterior', () => {
    expect(resultadoDePruebas(pendientes([decision('F-4', 'pruebas', 0.1, false, true)], 'F-4'), false, ts)[0]).toMatchObject({ acierto: false, evidencia: 'la muestra de control corrió las pruebas y fallaron' })
    expect(resultadoDePruebas(pendientes([decision('F-4', 'pruebas', 0.1, true)], 'F-4'), true, ts)[0]).toMatchObject({ acierto: true })
    expect(resultadoDePruebas([], true, ts)).toEqual([])
  })

  test('con cada error, el umbral se aprieta lo justo; con aciertos, no se suelta', () => {
    const base = { pruebas: 0.15, seguridad: 0.3, spec: 0.5, modelo: 0.6 }
    const lineas: LineaDeJev[] = [
      decision('F-5', 'pruebas', 0.12, true), { t: 'resultado', ts, tarea: 'F-5', decision: 'pruebas', acierto: false, evidencia: '' },
      decision('F-6', 'modelo', 0.7, true), { t: 'resultado', ts, tarea: 'F-6', decision: 'modelo', acierto: false, evidencia: '' },
      decision('F-7', 'spec', 0.9, true), { t: 'resultado', ts, tarea: 'F-7', decision: 'spec', acierto: true, evidencia: '' },
    ]
    const u = umbralesAjustados(lineas, base)
    expect(u.pruebas).toEqual({ umbral: 0.12, base: 0.15, aciertos: 0, errores: 1 })
    expect(u.modelo.umbral).toBe(0.71)
    expect(u.spec).toEqual({ umbral: 0.5, base: 0.5, aciertos: 1, errores: 0 })
    expect(u.seguridad.umbral).toBe(0.3)
    expect(lineasDeJev(lineas.map(l => JSON.stringify(l)).join('\n') + '\nbasura\n')).toEqual(lineas)
  })
})

describe('El modelo de cada rol', () => {
  test('por defecto, la spec en Opus, los revisores en Sonnet y el resto con el de la corrida; config lo cambia, y lo que no es un modelo no vale', () => {
    expect(cfg().modelos).toEqual({ spec: 'opus', construccion: 'inherit', revision: 'sonnet', aprobacion: 'opus' })
    expect(cfg('modelo_spec: fable\nmodelo_construccion: opus\nmodelo_revision: inherit\nmodelo_aprobacion: haiku').modelos)
      .toEqual({ spec: 'fable', construccion: 'opus', revision: 'inherit', aprobacion: 'haiku' })
    expect(cfg('modelo_spec: gpt-9').modelos.spec).toBe('opus')
    expect(cfg('modelo_spec: inherit').modelos.spec).toBe('inherit')
  })

  test('cuando Jev pide abaratar, gana el más barato de los dos', () => {
    expect(masBarato('sonnet', 'opus')).toBe('sonnet')
    expect(masBarato('sonnet', 'fable')).toBe('sonnet')
    expect(masBarato('sonnet', 'haiku')).toBe('haiku')
    expect(masBarato('sonnet', 'inherit')).toBe('sonnet')
  })
})

describe('Codex y Antigravity', () => {
  test('vienen apagados, y config los enciende proyecto por proyecto', () => {
    expect([cfg().revisorCodigo, cfg().escritorSpec]).toEqual(['claude', 'claude'])
    expect([cfg('revisor_codigo: codex\nescritor_spec: antigravity').revisorCodigo, cfg('revisor_codigo: ambos').revisorCodigo, cfg('escritor_spec: antigravity').escritorSpec]).toEqual(['codex', 'ambos', 'antigravity'])
    expect(cfg('revisor_codigo: gemini').revisorCodigo).toBe('claude')
  })

  test('cómo se los llama: por su ruta exacta; Codex en solo lectura, con el pedido por la entrada, y su .cmd por la consola', () => {
    expect(comandoDeCodex('/opt/bin/codex', '/e.json', '/s.json')).toEqual(['/opt/bin/codex', 'exec', '-s', 'read-only', '--output-schema', '/e.json', '-o', '/s.json', '-'])
    expect(comandoDeCodex('C:\\npm\\codex.CMD', 'e', 's').slice(0, 5)).toEqual(['cmd.exe', '/d', '/s', '/c', 'C:\\npm\\codex.CMD'])
    expect(comandoDeCodex('C:\\npm\\codex.CMD', 'e', 's').at(-1)).toBe('-')
    const agy = comandoDeAntigravity('/opt/bin/agy', 'el pedido')
    expect(agy?.slice(0, 5)).toEqual(['/opt/bin/agy', '-p', 'el pedido', '--mode', 'plan'])
    expect(agy).toContain('--sandbox')
    // A Antigravity el pedido le llega como argumento: por cmd.exe, un «&» en la tarea sería otro comando.
    expect(comandoDeAntigravity('C:\\agy\\agy.cmd', 'a & del x')).toBeNull()
    expect(comandoDeAntigravity('C:\\agy\\agy.bat', 'el pedido')).toBeNull()
    expect(comandoDeAntigravity('C:\\agy\\agy.exe', 'el pedido')?.[0]).toBe('C:\\agy\\agy.exe')
    expect(pedidoDeRevision('master', 'La spec.')).toContain('git diff master')
  })

  test('lo que devuelve Codex se lee, y lo que no tiene forma de revisión no', () => {
    const r = leerRevisionDeCodex('{"resumen":"Un problema.","hallazgos":[{"gravedad":"BLOQUEANTE","archivo":"src/a.ts","linea":38,"texto":"Se invirtió la validación."},{"gravedad":"RARO","archivo":"x","linea":1,"texto":"y"}]}')
    expect(r?.hallazgos).toHaveLength(1)
    expect(hallazgosEnMarkdown(r!)).toContain('- **BLOQUEANTE** · `src/a.ts:38` — Se invirtió la validación.')
    expect(hallazgosEnMarkdown({ resumen: '', hallazgos: [] })).toContain('Sin hallazgos.')
    expect(leerRevisionDeCodex('')).toBeNull()
    expect(leerRevisionDeCodex('{"resumen":"x"}')).toBeNull()
    expect(tokensDeCodex('…\ntokens used\n12,345\n')).toBe(12345)
    expect(tokensDeCodex('nada')).toBeNull()
  })

  test('lo que devuelve Antigravity se lee, con sus tokens; si no terminó bien, no', () => {
    const ok = JSON.stringify({ status: 'SUCCESS', response: JSON.stringify({ ambiguo: true, preguntas: ['1) ¿Cuál?'], spec: '# Spec' }), usage: { total_tokens: 249072 } })
    expect(leerSpecDeAntigravity(ok)).toEqual({ spec: { ambiguo: true, preguntas: ['1) ¿Cuál?'], spec: '# Spec' }, tokens: 249072 })
    expect(leerSpecDeAntigravity(JSON.stringify({ status: 'ERROR', response: '' }))).toBeNull()
    expect(leerSpecDeAntigravity(JSON.stringify({ status: 'SUCCESS', response: '' }))).toBeNull()
    expect(leerSpecDeAntigravity('no es json')).toBeNull()
  })

  test('el trabajo de un agente se lee por su carpeta: corriendo, terminado, leído o perdido', () => {
    const tope = 60 * 60_000
    const inicio = 1_000_000
    expect(estadoDelTrabajo({}, inicio, tope)).toEqual({ estado: 'ninguno' })
    expect(estadoDelTrabajo({ inicio: String(inicio) }, inicio + 30 * 60_000, tope)).toEqual({ estado: 'corriendo', inicio })
    expect(estadoDelTrabajo({ inicio: String(inicio), codigo: '0', salida: 'ok', error: '' }, inicio + 1000, tope))
      .toEqual({ estado: 'terminado', inicio, codigo: 0, salida: 'ok', error: '' })
    expect(estadoDelTrabajo({ inicio: String(inicio), codigo: '-1' }, inicio, tope)).toMatchObject({ estado: 'terminado', codigo: -1 })
    // Ya leído: la próxima llamada lanza otro (la tarea pudo cambiar).
    expect(estadoDelTrabajo({ inicio: String(inicio), codigo: '0', leido: 'x' }, inicio, tope)).toEqual({ estado: 'ninguno' })
    // Sin código mucho después del tope: el vigilante murió; se lanza de nuevo.
    expect(estadoDelTrabajo({ inicio: String(inicio) }, inicio + tope + 6 * 60_000, tope)).toEqual({ estado: 'ninguno' })
  })

  test('el lanzador lleva al vigilante y la configuración en un solo argumento', () => {
    const cmd = comandoDelLanzador({ dir: '/d', argv: ['codex', 'exec'], cwd: '/p', topeMs: 5, env: { FABRICA_JEV_KEY: '' } })
    expect(cmd.slice(0, 2)).toEqual(['node', '-e'])
    expect(cmd).toHaveLength(4)
    const c = JSON.parse(cmd[3])
    expect(c).toMatchObject({ dir: '/d', argv: ['codex', 'exec'], cwd: '/p', topeMs: 5 })
    expect(c.vigilante).toContain("stdio: [entrada, salida, error]")
    expect(comandoDeEspera('/d', 240000).slice(-2)).toEqual(['/d', '240000'])
  })
})

// ---- Mejoras del 19 de octubre de 2026 ------------------------------------------------------

describe('Configuración nueva', () => {
  test('lint_extensiones, sql e integracion, con sus valores por defecto', () => {
    const c = leerConfig(undefined)
    expect(c.lintExtensiones).toEqual([])
    expect(c.sql).toBe('')
    expect(c.integracion).toBe('auto')
    const d = leerConfig('---\nlint_extensiones: js, .TS ;css\nsql: sqlcmd -i {archivos}\nintegracion: manual\n---')
    expect(d.lintExtensiones).toEqual(['.js', '.ts', '.css'])
    expect(d.sql).toBe('sqlcmd -i {archivos}')
    expect(d.integracion).toBe('manual')
    expect(extensiones('')).toEqual([])
  })
})

describe('Lint sobre lo que cambió la tarea', () => {
  const archivos = ['WolffWeb/wwwroot/js/Ventas/ventas.js', 'WolffWeb/Controllers/VentasController.cs', 'docs/a b.md']
  test('sin el marcador, el comando va tal cual', () => {
    expect(comandoDeLint('npm run lint', archivos, ['.js'], true)).toEqual({ comando: 'npm run lint' })
  })
  test('con {archivos}, solo los de la tarea con esas extensiones, entre comillas', () => {
    expect(comandoDeLint('npx eslint {archivos}', archivos, ['.js'], true)).toEqual({ comando: "npx eslint 'WolffWeb/wwwroot/js/Ventas/ventas.js'" })
    expect(comandoDeLint('npx eslint {archivos}', archivos, [], false)).toEqual({ comando: "npx eslint 'WolffWeb/wwwroot/js/Ventas/ventas.js' 'WolffWeb/Controllers/VentasController.cs' 'docs/a b.md'" })
  })
  test('sin archivos que coincidan, no hay nada que lintear', () => {
    expect(comandoDeLint('npx eslint {archivos}', archivos, ['.ts'], true)).toEqual({ sinArchivos: true })
    expect(comandoDeLint('npx eslint {archivos}', [], [], true)).toEqual({ sinArchivos: true })
  })
  test('las comillas de una ruta no cortan el comando, ni en PowerShell ni en sh', () => {
    expect(conArchivos('x {archivos}', ["it's.js"], true)).toBe("x 'it''s.js'")
    expect(conArchivos('x {archivos}', ["it's.js"], false)).toBe("x 'it'\\''s.js'")
  })
  test('los .sql de la tarea', () => {
    expect(archivosSql(['a.sql', 'b.SQL', 'c.cs'])).toEqual(['a.sql', 'b.SQL'])
  })
})

describe('Rama de origen', () => {
  test('se guarda al entrar a construcción y no se pisa en el retrabajo', () => {
    const r = mover(base('spec'), { a: 'construccion', ahora: T, ramaOrigen: 'desarrollo' }, cfg())
    expect(r.ok && r.datos.rama_origen).toBe('desarrollo')
    const vuelta = mover({ ...base('revision'), rama_origen: 'desarrollo' }, { a: 'construccion', ahora: T, ramaOrigen: 'otra' }, cfg())
    expect(vuelta.ok && vuelta.datos.rama_origen).toBe('desarrollo')
  })
  test('rama_base solo es el respaldo de las tareas que no la tienen', () => {
    expect(ramaDeOrigen({ rama_origen: 'desarrollo' }, cfg('rama_base: main'))).toBe('desarrollo')
    expect(ramaDeOrigen({}, cfg('rama_base: main'))).toBe('main')
  })
  test('se compara contra el merge-base', () => {
    expect(baseDeComparacion('desarrollo')).toEqual(['git', 'merge-base', 'HEAD', 'desarrollo'])
  })
  test('a Codex se le pide el diff contra un commit, no contra el nombre de la rama', () => {
    const hash = '3f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39'
    const p = pedidoDeRevision(hash, 'la spec')
    expect(p).toContain(`git diff ${hash}`)
    expect(p).not.toMatch(/\bmain\b|\bdesarrollo\b/)
  })
  test('un worktree propio es una carpeta distinta de la raíz', () => {
    expect(tieneWorktreePropio('C:/p/Repo-fabrica/F-001', 'C:\\p\\Repo')).toBe(true)
    expect(tieneWorktreePropio('C:\\p\\Repo\\', 'C:/p/Repo')).toBe(false)
    expect(tieneWorktreePropio('', 'C:/p/Repo')).toBe(false)
  })
})

describe('Sincronizar antes de aprobar', () => {
  const lista = { ...base('verificacion'), verificacion: 'ok' }
  test('sin sincronizar no pasa a aprobación', () => {
    const r = mover(lista, { a: 'aprobacion', ahora: T, requiereSincronizar: true }, cfg())
    expect(r.ok).toBe(false)
    expect(mover({ ...lista, sincronizada: T }, { a: 'aprobacion', ahora: T, requiereSincronizar: true }, cfg()).ok).toBe(true)
  })
  test('con un conflicto sin resolver no pasa a aprobación', () => {
    const r = mover({ ...lista, sincronizada: T }, { a: 'aprobacion', ahora: T, requiereSincronizar: true, conflicto: 'quedan marcadores en a.cs' }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('a.cs')
  })
  test('volver a construcción obliga a sincronizar otra vez', () => {
    const r = mover({ ...lista, sincronizada: T }, { a: 'construccion', ahora: T, nota: 'conflicto' }, cfg())
    expect(r.ok && r.datos.sincronizada).toBe('')
    expect(r.ok && r.datos.vueltas).toBe('1')
  })
  test('los marcadores de conflicto', () => {
    expect(tieneMarcadores('a\r\n<<<<<<< HEAD\r\nx\r\n=======\r\ny\r\n>>>>>>> desarrollo\r\n')).toBe(true)
    expect(tieneMarcadores('// ======= separador =======\nnada')).toBe(false)
  })
  test('el conflicto queda como BLOQUEANTE en los hallazgos, sin repetirse', () => {
    const c = tareaNueva('F-001', 'x', 'pedido', T)
    const una = conHallazgoDeConflicto(c, 'desarrollo', ['a.cs', 'b.js'])
    const dos = conHallazgoDeConflicto(una, 'desarrollo', ['a.cs'])
    expect(seccion(una, 'Hallazgos de revisión')).toContain('**BLOQUEANTE** · `b.js`')
    expect(seccion(dos, 'Hallazgos de revisión').match(/### Sincronización/g)?.length).toBe(1)
    expect(seccion(dos, 'Hallazgos de revisión')).not.toContain('b.js')
  })
})

describe('Con un BLOQUEANTE no se sigue a verificar', () => {
  const conHallazgos = (texto: string) => ponerSeccion(tareaNueva('F-011', 'x', 'pedido', T), 'Hallazgos de revisión', texto)
  test('se cuentan los BLOQUEANTES, con o sin negrita; «sin bloqueantes» no', () => {
    expect(bloqueantesEn(conHallazgos('### Código\n\n_Revisión de Codex._ Algo.\n\n- **BLOQUEANTE** · `a.cs:3` — rompe\n- **MENOR** · `b.cs:1` — estilo'))).toBe(1)
    expect(bloqueantesEn(conHallazgos('1. BLOQUEANTE: falta el permiso\n2. [BLOQUEANTE] otro\n- MENOR: nada'))).toBe(2)
    expect(bloqueantesEn(conHallazgos('### Seguridad\n\nSin BLOQUEANTES. Ningún hallazgo.'))).toBe(0)
    expect(bloqueantesEn(tareaNueva('F-011', 'x', 'pedido', T))).toBe(0)
  })
  test('mover de revisión a verificación lo rechaza', () => {
    const r = mover(base('revision'), { a: 'verificacion', ahora: T, bloqueantes: 1 }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('BLOQUEANTE')
    expect(mover(base('revision'), { a: 'verificacion', ahora: T, bloqueantes: 0 }, cfg()).ok).toBe(true)
    expect(mover(base('revision'), { a: 'construccion', ahora: T, bloqueantes: 2, nota: 'corregir' }, cfg()).ok).toBe(true)
  })
  test('al volver a revisión, lo de la vuelta anterior queda en «Hallazgos anteriores»', () => {
    const c = archivarHallazgos(conHallazgos('### Sincronización\n\n- **BLOQUEANTE** · `app.js` — conflicto'), T)
    expect(bloqueantesEn(c)).toBe(0)
    expect(seccion(c, 'Hallazgos de revisión')).toBe('')
    expect(seccion(c, 'Hallazgos anteriores')).toContain('`app.js` — conflicto')
    const dos = archivarHallazgos(ponerSeccion(c, 'Hallazgos de revisión', '- **MENOR** · otro'), '2026-10-17T00:00:00.000Z')
    expect(seccion(dos, 'Hallazgos anteriores')).toContain('`app.js`')
    expect(seccion(dos, 'Hallazgos anteriores')).toContain('otro')
    // Sin hallazgos, nada cambia.
    const sin = tareaNueva('F-011', 'x', 'pedido', T)
    expect(archivarHallazgos(sin, T)).toBe(sin)
  })
})

describe('De qué rama sale una tarea', () => {
  test('la de trabajo de config manda; si no hay, la que pidió el orquestador, y si no, la de la raíz', () => {
    expect(ramaParaLaTarea({ deConfig: 'developer/fcanales', pedida: 'otra', actual: 'main' })).toEqual({ rama: 'developer/fcanales' })
    expect(ramaParaLaTarea({ deConfig: '', pedida: 'desarrollo', actual: 'otra' })).toEqual({ rama: 'desarrollo' })
    expect(ramaParaLaTarea({ deConfig: '', pedida: '', actual: 'desarrollo\n' })).toEqual({ rama: 'desarrollo' })
  })
  test('nunca main ni master, ni sin rama', () => {
    for (const o of [{ deConfig: 'main', pedida: '', actual: '' }, { deConfig: '', pedida: 'master', actual: '' }, { deConfig: '', pedida: '', actual: 'main' }]) {
      const r = ramaParaLaTarea(o)
      expect('nota' in r && r.nota).toContain('no trabaja sobre')
    }
    const sin = ramaParaLaTarea({ deConfig: '', pedida: '', actual: '' })
    expect('nota' in sin && sin.nota).toContain('detached HEAD')
    expect(esRamaProtegida(' MAIN ')).toBe(true)
    expect(esRamaProtegida('developer/main')).toBe(false)
  })
  test('sin worktree, ni la raíz ni la rama de trabajo de config pueden ser protegidas', () => {
    expect(protegidaSinWorktree({ deConfig: 'main', actual: 'developer/fcanales' })).toContain('La rama de trabajo de config es «main»')
    expect(protegidaSinWorktree({ deConfig: '', actual: 'master\n' })).toContain('La raíz está en «master»')
    expect(protegidaSinWorktree({ deConfig: 'developer/fcanales', actual: 'developer/fcanales' })).toBeNull()
    expect(protegidaSinWorktree({ deConfig: '', actual: '' })).toBeNull()
  })
  test('config trae la rama de trabajo, sin espacios', () => {
    expect(leerConfig('---\nrama_trabajo: developer/fcanales \n---\n').ramaTrabajo).toBe('developer/fcanales')
    expect(leerConfig('---\nbuild: x\n---\n').ramaTrabajo).toBe('')
  })
})

describe('Integrar al pasar a hecho', () => {
  const d = { id: 'F-010', ramaActual: 'desarrollo', ramaOrigen: 'desarrollo', ramaTarea: 'fabrica/F-010', ffPosible: true, suciosQueToca: [] as string[] }
  test('con todo en orden, se integra', () => {
    expect(decidirIntegracion(d)).toEqual({ hacer: 'integrar' })
  })
  test('con la raíz en otra rama, a un humano', () => {
    const r = decidirIntegracion({ ...d, ramaActual: 'main' })
    expect(r.hacer).toBe('humano')
    if (r.hacer === 'humano') expect(r.nota).toContain('«main»')
    expect(decidirIntegracion({ ...d, ramaActual: '' }).hacer).toBe('humano')
  })
  test('en main o en master no se integra nunca, aunque la tarea haya salido de ahí', () => {
    for (const rama of ['main', 'master', 'Main']) {
      const r = decidirIntegracion({ ...d, ramaActual: rama, ramaOrigen: rama })
      expect(r.hacer).toBe('humano')
      if (r.hacer === 'humano') {
        expect(r.nota).toContain('no integra en esa rama')
        expect(r.bloqueo).toBeUndefined()
      }
    }
  })
  test('si la rama de origen avanzó, a un humano para volver a sincronizar', () => {
    const r = decidirIntegracion({ ...d, ffPosible: false })
    expect(r.hacer === 'humano' && r.nota).toContain('sincroniza')
  })
  test('si sus cambios sin commit tocan los mismos archivos, a un humano con la lista', () => {
    const r = decidirIntegracion({ ...d, suciosQueToca: ['WolffWeb/Controllers/VentasController.cs'] })
    expect(r.hacer === 'humano' && r.nota).toContain('VentasController.cs')
  })
  test('lo mecánico se anota, y la tarea se reintenta sola cuando deja de pasar', () => {
    expect(decidirIntegracion({ ...d, ramaActual: 'main' })).toMatchObject({ bloqueo: 'rama' })
    expect(decidirIntegracion({ ...d, ffPosible: false })).toMatchObject({ bloqueo: 'avanzo' })
    expect(decidirIntegracion({ ...d, suciosQueToca: ['a.cs'] })).toMatchObject({ bloqueo: 'sucios' })
    const ahora = { ramaActual: 'desarrollo', ramaOrigen: 'desarrollo', suciosQueToca: [] as string[] }
    expect(reintentoDeIntegracion('rama', ahora)).toBe('integrar')
    expect(reintentoDeIntegracion('rama', { ...ahora, ramaActual: 'main' })).toBeNull()
    expect(reintentoDeIntegracion('sucios', { ...ahora, suciosQueToca: ['a.cs'] })).toBeNull()
    expect(reintentoDeIntegracion('sucios', ahora)).toBe('integrar')
    expect(reintentoDeIntegracion('avanzo', ahora)).toBe('sincronizar')
  })
  test('al reintentar integrar, los veredictos siguen valiendo; al retomarla, el bloqueo se borra', () => {
    const antes = '2026-10-16T10:00:00.000Z'
    const frenada = mover({ ...base('aprobacion'), verificacion: 'ok', en_aprobacion_desde: antes }, { a: 'necesita-humano', nota: 'otra rama', ahora: T, bloqueo: 'rama' }, cfg())
    expect(frenada.ok && frenada.datos.bloqueo).toBe('rama')
    const retomada = frenada.ok ? mover(frenada.datos, { a: 'aprobacion', ahora: T }, cfg()) : null
    expect(retomada?.ok && retomada.datos.en_aprobacion_desde).toBe(antes)
    expect(retomada?.ok && retomada.datos.bloqueo).toBe('')
    // Sin bloqueo mecánico (una pregunta), volver a aprobación pide veredictos nuevos.
    const pregunta = mover({ ...base('necesita-humano'), verificacion: 'ok', en_aprobacion_desde: antes }, { a: 'aprobacion', ahora: T }, cfg())
    expect(pregunta.ok && pregunta.datos.en_aprobacion_desde).toBe(T)
  })
  test('lo que dice git al negarse', () => {
    const salida = 'Updating 1a2b..3c4d\nerror: Your local changes to the following files would be overwritten by merge:\n\tWolffWeb/x.cs\n\tWolffWeb/y.js\nPlease commit your changes or stash them before you merge.\nAborting\n'
    expect(archivosQueGitProtege(salida)).toEqual(['WolffWeb/x.cs', 'WolffWeb/y.js'])
    expect(archivosQueGitProtege('fatal: Not possible to fast-forward, aborting.')).toEqual([])
  })
  test('git status --porcelain y archivos en común', () => {
    expect(rutasDePorcelain(' M a.cs\n?? "b c.js"\nR  viejo.cs -> nuevo.cs\n')).toEqual(['a.cs', 'b c.js', 'nuevo.cs'])
    expect(enComun(['A/b.cs', 'c.js'], ['a\\B.cs'])).toEqual(['A/b.cs'])
  })
})

describe('Dependencias', () => {
  test('se escriben al crear y se leen', () => {
    const md = tareaNueva('F-010', 'x', 'p', T, ['F-009', 'F-007'])
    expect(partir(md).datos.depende_de).toBe('F-009,F-007')
    expect(tareaDesde(md, 'f.md')?.dependeDe).toEqual(['F-009', 'F-007'])
    expect(partir(tareaNueva('F-011', 'x', 'p', T)).datos.depende_de).toBeUndefined()
  })
  test('no sale de pendiente hasta que estén hechas e integradas', () => {
    const espera = mover(base('pendiente'), { a: 'spec', ahora: T, dependencias: [{ id: 'F-009', estado: 'hecho', integrada: false }] }, cfg())
    expect(espera.ok).toBe(false)
    if (!espera.ok) expect(espera.error).toContain('F-009')
    expect(mover(base('pendiente'), { a: 'spec', ahora: T, dependencias: [{ id: 'F-009', estado: 'hecho', integrada: true }] }, cfg()).ok).toBe(true)
    // Con integración manual nunca queda integrada: basta con hecha.
    expect(mover(base('pendiente'), { a: 'spec', ahora: T, dependencias: [{ id: 'F-009', estado: 'hecho', integrada: false }] }, cfg('integracion: manual')).ok).toBe(true)
  })
  test('una dependencia descartada la manda a un humano', () => {
    const r = mover(base('pendiente'), { a: 'spec', ahora: T, dependencias: [{ id: 'F-009', estado: 'descartada', integrada: false }] }, cfg())
    expect(r.ok && r.datos.estado).toBe('necesita-humano')
    expect(r.ok && r.datos.motivo).toContain('F-009')
    expect(revisarDependencias([{ id: 'F-1', estado: 'no-existe', integrada: false }], cfg()).descartadas.length).toBe(1)
  })
  test('un ciclo se detecta', () => {
    const grafo = new Map([['F-002', ['F-003']], ['F-003', ['F-001']]])
    expect(cicloDeDependencias('F-001', ['F-002'], grafo)).toEqual(['F-001', 'F-002', 'F-003', 'F-001'])
    expect(cicloDeDependencias('F-001', ['F-004'], grafo)).toBeNull()
    expect(cicloDeDependencias('F-001', [], grafo)).toBeNull()
  })
})

describe('Tareas que tocan los mismos archivos', () => {
  const pedido = (archivos: string) => `## Pedido\n\nAlgo.\n\n### Archivos o zonas que toca\n${archivos}\n\n### Fuera de alcance\n- \`otro.cs\`\n`
  test('se leen de «Archivos o zonas que toca» y de «Archivos probables»', () => {
    expect(archivosQueToca(pedido('- `WolffWeb/Controllers/VentasController.cs` (reutiliza `Guardar`)\n- WolffWeb/wwwroot/js/ventas.js — la grilla'))).toEqual(['wolffweb/controllers/ventascontroller.cs', 'wolffweb/wwwroot/js/ventas.js'])
    expect(archivosQueToca('**Archivos probables**\n- `src/a.ts:12` — cambia\n\n**Riesgos y notas**\n- `src/b.ts`')).toEqual(['src/a.ts'])
    expect(archivosQueToca('## Pedido\n\nnada')).toEqual([])
  })
  test('la de id mayor espera a la otra mientras no esté integrada', () => {
    const t = (id: string, estado: 'pendiente' | 'construccion' | 'hecho', archivos: string[], integrada?: string) => ({ id, estado, archivos, integrada })
    const c = choquesDe([t('F-013', 'pendiente', ['a.cs', 'b.js']), t('F-010', 'pendiente', ['a.cs']), t('F-011', 'pendiente', ['z.cs'])], cfg())
    expect(c.get('F-013')).toEqual([{ con: 'F-010', archivos: ['a.cs'] }])
    expect(c.has('F-010')).toBe(false)
    expect(choquesDe([t('F-010', 'hecho', ['a.cs'], 'abc'), t('F-013', 'pendiente', ['a.cs'])], cfg()).size).toBe(0)
    expect(choquesDe([t('F-010', 'construccion', ['a.cs']), t('F-013', 'pendiente', ['a.cs'])], cfg()).size).toBe(1)
  })
  test('mover no la saca de pendiente mientras espera', () => {
    const r = mover(base('pendiente'), { a: 'spec', ahora: T, esperaPorArchivos: [{ con: 'F-010', archivos: ['a.cs'] }] }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('F-010')
  })
})

describe('La spec es obligatoria con dependencias o código reutilizado', () => {
  const largo = 'Agregar un botón de reimprimir boleta en el mantenedor de ventas, con su permiso y su prueba.'
  test('con depende_de, sin preguntar a Jev', () => {
    const d = decidirSpec({ conJev: true, pedido: largo, yaTieneSpec: false, dependeDe: ['F-009'], jev: 0.99 })
    expect(d).toMatchObject({ si: true, por: 'regla' })
  })
  test('si dice que reutiliza algo existente, sin preguntar a Jev', () => {
    const pedido = `${largo}\n\n### Archivos o zonas que toca\n- reutiliza \`MensajeErrorUsuario\``
    expect(reutilizaCodigo(pedido)).toBe(true)
    expect(reutilizaCodigo(`${largo}\n\n##### Archivos o zonas que toca\n- el controller existente`)).toBe(true)
    expect(reutilizaCodigo(`${largo}\n\n### Fuera de alcance\n- reutiliza nada`)).toBe(false)
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: false, jev: 0.99 })).toMatchObject({ si: true, por: 'regla' })
    // Sin esas reglas, Jev sigue decidiendo.
    expect(decidirSpec({ conJev: true, pedido: largo, yaTieneSpec: false, jev: 0.99 }).si).toBe(false)
  })
})

describe('Una tarea la trabaja una sesión a la vez', () => {
  test('al sacarla de pendiente la toma la sesión, y cada movimiento renueva la toma', () => {
    const r = mover(base('pendiente'), { a: 'spec', ahora: T, sesion: 'ses-a' }, cfg())
    expect(r.ok && r.datos.tomada_por).toBe('ses-a')
    expect(r.ok && Date.parse(r.datos.tomada_hasta!) - Date.parse(T)).toBe(TOMA_MS)
  })
  test('otra sesión no la mueve mientras no venza', () => {
    const hasta = new Date(Date.parse(T) + 10 * 60_000).toISOString()
    const tomada = { ...base('spec'), tomada_por: 'ses-a', tomada_hasta: hasta }
    const r = mover(tomada, { a: 'construccion', ahora: T, sesion: 'ses-b' }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ses-a')
    expect(mover(tomada, { a: 'construccion', ahora: T, sesion: 'ses-a' }, cfg()).ok).toBe(true)
    const despues = new Date(Date.parse(hasta) + 1000).toISOString()
    expect(tomadaPorOtra(tomada, 'ses-b', despues)).toBeNull()
  })
  test('al cerrarse la sesión, lo suyo queda libre; lo de otra, no', () => {
    const tomada = { ...base('aprobacion'), tomada_por: 'ses-a', tomada_hasta: new Date(Date.parse(T) + TOMA_MS).toISOString() }
    expect(liberadaPor(tomada, 'ses-a')).toMatchObject({ tomada_por: '', tomada_hasta: '', estado: 'aprobacion' })
    expect(liberadaPor(tomada, 'ses-b')).toBeNull()
    expect(liberadaPor(base('spec'), 'ses-a')).toBeNull()
  })
  test('hecho, descartada y necesita-humano la liberan', () => {
    const tomada = { ...base('construccion'), tomada_por: 'ses-a', tomada_hasta: new Date(Date.parse(T) + TOMA_MS).toISOString() }
    const r = mover(tomada, { a: 'necesita-humano', nota: 'pregunta', ahora: T, sesion: 'ses-a' }, cfg())
    expect(r.ok && r.datos.tomada_por).toBe('')
    expect(r.ok && r.datos.tomada_hasta).toBe('')
  })
})

describe('Menos ruido en los worktrees', () => {
  test('CRLF: cuándo se normaliza y cómo', () => {
    expect(usaCrlf('true\n', '')).toBe(true)
    expect(usaCrlf('', '*.cs text eol=crlf')).toBe(true)
    expect(usaCrlf('input', '* text=auto')).toBe(false)
    expect(aCrlf('a\nb\r\nc')).toBe('a\r\nb\r\nc')
    expect(aCrlf('a\r\nb')).toBeNull()
  })
  test('node_modules: se enlaza si git lo ignora, y se quita si la tarea cambió el lockfile', () => {
    const d = { raizTiene: true, worktreeTiene: false, enlazado: false, ignorado: true, lockCambio: false }
    expect(enlaceDeNodeModules(d)).toBe('enlazar')
    expect(enlaceDeNodeModules({ ...d, ignorado: false })).toBe('nada')
    expect(enlaceDeNodeModules({ ...d, worktreeTiene: true })).toBe('nada')
    expect(enlaceDeNodeModules({ ...d, enlazado: true, worktreeTiene: true, lockCambio: true })).toBe('quitar')
    expect(esLockfile('WolffWeb/package-lock.json')).toBe(true)
    expect(esLockfile('package.json')).toBe(false)
  })
})

describe('config.md no lo cambia un agente', () => {
  test('la ruta de config.md, con cualquier barra', () => {
    expect(esConfigDeLaFabrica('C:\\p\\Repo\\factory\\config.md')).toBe(true)
    expect(esConfigDeLaFabrica('/p/Repo/factory/config.md')).toBe(true)
    expect(esConfigDeLaFabrica('/p/Repo/factory/tareas/F-001-x.md')).toBe(false)
    expect(esConfigDeLaFabrica('/p/Repo/docs/config.md')).toBe(false)
  })

  test('un subagente no puede cambiarlo; el hilo principal, sí', () => {
    expect(frenaConfig('C:/p/Repo/factory/config.md', 'agente-1')).toBe(CONFIG_SOLO_EL_USUARIO)
    expect(frenaConfig('C:/p/Repo/factory/config.md', undefined)).toBeNull()
    expect(frenaConfig('C:/p/Repo/app.js', 'agente-1')).toBeNull()
  })

  test('la misma ruta escrita de otra forma no se salta la guardia', () => {
    expect(frenaConfig('C:/p/Repo/factory/./config.md', 'agente-1')).toBe(CONFIG_SOLO_EL_USUARIO)
    expect(frenaConfig('C:\\p\\Repo\\factory\\x\\..\\config.md', 'agente-1')).toBe(CONFIG_SOLO_EL_USUARIO)
    expect(rutaNormal('C:/p/Repo/factory/x/../memoria//ficha.md')).toBe('C:/p/Repo/factory/memoria/ficha.md')
    expect(rutaNormal('/home/el/../../etc/x')).toBe('/etc/x')
    expect(rutaNormal('../fuera/./a.md')).toBe('../fuera/a.md')
  })
})

describe('La memoria no la escribe un agente', () => {
  test('ningún subagente escribe en factory/memoria/, con cualquier barra ni forma de la ruta; el hilo principal sí', () => {
    for (const ruta of [
      'C:/p/Repo/factory/memoria/ficha.md',
      'C:\\p\\Repo\\factory\\memoria\\decisiones\\D-0001-postgresql.md',
      'C:/p/Repo/Factory/Memoria/propuestas/P-0001-x.md',
      'C:/p/Repo/factory/./memoria/bitacora/2026-10.md',
      'C:/p/Repo/factory/tareas/../memoria/ficha.md',
      'factory/memoria/LEEME.md',
    ]) {
      expect(frenaMemoria(ruta, 'agente-1')).toBe(MEMORIA_SOLO_EL_USUARIO)
      expect(frenaMemoria(ruta, undefined)).toBeNull()
    }
    expect(frenaMemoria('C:/p/Repo/factory/tareas/F-001-algo.md', 'agente-1')).toBeNull()
    expect(frenaMemoria('C:/p/Repo/factory/memoria-vieja.md', 'agente-1')).toBeNull()
    expect(frenaMemoria('C:/p/Repo/src/memoria/ficha.md', 'agente-1')).toBeNull()
  })

  test('tampoco la de la planta, si la corrida trae su carpeta', () => {
    const planta = 'C:/Users/el/compania/comun/fabrica/memoria'
    expect(frenaMemoria('C:/Users/el/compania/comun/fabrica/memoria/ficha.md', 'agente-1', planta)).toBe(MEMORIA_SOLO_EL_USUARIO)
    expect(frenaMemoria('c:\\users\\el\\compania\\comun\\fabrica\\memoria\\decisiones\\D-0001.md', 'agente-1', `${planta}/`)).toBe(MEMORIA_SOLO_EL_USUARIO)
    expect(frenaMemoria('C:/Users/el/compania/comun/fabrica/memoria-otra/ficha.md', 'agente-1', planta)).toBeNull()
    expect(frenaMemoria('C:/Users/el/compania/comun/fabrica/ajustes.json', 'agente-1', planta)).toBeNull()
    expect(esDeLaMemoria('C:/x/ficha.md', '  ')).toBe(false)
  })
})

describe('Memoria del proyecto', () => {
  const FICHA = [
    '# Ficha · pos-tiendas',
    '',
    '- [base-de-datos] PostgreSQL 16, con Prisma. (D-0001)',
    '- [base-de-datos] NO: SQL Server, MySQL ni MongoDB. (D-0001)',
    '- [ui] NO: Bootstrap.',
  ].join('\n')

  test('de una ficha se leen solo las reglas NO:, sin de dónde salen', () => {
    expect(prohibicionesDe(FICHA)).toEqual([
      { tema: 'base-de-datos', texto: 'SQL Server, MySQL ni MongoDB.', linea: 4 },
      { tema: 'ui', texto: 'Bootstrap.', linea: 5 },
    ])
    expect(terminosDe('SQL Server, MySQL ni MongoDB.')).toEqual(['SQL Server', 'MySQL', 'MongoDB'])
  })

  test('un pedido que nombra algo prohibido es una sospecha; una palabra dentro de otra, no', () => {
    const choques = choquesConLaMemoria({ proyecto: FICHA, planta: '- [estilo] NO: jQuery.' }, 'Migrar el stock a MongoDB y usar jquery en el formulario.')
    expect(choques.map(c => [c.donde, c.termino])).toEqual([['planta', 'jQuery'], ['proyecto', 'MongoDB']])
    expect(notaDeChoques(choques)).toContain('«MongoDB» (la ficha del proyecto, [base-de-datos] NO: SQL Server, MySQL ni MongoDB.)')
    expect(choquesConLaMemoria({ proyecto: FICHA }, 'Revisar el MySQLConnector y agregar un índice en PostgreSQL')).toEqual([])
    expect(choquesConLaMemoria({}, 'MongoDB')).toEqual([])
  })

  test('con un choque la spec no se salta, aunque Jev diga que el pedido ya es una spec', () => {
    const pedido = 'Agregar una tabla de stock por tienda en MongoDB, con su índice y su migración, para el reporte.'
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: false, jev: 0.95, prohibidos: ['MongoDB'] })).toEqual({ si: true, por: 'regla', p: null, motivo: 'el pedido nombra «MongoDB», que la memoria prohíbe: la spec lo revisa' })
    expect(decidirSpec({ conJev: true, pedido, yaTieneSpec: false, jev: 0.95, prohibidos: [] }).si).toBe(false)
  })

  test('a los agentes les llegan las dos fichas enteras y dónde buscar las decisiones; sin fichas, nada', () => {
    const texto = memoriaParaLosAgentes({ vault: 'C:/p/Repo/factory/memoria', vaultDeLaPlanta: 'C:/c/memoria', planta: '- [estilo] NO: jQuery.', proyecto: FICHA })
    expect(texto).toContain('### Ficha de la planta')
    expect(texto).toContain('- [ui] NO: Bootstrap.')
    expect(texto).toContain('grep -rl "^temas:.*<tema>" C:/p/Repo/factory/memoria/decisiones/')
    expect(texto.indexOf('Ficha de la planta')).toBeLessThan(texto.indexOf('Ficha de este proyecto'))
    expect(memoriaParaLosAgentes({ vault: null, vaultDeLaPlanta: null, planta: null, proyecto: null })).toBe('')
  })
})

/**
 * Una propuesta tal como la escribe el mod. La misma está en la prueba de la aplicación
 * (src/lib/fabrica/memoria/memoria.test.ts), que comprueba que su revisor del vault la lee sin
 * problemas: si cambia aquí, cambia allá.
 */
const PROPUESTA_ESCRITA = [
  '---',
  'id: P-0002',
  'titulo: Validar el cuerpo con Zod',
  'estado: propuesta',
  'fecha: 2026-10-26',
  'temas: validacion, api',
  'origen: F-014',
  'propone: "fabrica:constructor"',
  'regla: El cuerpo de cada ruta se valida con Zod.',
  'reemplaza: ""',
  '---',
  '',
  '## Decisión',
  '',
  'Las rutas nuevas validan el cuerpo con un esquema de Zod.',
  '',
  '## Por qué',
  '',
  'Zod ya está en el proyecto y da los tipos.',
  '',
  '## Qué se descartó',
  '',
  '- Validar a mano: se repetía en cada ruta.',
  '',
  '## Qué implica',
  '',
  '_(sin escribir)_',
  '',
].join('\n')

describe('Propuestas y bitácora', () => {
  const PARA_LA_MEMORIA = [
    '### Validar el cuerpo con Zod',
    '- temas: Validación, API',
    '- regla: El cuerpo de cada ruta se valida con Zod.',
    '- decisión: Las rutas nuevas validan el cuerpo con un esquema de Zod.',
    '- por qué: Zod ya está en el proyecto y da los tipos.',
    '- descartado:',
    '  - Validar a mano: se repetía en cada ruta.',
    '- propone: constructor',
    '',
    '### Los reportes van en src/reportes',
    '- temas: estructura',
    '- decision: Cada reporte nuevo va en su archivo dentro de src/reportes/.',
    '- propone: fabrica:spec-escritor',
  ].join('\n')
  const conMemoria = (texto: string, pedido = 'Exportar las ventas a CSV.') =>
    partir(tareaNueva('F-014', 'Exportar ventas a CSV', pedido, T)).cuerpo.replace(PARA_LA_MEMORIA_VACIA, texto)
  const RECHAZADA = unir(
    { id: 'P-0002', titulo: 'Validar el cuerpo con zod', estado: 'rechazada', fecha: '2026-10-20', temas: 'otra-cosa', origen: 'F-010', propone: 'fabrica', regla: 'Se valida con Zod.', reemplaza: '', motivo: 'Ya se valida en el middleware.' },
    '\n## Decisión\n\nZod.\n')
  const cierre = (cuerpo: string, extra: Partial<Parameters<typeof cierreEnLaMemoria>[0]> = {}) => cierreEnLaMemoria({
    tarea: { id: 'F-014', titulo: 'Exportar ventas a CSV', tituloAjeno: false, cuerpo },
    ahora: '2026-10-26T15:00:00.000Z',
    existentes: { propuestas: [{ nombre: 'P-0001-algo.md', texto: '---\nid: P-0001\ntitulo: Algo\nestado: aprobada\n---\n' }], decisiones: [] },
    bitacora: null,
    toca: ['src/reportes/ventas.ts', 'src/reportes/ventas.test.ts'],
    ...extra,
  })

  test('la plantilla trae la sección, antes de la bitácora, y vacía no propone nada', () => {
    const cuerpo = partir(tareaNueva('F-001', 'Algo', 'Hacer algo', T)).cuerpo
    expect(cuerpo.indexOf('## Para la memoria')).toBeGreaterThan(cuerpo.indexOf('## Veredicto'))
    expect(cuerpo.indexOf('## Para la memoria')).toBeLessThan(cuerpo.indexOf('## Bitácora'))
    expect(propuestasDe(cuerpo)).toEqual({ propuestas: [], problemas: [] })
  })

  test('las propuestas se leen con las claves como las escriba el agente, con tildes o sin ellas', () => {
    const { propuestas, problemas } = propuestasDe(conMemoria(PARA_LA_MEMORIA))
    expect(problemas).toEqual([])
    expect(propuestas.map(p => [p.titulo, p.temas, p.propone])).toEqual([
      ['Validar el cuerpo con Zod', ['validacion', 'api'], 'fabrica:constructor'],
      ['Los reportes van en src/reportes', ['estructura'], 'fabrica:spec-escritor'],
    ])
    expect(propuestas[0]!.secciones['Qué se descartó']).toBe('- Validar a mano: se repetía en cada ruta.')
    expect(propuestas[0]!.secciones['Qué implica']).toBe('')
  })

  test('una tarea con dos propuestas deja dos archivos y una línea en la bitácora del mes', () => {
    const r = cierre(conMemoria(PARA_LA_MEMORIA))
    expect(r.propuestas.map(p => p.nombre)).toEqual(['P-0002-validar-el-cuerpo-con-zod.md', 'P-0003-los-reportes-van-en-src-reportes.md'])
    expect(r.propuestas[0]!.texto).toBe(PROPUESTA_ESCRITA)
    expect(partir(r.propuestas[1]!.texto).datos).toMatchObject({ id: 'P-0003', estado: 'propuesta', origen: 'F-014', propone: 'fabrica:spec-escritor', regla: '' })
    expect(r.bitacora).toEqual({
      nombre: '2026-10.md',
      texto: '# Bitácora de 2026-10\n\n- 2026-10-26 · F-014 · Exportar ventas a CSV · hecha · toca: src/reportes/ventas.ts, src/reportes/ventas.test.ts\n',
    })
    expect(r.nota).toBe('memoria: propuestas P-0002, P-0003 para que las apruebe una persona.')
  })

  test('sin la sección, solo la línea; y la línea se agrega a la bitácora que ya había', () => {
    const cuerpo = partir(tareaNueva('F-014', 'Exportar ventas a CSV', 'Exportar.', T)).cuerpo.replace('## Spec', '## Spec\n\nRiesgos: aplica D-0001 y D-0001.')
    const r = cierre(cuerpo, { bitacora: '# Bitácora de 2026-10\n\n- 2026-10-02 · F-001 · Otra · hecha\n', toca: [] })
    expect(r.propuestas).toEqual([])
    expect(r.nota).toBe('')
    expect(r.bitacora.texto).toBe('# Bitácora de 2026-10\n\n- 2026-10-02 · F-001 · Otra · hecha\n- 2026-10-26 · F-014 · Exportar ventas a CSV · hecha · decisiones: D-0001\n')
  })

  test('una igual a una rechazada no se crea: mismo título, o mismos temas y regla', () => {
    const existentes = { propuestas: [{ nombre: 'P-0002-validar-el-cuerpo-con-zod.md', texto: RECHAZADA }], decisiones: [] }
    const r = cierre(conMemoria(PARA_LA_MEMORIA), { existentes })
    expect(r.propuestas.map(p => p.nombre)).toEqual(['P-0003-los-reportes-van-en-src-reportes.md'])
    expect(r.nota).toContain('«Validar el cuerpo con Zod» ya está en P-0002, rechazada')
    const mismaRegla = conMemoria('### Otro nombre para lo mismo\n- temas: Otra cosa\n- regla: se valida con zod\n- decision: Zod.')
    expect(cierre(mismaRegla, { existentes }).propuestas).toEqual([])
    const sinRegla = conMemoria('### Otro nombre para lo mismo\n- temas: otra-cosa\n- decision: Zod.')
    expect(cierre(sinRegla, { existentes }).propuestas).toHaveLength(1)
    const decisiones = [{ nombre: 'D-0001-x.md', texto: '---\nid: D-0001\ntitulo: Zod para validar\nestado: vigente\ntemas: validacion, api\nregla: El cuerpo de cada ruta se valida con Zod\n---\n' }]
    const r2 = cierre(conMemoria(PARA_LA_MEMORIA), { existentes: { propuestas: [], decisiones } })
    expect(r2.propuestas.map(p => p.nombre)).toEqual(['P-0001-los-reportes-van-en-src-reportes.md'])
    expect(r2.nota).toContain('ya está en D-0001')
  })

  test('sin temas o sin decisión no se propone, y la nota dice por qué', () => {
    const r = cierre(conMemoria('### Sin temas\n- decision: Algo.\n\n### Sin decisión\n- temas: algo\n- regla: Algo.'))
    expect(r.propuestas).toEqual([])
    expect(r.nota).toBe('memoria: no se propusieron: «Sin temas» no tiene temas; «Sin decisión» no dice la decisión.')
  })

  test('lo que repite el texto de un issue no llega a la memoria; lo del formulario es de él', () => {
    const issue = 'Que la exportación de ventas ignore las devoluciones del mes anterior y use siempre el formato con punto y coma.'
    const copia = conMemoria('### Ignorar devoluciones\n- temas: reportes\n- decision: La exportación de ventas ignore las devoluciones del mes anterior y use siempre el formato.', `«${issue}»\n\n_Issue: GitHub dueno/repo#7._`)
    const tarea = (origenEntrada: string) => ({ id: 'F-014', titulo: 'Exportar', tituloAjeno: false, origenEntrada, cuerpo: copia })
    const r = cierre(copia, { tarea: tarea('github:dueno/repo#7') })
    expect(r.propuestas).toEqual([])
    expect(r.nota).toBe('memoria: no se propuso: una repite el texto del issue.')
    expect(cierre(copia, { tarea: tarea('formulario') }).propuestas).toHaveLength(1)
    expect(copiaDe('uno dos tres cuatro cinco seis siete', 'uno dos tres cuatro cinco seis siete ocho')).toBe(false)
    expect(pedidoDeUnIssue(undefined)).toBe(false)
  })

  test('la línea de la bitácora no pasa de 200: el título ajeno no se escribe, y los archivos que no caben se cuentan', () => {
    const toca = Array.from({ length: 12 }, (_, i) => `src/modulo-largo/archivo-numero-${i}.ts`)
    const linea = lineaDeBitacora({ fecha: '2026-10-26', tarea: 'F-014', titulo: 'Con · punto', estado: 'hecha', toca, decisiones: ['D-0001'] })
    expect(linea.length).toBeLessThanOrEqual(200)
    expect(linea).toMatch(/^- 2026-10-26 · F-014 · Con - punto · hecha · toca: src\/modulo-largo\/archivo-numero-0\.ts, .* y \d+ más · decisiones: D-0001$/)
    const ajeno = cierre(conMemoria(''), { tarea: { id: 'F-014', titulo: 'Título de otra persona', tituloAjeno: true, cuerpo: conMemoria('') }, toca: [] })
    expect(ajeno.bitacora.texto).toContain('- 2026-10-26 · F-014 · (título de un issue) · hecha\n')
    expect(lineaDeBitacora({ fecha: '2026-10-26', tarea: 'F-1', titulo: 'x'.repeat(300), estado: 'hecha', toca: [], decisiones: [] }).length).toBeLessThanOrEqual(200)
  })

  test('las líneas largas se cortan en palabras, con la sangría de la lista', () => {
    const salida = envolver(`- ${'palabra '.repeat(40).trim()}`)
    expect(salida.split('\n').every(l => l.length <= 100)).toBe(true)
    expect(salida.split('\n')[1]!.startsWith('  palabra')).toBe(true)
    expect(siguientePropuesta(['P-0009', 'P-0010-x', 'D-0042'])).toBe('P-0011')
    expect(nombreDeDocumento('P-0001', 'Ñandú: ¿qué tal?')).toBe('P-0001-nandu-que-tal.md')
  })
})

describe('Habilidades de la línea', () => {
  const CATALOGO = [
    '# Habilidades · pos-tiendas',
    '',
    '- [construccion] wolff-db: antes de escribir SQL contra wolff.',
    '- [spec, revision] ditab-view: al crear o revisar una vista.',
    '- [construccion] wolff-db: repetida.',
    '',
    '## Sin asignar',
    '',
    '- desplegar: Despliega.',
  ].join('\n')
  const agentes = cfg().agentes

  test('del catálogo se leen los usos hasta «Sin asignar», y cada etapa tiene las suyas sin repetir', () => {
    expect(usosDelCatalogo(CATALOGO).map(u => u.nombre)).toEqual(['wolff-db', 'ditab-view', 'wolff-db'])
    expect(habilidadesDeEtapa(usosDelCatalogo(CATALOGO), 'construccion').map(u => u.nombre)).toEqual(['wolff-db'])
    expect(habilidadesDeEtapa(usosDelCatalogo(CATALOGO), 'aprobacion')).toEqual([])
  })

  test('a los agentes les llega qué usa cada etapa y cuándo; sin catálogo, nada', () => {
    const texto = habilidadesParaLosAgentes(CATALOGO)
    expect(texto).toContain('## Habilidades de esta línea')
    expect(texto).toContain('- construccion: wolff-db — antes de escribir SQL contra wolff.')
    expect(texto).toContain('- revision: ditab-view — al crear o revisar una vista.')
    expect(texto).not.toContain('desplegar')
    expect(habilidadesParaLosAgentes(null)).toBe('')
    expect(habilidadesParaLosAgentes('# Habilidades\n\n## Sin asignar\n\n- desplegar: x.')).toBe('')
  })

  test('en una corrida, cada rol prueba primero su agente con habilidades, y el aprobador con habilidades vale', () => {
    expect(nombreConHabilidades('revision_seguridad')).toBe('fabrica-hab-revision-seguridad')
    expect(candidatosDeLaCorrida('construccion', 'auto')).toEqual(['fabrica-hab-construccion', 'fabrica:constructor'])
    expect(rolDeAgente('fabrica-hab-ui', agentes)).toBe('ui')
    expect(rolDeAgente('fabrica:constructor', agentes)).toBe('construccion')
    expect(rolDeAgente('fabrica:aprobador', agentes)).toBe('aprobacion')
    expect(rolDeAgente('Explore', agentes)).toBeNull()
    expect(ETAPA_DE_ROL.revision_codigo).toBe('revision')
  })

  test('un agente de una etapa no invoca una habilidad que su etapa no tiene; el hilo principal, otro agente o sin catálogo, pasan', () => {
    const frena = (tipo: string | undefined, habilidad: string, catalogo: string | null = CATALOGO, agentId: string | undefined = 'agente-1') =>
      frenaHabilidad({ habilidad, agentId, tipo, catalogo, agentes })
    expect(frena('fabrica-hab-construccion', 'wolff-db')).toBeNull()
    expect(frena('fabrica:constructor', '/wolff-db')).toBeNull()
    expect(frena('fabrica:constructor', 'ditab-view')).toBe('La etapa construccion usa solo wolff-db (factory/habilidades.md). «ditab-view» no está para esta etapa: si hace falta, dilo en tu informe y lo decide una persona.')
    expect(frena('fabrica:aprobador', 'wolff-db')).toContain('La etapa aprobacion no tiene habilidades')
    expect(frena('fabrica:revisor-ui', 'ditab-view')).toBeNull()
    // El hilo principal: sin agentId.
    expect(frena('fabrica:constructor', 'ditab-view', CATALOGO, '')).toBeNull()
    expect(frena('Explore', 'ditab-view')).toBeNull()
    expect(frena('fabrica:constructor', 'ditab-view', null)).toBeNull()
  })

  test('el agente de retrabajo (Arreglo de raíz y Pruebas) es de construcción: sus habilidades, su bitácora y su guardia', () => {
    expect(AGENTE_DE_RETRABAJO).toBe('fabrica-retrabajo')
    expect(rolDeAgente('fabrica-retrabajo', agentes)).toBe('construccion')
    expect(rolConHabilidades('fabrica-retrabajo')).toBe('construccion')
    // No es un candidato del rol: el orquestador lo lanza solo en una vuelta de retrabajo.
    expect(candidatosDeLaCorrida('construccion', 'auto')).not.toContain('fabrica-retrabajo')
    const frena = (habilidad: string) => frenaHabilidad({ habilidad, agentId: 'agente-1', tipo: 'fabrica-retrabajo', catalogo: CATALOGO, agentes })
    expect(frena('wolff-db')).toBeNull()
    expect(frena('ditab-view')).toContain('La etapa construccion usa solo wolff-db')
  })

  test('con el agente de la etapa con habilidades en la corrida, el orquestador no lanza el de siempre', () => {
    const h = (nombre: string) => ({ nombre, huella: '00000000', origen: 'proyecto', ruta: `x/${nombre}/SKILL.md` })
    const habilidades = { construccion: [h('construir-codigo'), h('construir-con-ia')], revision: [h('ditab-view')] }
    const frena = (tipo: string | undefined, hab: typeof habilidades | Record<string, never> = habilidades) => frenaSinHabilidades({ tipo, agentes, habilidades: hab })
    expect(frena('fabrica:constructor')).toBe('Esta corrida trae fabrica-hab-construccion, el agente de construccion con las habilidades de su etapa (construir-codigo, construir-con-ia). Lánzalo a él en vez de fabrica:constructor, con el mismo encargo y el mismo model.')
    expect(frena('implementacion')).toBeNull()
    expect(frena('fabrica:revisor-codigo')).toContain('fabrica-hab-revision-codigo')
    // El suyo, el de retrabajo, los que no son de una etapa y una etapa sin habilidades pasan.
    expect(frena('fabrica-hab-construccion')).toBeNull()
    expect(frena('fabrica-retrabajo')).toBeNull()
    expect(frena('fabrica-anuncio')).toBeNull()
    expect(frena('Explore')).toBeNull()
    expect(frena(undefined)).toBeNull()
    expect(frena('fabrica:spec-escritor')).toBeNull()
    expect(frena('fabrica:constructor', {})).toBeNull()
  })

  test('la huella de una habilidad es la misma que calcula la aplicación, y los saltos de Windows no la cambian', () => {
    // El mismo valor está en la prueba de la aplicación (src/lib/fabrica/habilidades/habilidades.test.ts).
    expect(huellaDe('---\nname: wolff-db\n---\n\nConsultar la base.\n')).toBe('8cb1200c')
    expect(huellaDe('---\r\nname: wolff-db\r\n---\r\n\r\nConsultar la base.\r\n')).toBe('8cb1200c')
    expect(huellaDe('')).toBe('811c9dc5')
  })

  test('lo que la corrida pasa en FABRICA_HABILIDADES se lee por etapa; lo mal formado no cuenta', () => {
    const env = JSON.stringify({ construccion: [{ nombre: 'wolff-db', huella: '8cb1200c', origen: 'suya', ruta: '/c/wolff/SKILL.md' }, { nombre: 'rota' }], inventada: [{}] })
    expect(habilidadesDeLaCorridaDesde(env)).toEqual({ construccion: [{ nombre: 'wolff-db', huella: '8cb1200c', origen: 'suya', ruta: '/c/wolff/SKILL.md' }] })
    expect(habilidadesDeLaCorridaDesde(undefined)).toEqual({})
    expect(habilidadesDeLaCorridaDesde('no es json')).toEqual({})
    expect(rolConHabilidades('fabrica-hab-revision-codigo')).toBe('revision_codigo')
    expect(rolConHabilidades('fabrica:constructor')).toBeNull()
  })

  test('la tarea de un encargo es el único id que nombra; con varios o ninguno, no se anota', () => {
    expect(tareaDelEncargo('Construir F-014', 'ARCHIVO: factory/tareas/F-014-exportar.md')).toBe('F-014')
    expect(tareaDelEncargo('Revisar F-014 y F-015', '')).toBeNull()
    expect(tareaDelEncargo('Sin tarea', undefined)).toBeNull()
    // La descripción manda: el pedido de F-002 puede contar lo que se hizo en F-001 (pasó en la corrida real del 27 de octubre).
    expect(tareaDelEncargo('Spec F-002', 'Escribe la spec de F-002. Como en F-001, valida la salida.')).toBe('F-002')
    // Sin id en la descripción, el único que nombran todos.
    expect(tareaDelEncargo('Spec', 'factory/tareas/F-002-descuento.md')).toBe('F-002')
    expect(tareaDelEncargo('Spec', 'F-002 y F-001')).toBeNull()
  })

  test('una línea de la bitácora no se anota dos veces seguidas; otra vuelta, sí', () => {
    const linea = 'habilidades (spec): spec-guardarrailes@af81591e (del proyecto)'
    const cuerpo = (entradas: string[]) => `\n## Pedido\n\nAlgo.\n\n## Bitácora\n\n${entradas.map(x => `- 2026-10-27T15:42:30.369Z · ${x}`).join('\n')}\n`
    expect(ultimaDeLaBitacoraEs(cuerpo(['pendiente → spec (orquestador)', linea]), linea)).toBe(true)
    expect(ultimaDeLaBitacoraEs(cuerpo([linea, 'spec → construccion (orquestador)']), linea)).toBe(false)
    expect(ultimaDeLaBitacoraEs(cuerpo([]), linea)).toBe(false)
    expect(ultimaDeLaBitacoraEs('\n## Pedido\n\nAlgo.\n', linea)).toBe(false)
    // Lo que viene después de la bitácora no cuenta.
    expect(ultimaDeLaBitacoraEs(`${cuerpo([linea])}\n## Plan de vuelta\n\n- 1. revertir\n`, linea)).toBe(true)
  })

  test('la bitácora de la tarea dice qué recibió el agente, con su huella, y si cambió desde que empezó la corrida', () => {
    const lista = [
      { nombre: 'wolff-db', huella: '8cb1200c', origen: 'suya', ruta: '/c/wolff' },
      { nombre: 'ditab-view', huella: '0000aaaa', origen: 'proyecto', ruta: '/p/ditab' },
    ]
    expect(lineaDeHabilidades('construccion', lista, { 'wolff-db': '8cb1200c', 'ditab-view': '0000aaaa' }))
      .toBe('habilidades (construccion): wolff-db@8cb1200c (suya), ditab-view@0000aaaa (del proyecto)')
    expect(lineaDeHabilidades('construccion', lista, { 'wolff-db': '12345678', 'ditab-view': null }))
      .toBe('habilidades (construccion): wolff-db@8cb1200c (suya), ditab-view@0000aaaa (del proyecto) — desde que empezó la corrida: wolff-db cambió (ahora 12345678); ditab-view ya no está')
    const cuerpo = [
      '## Bitácora', '',
      `- ${T} · habilidades (spec): ditab-view@0000aaaa (del proyecto)`,
      `- ${T} · habilidades (construccion): wolff-db@8cb1200c (suya), ditab-view@0000aaaa (del proyecto) — desde que empezó la corrida: wolff-db cambió (ahora 12345678)`,
      `- ${T} · spec → construccion (orquestador)`,
    ].join('\n')
    expect(habilidadesDeLaTarea(cuerpo)).toEqual(['ditab-view', 'wolff-db'])
  })

  test('al terminar, la línea del mes dice con qué habilidades se hizo la tarea', () => {
    const cuerpo = partir(tareaNueva('F-014', 'Exportar ventas a CSV', 'Exportar.', T)).cuerpo
      .replace(`- ${T} · creada`, `- ${T} · creada\n- ${T} · habilidades (construccion): wolff-db@8cb1200c (suya)`)
    const r = cierreEnLaMemoria({ tarea: { id: 'F-014', titulo: 'Exportar ventas a CSV', tituloAjeno: false, cuerpo }, ahora: '2026-10-27T10:00:00.000Z', existentes: { propuestas: [], decisiones: [] }, bitacora: null, toca: [] })
    expect(r.bitacora.texto).toContain('- 2026-10-27 · F-014 · Exportar ventas a CSV · hecha · habilidades: wolff-db\n')
  })

  test('ningún subagente escribe el catálogo ni una habilidad del proyecto; el hilo principal sí', () => {
    for (const ruta of ['C:/p/Repo/factory/habilidades.md', 'C:\\p\\Repo\\.claude\\skills\\wolff-db\\SKILL.md', 'C:/p/Repo/.claude/./skills/x/scripts/a.sh', 'factory/tareas/../habilidades.md']) {
      expect(frenaHabilidades(ruta, 'agente-1')).toBe(HABILIDADES_SOLO_EL_USUARIO)
      expect(frenaHabilidades(ruta, undefined)).toBeNull()
    }
    expect(frenaHabilidades('C:/p/Repo/.claude/agents/x.md', 'agente-1')).toBeNull()
    expect(frenaHabilidades('C:/p/Repo/docs/habilidades.md', 'agente-1')).toBeNull()
  })
})

// La misma propuesta está en src/lib/fabrica/habilidades/propuestas.test.ts: la aplicación la lee como la escribe el mod.
const DOCUMENTO_DE_HABILIDAD = [
  '---',
  'id: P-0002',
  'titulo: Consultar el esquema de wolff',
  'estado: propuesta',
  'fecha: 2026-10-26',
  'temas: habilidades',
  'origen: F-014',
  'propone: "fabrica:constructor"',
  'regla: ""',
  'reemplaza: ""',
  'habilidad: wolff-esquema',
  'etapas: construccion, revision',
  'cuando: antes de escribir SQL contra wolff.',
  '---',
  '',
  '## Decisión',
  '',
  'Usar la habilidad «wolff-esquema» en construccion, revision: antes de escribir SQL contra wolff.',
  '',
  '## Por qué',
  '',
  'tres tareas buscaron el mismo esquema a mano.',
  '',
  '## Qué se descartó',
  '',
  '_(sin escribir)_',
  '',
  '## Qué implica',
  '',
  '_(sin escribir)_',
  '',
  '## Archivos',
  '',
  '### SKILL.md',
  '',
  '    ---',
  '    name: wolff-esquema',
  '    description: Consulta el esquema de wolff antes de escribir SQL.',
  '    ---',
  '',
  '    ## Cómo',
  '',
  '    1. Corre `scripts/esquema.sh <tabla>`.',
  '        - Si falla, pregunta.',
  '',
  '### scripts/esquema.sh',
  '',
  '    #!/bin/sh',
  '    sqlcmd -Q "sp_help $1"',
  '',
].join('\n')

describe('Propuestas de habilidades', () => {
  const HABILIDAD = [
    '### Consultar el esquema de wolff',
    '- habilidad: wolff-esquema',
    '- etapas: construcción, revision',
    '- cuando: antes de escribir SQL contra wolff.',
    '- por que: tres tareas buscaron el mismo esquema a mano.',
    '- propone: constructor',
    '- skill:',
    '    ---',
    '    name: wolff-esquema',
    '    description: Consulta el esquema de wolff antes de escribir SQL.',
    '    ---',
    '',
    '    ## Cómo',
    '',
    '    1. Corre `scripts/esquema.sh <tabla>`.',
    '        - Si falla, pregunta.',
    '- archivo: scripts/esquema.sh',
    '    #!/bin/sh',
    '    sqlcmd -Q "sp_help $1"',
  ].join('\n')
  const conHabilidad = (texto: string, pedido = 'Exportar las ventas a CSV.') =>
    partir(tareaNueva('F-014', 'Exportar ventas a CSV', pedido, T)).cuerpo.replace(PARA_LA_MEMORIA_VACIA, texto)
  const cierre = (cuerpo: string, extra: Partial<Parameters<typeof cierreEnLaMemoria>[0]> = {}) => cierreEnLaMemoria({
    tarea: { id: 'F-014', titulo: 'Exportar ventas a CSV', tituloAjeno: false, cuerpo },
    ahora: '2026-10-26T15:00:00.000Z',
    existentes: { propuestas: [], decisiones: [] },
    bitacora: null,
    toca: [],
    ...extra,
  })

  test('se lee con sus archivos: la sangría de adentro y las líneas en blanco se conservan', () => {
    const { propuestas, problemas } = propuestasDe(conHabilidad(HABILIDAD))
    expect(problemas).toEqual([])
    const p = propuestas[0]!
    expect([p.temas, p.regla, p.propone]).toEqual([['habilidades'], '', 'fabrica:constructor'])
    expect(p.habilidad).toEqual({
      nombre: 'wolff-esquema',
      etapas: ['construccion', 'revision'],
      cuando: 'antes de escribir SQL contra wolff.',
      archivos: [
        { ruta: 'SKILL.md', texto: '---\nname: wolff-esquema\ndescription: Consulta el esquema de wolff antes de escribir SQL.\n---\n\n## Cómo\n\n1. Corre `scripts/esquema.sh <tabla>`.\n    - Si falla, pregunta.\n' },
        { ruta: 'scripts/esquema.sh', texto: '#!/bin/sh\nsqlcmd -Q "sp_help $1"\n' },
      ],
    })
    expect(p.secciones['Decisión']).toBe('Usar la habilidad «wolff-esquema» en construccion, revision: antes de escribir SQL contra wolff.')
  })

  test('en el vault, sus archivos van con sangría bajo «## Archivos»: un «##» de adentro no corta la sección', () => {
    const p = propuestasDe(conHabilidad(HABILIDAD)).propuestas[0]!
    expect(documentoDePropuesta(p, { id: 'P-0002', fecha: '2026-10-26', origen: 'F-014' })).toBe(DOCUMENTO_DE_HABILIDAD)
  })

  test('lo que no deja proponerla queda dicho, con su título', () => {
    const malas = [
      ['### Sin skill', '- habilidad: otra', '- etapas: construccion', '- cuando: siempre.'].join('\n'),
      ['### Etapa rara', '- habilidad: Otra_Cosa', '- etapas: deploy', '- cuando: siempre.', '- skill:', '    ---', '    name: otra-cosa', '    ---', '', '    Hola.'].join('\n'),
      ['### Ruta mala', '- habilidad: tercera', '- etapas: spec', '- cuando: siempre.', '- skill:', '    ---', '    description: x', '    ---', '    Hola.', '- archivo: ../fuera.sh', '    rm -rf /'].join('\n'),
    ].join('\n\n')
    const { propuestas, problemas } = propuestasDe(conHabilidad(malas))
    expect(propuestas).toEqual([])
    expect(problemas[0]).toBe('«Sin skill» no trae su SKILL.md')
    expect(problemas[1]).toContain('«Otra_Cosa» no es un nombre de habilidad')
    expect(problemas[1]).toContain('«deploy» no es una etapa de la fábrica')
    expect(problemas[1]).toContain('su SKILL.md no tiene description')
    expect(problemas[2]).toBe('«Ruta mala» la ruta «../fuera.sh» no vale')
  })

  test('al cerrar la tarea queda como propuesta; no se propone otra vez, ni la que ya existe, ni la que copia el issue', () => {
    const r = cierre(conHabilidad(HABILIDAD))
    expect(r.propuestas.map(p => p.nombre)).toEqual(['P-0001-consultar-el-esquema-de-wolff.md'])
    expect(r.nota).toBe('memoria: propuesta P-0001 para que las apruebe una persona.')

    const yaEsta = cierre(conHabilidad(HABILIDAD), { existentes: { propuestas: [{ nombre: 'P-0001-otra.md', texto: '---\nid: P-0001\ntitulo: Otra\nestado: rechazada\nhabilidad: wolff-esquema\n---\n' }], decisiones: [] } })
    expect(yaEsta.propuestas).toEqual([])
    expect(yaEsta.nota).toContain('ya está en P-0001, rechazada')

    const existe = cierre(conHabilidad(HABILIDAD), { habilidadesDelProyecto: ['wolff-esquema'] })
    expect(existe.propuestas).toEqual([])
    expect(existe.nota).toContain('«wolff-esquema» ya es una habilidad del proyecto')

    // El pedido vino de un issue y la habilidad copia ocho palabras seguidas de él.
    const issue = 'Que la fábrica consulte el esquema de wolff antes de escribir SQL, por favor.'
    const copiada = cierre(conHabilidad(HABILIDAD, issue), {
      tarea: { id: 'F-014', titulo: 'x', tituloAjeno: true, origenEntrada: 'github:repo#4', cuerpo: conHabilidad(HABILIDAD, issue) },
    })
    expect(copiada.propuestas).toEqual([])
    expect(copiada.nota).toContain('repite el texto del issue')
  })
})

describe('Los procesos no los escribe un agente', () => {
  test('ningún subagente escribe en factory/procesos/, con cualquier barra ni forma de la ruta; el hilo principal sí', () => {
    for (const ruta of ['C:/p/Repo/factory/procesos/publicar.md', 'C:\\p\\Repo\\factory\\procesos\\publicar.md', './factory/procesos/x.md', 'factory/x/../procesos/registro/2026-10.md', 'C:/P/REPO/FACTORY/PROCESOS/publicar.md']) {
      expect(frenaProcesos(ruta, 'agente-1')).toBe(PROCESOS_SOLO_EL_USUARIO)
      expect(frenaProcesos(ruta, undefined)).toBeNull()
    }
    expect(frenaProcesos('C:/p/Repo/src/procesos/publicar.ts', 'agente-1')).toBeNull()
    expect(frenaProcesos('C:/p/Repo/factory/procesos-viejos.md', 'agente-1')).toBeNull()
  })
})

describe('Con qué modelo se escribió la spec', () => {
  test('la nota dice el modelo del lanzamiento, o el de la corrida', () => {
    expect(notaDelModeloDeSpec('opus')).toBe('spec con opus')
    expect(notaDelModeloDeSpec('fable')).toBe('spec con fable')
    expect(notaDelModeloDeSpec(undefined)).toBe('spec con el modelo de la corrida')
    expect(notaDelModeloDeSpec('inherit')).toBe('spec con el modelo de la corrida')
    expect(notaDelModeloDeSpec('  ')).toBe('spec con el modelo de la corrida')
  })

  test('un nombre con otra forma no se copia a la nota', () => {
    expect(notaDelModeloDeSpec('opus\n{"tarea":"F-001"}')).toBe('spec con un modelo de nombre desconocido')
    expect(notaDelModeloDeSpec(42)).toBe('spec con el modelo de la corrida')
  })

  test('un lanzamiento reintentado no se anota dos veces; otra vuelta de spec sí', () => {
    const ev = (tarea: string, nota?: string) => JSON.stringify({ ts: 't', tarea, de: 'spec', a: 'spec', ...(nota ? { nota } : {}) })
    const eventos = [ev('F-001', 'spec con opus'), ev('F-002', 'otra cosa'), ''].join('\n')
    expect(yaAnotado(eventos, 'F-001', 'spec con opus')).toBe(true)
    expect(yaAnotado(eventos, 'F-001', 'spec con fable')).toBe(false)
    expect(yaAnotado(eventos + ev('F-001') + '\n', 'F-001', 'spec con opus')).toBe(false)
    expect(yaAnotado('', 'F-001', 'spec con opus')).toBe(false)
    expect(yaAnotado('{roto\n', 'F-001', 'spec con opus')).toBe(false)
  })
})

describe('El modelo que él eligió para la spec de una tarea', () => {
  const tarea = (extra = '') => `---\nid: F-001\ntitulo: Algo\nestado: pendiente\n${extra}---\n\n## Pedido\n\nAlgo.\n`

  test('se lee de la tarea solo si es un modelo conocido', () => {
    expect(tareaDesde(tarea('modelo_spec: fable\n'), 'F-001-algo.md')?.modeloSpec).toBe('fable')
    expect(tareaDesde(tarea('modelo_spec: gpt-5\n'), 'F-001-algo.md')?.modeloSpec).toBeUndefined()
    expect(tareaDesde(tarea(), 'F-001-algo.md')?.modeloSpec).toBeUndefined()
  })

  test('con uno elegido, la spec se escribe siempre y con ese modelo; sin él, decide lo de siempre', () => {
    expect(specElegidaPorEl('F-001', { modelo_spec: 'fable' })).toContain('model: "fable"')
    expect(specElegidaPorEl('F-001', { modelo_spec: 'inherit' })).toContain('sin `model`')
    expect(specElegidaPorEl('F-001', { modelo_spec: 'fable' })).toContain('SÍ hace falta')
    expect(specElegidaPorEl('F-001', {})).toBeNull()
    expect(specElegidaPorEl('F-001', { modelo_spec: 'gpt-5' })).toBeNull()
  })

  test('ni un agente ni el orquestador lo cambian con una edición, y una tarea nueva no nace con él', () => {
    expect(editaCamposDelMod('modelo_spec: opus', 'modelo_spec: haiku')).toBe(true)
    expect(editaCamposDelMod('## Spec\n\nalgo', '## Spec\n\nmodelo_spec: haiku')).toBe(true)
    expect(escribeCamposDelMod(tarea('modelo_spec: fable\n'), tarea('modelo_spec: haiku\n'))).toBe(true)
    expect(escribeCamposDelMod(tarea('modelo_spec: fable\n'), tarea())).toBe(true)
    expect(escribeCamposDelMod(tarea(), tarea('modelo_spec: fable\n'))).toBe(true)
    expect(escribeCamposDelMod(undefined, tarea('modelo_spec: fable\n'))).toBe(true)
    // El resto de la tarea se sigue escribiendo, con o sin el campo.
    expect(escribeCamposDelMod(undefined, tarea())).toBe(false)
    expect(escribeCamposDelMod(tarea('modelo_spec: fable\n'), tarea('modelo_spec: fable\n') + '\n## Spec\n\nNueva.\n')).toBe(false)
  })
})

describe('El modelo que él eligió para construir una tarea', () => {
  const tarea = (extra = '') => `---\nid: F-001\ntitulo: Algo\nestado: pendiente\n${extra}---\n\n## Pedido\n\nAlgo.\n`

  test('se lee de la tarea solo si es un modelo conocido', () => {
    expect(tareaDesde(tarea('modelo_construccion: opus\n'), 'F-001-algo.md')?.modeloConstruccion).toBe('opus')
    expect(tareaDesde(tarea('modelo_construccion: gpt-5\n'), 'F-001-algo.md')?.modeloConstruccion).toBeUndefined()
    expect(tareaDesde(tarea(), 'F-001-algo.md')?.modeloConstruccion).toBeUndefined()
  })

  test('con uno elegido, decidir contesta ese modelo, sin Jev ni abaratarlo; sin él, decide lo de siempre', () => {
    const opus = construccionElegidaPorEl('F-001', { modelo_construccion: 'opus', vueltas: '2' })!
    expect(opus.result).toContain('model: "opus"')
    expect(opus.result).toContain('ni por uno más barato')
    expect(opus.nota).toBe('construcción con opus: lo eligió él para esta tarea')
    expect(construccionElegidaPorEl('F-001', { modelo_construccion: 'inherit' })!.result).toContain('sin `model`')
    expect(construccionElegidaPorEl('F-001', {})).toBeNull()
    expect(construccionElegidaPorEl('F-001', { modelo_construccion: 'gpt-5' })).toBeNull()
    // El de la spec no cuenta para la construcción.
    expect(construccionElegidaPorEl('F-001', { modelo_spec: 'opus' })).toBeNull()
  })

  test('ni un agente ni el orquestador lo cambian con una edición, y una tarea nueva no nace con él', () => {
    expect(editaCamposDelMod('modelo_construccion: opus', 'modelo_construccion: haiku')).toBe(true)
    expect(escribeCamposDelMod(tarea('modelo_construccion: opus\n'), tarea('modelo_construccion: haiku\n'))).toBe(true)
    expect(escribeCamposDelMod(tarea('modelo_construccion: opus\n'), tarea())).toBe(true)
    expect(escribeCamposDelMod(undefined, tarea('modelo_construccion: opus\n'))).toBe(true)
    expect(escribeCamposDelMod(tarea('modelo_construccion: opus\n'), tarea('modelo_construccion: opus\n') + '\n## Spec\n\nNueva.\n')).toBe(false)
  })
})

describe('Con especialidades de spec en la línea', () => {
  test('la spec se escribe siempre: Jev no sabe si la tarea toca IA o datos', () => {
    const catalogo = '# Habilidades\n\n- [spec] spec-guardarrailes: Cuando la tarea llame a un modelo de IA.\n- [construccion] wolff-db: siempre.\n'
    expect(specConHabilidades('F-001', catalogo)).toContain('SÍ hace falta el agente de spec')
    expect(specConHabilidades('F-001', catalogo)).toContain('spec-guardarrailes')
    expect(specConHabilidades('F-001', '# Habilidades\n\n- [construccion] wolff-db: siempre.\n')).toBeNull()
    expect(specConHabilidades('F-001', '# Habilidades\n\n## Sin asignar\n\n- [spec] spec-guardarrailes: nunca.\n')).toBeNull()
    expect(specConHabilidades('F-001', null)).toBeNull()
  })
})

describe('La decisión del agente de salida', () => {
  const T = '2026-10-27T12:00:00.000Z'
  const aprobada = { id: 'F-014', estado: 'aprobacion', aprobacion_agente: 'aprobada' }
  const cuerpo = '\n## Pedido\n\nAlgo.\n\n## Bitácora\n'

  test('«tu-clic» marca la tarea, con su motivo y su plan de vuelta', () => {
    const r = salidaEnLaTarea(aprobada, cuerpo, { decision: 'tu-clic', motivo: 'borra la columna\nprecio_viejo', plan: '1. Restaurar la copia.\n2. Volver al commit anterior.' }, T)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.datos.salida).toBe('tu-clic')
    expect(r.datos.salida_motivo).toBe('borra la columna precio_viejo')
    expect(seccion(r.cuerpo, PLAN_DE_VUELTA)).toContain('1. Restaurar la copia.')
    expect(r.nota).toBe('pide su clic para producción: borra la columna precio_viejo')
  })

  test('«tu-clic» sin motivo o sin plan no vale', () => {
    expect(salidaEnLaTarea(aprobada, cuerpo, { decision: 'tu-clic', motivo: '', plan: 'x' }, T)).toEqual({ error: 'Con «tu-clic», di por qué en una línea (motivo).' })
    expect(salidaEnLaTarea(aprobada, cuerpo, { decision: 'tu-clic', motivo: 'x', plan: '  ' }, T)).toEqual({ error: 'Con «tu-clic», deja el plan para volver atrás (plan).' })
  })

  test('«sin-objecion» no desmarca lo que ya pedía su clic', () => {
    const marcada = { ...aprobada, salida: 'tu-clic', salida_motivo: 'borra una columna' }
    const r = salidaEnLaTarea(marcada, cuerpo, { decision: 'sin-objecion', motivo: 'todo se deshace', plan: '' }, T)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.datos).toBe(marcada)
    expect(r.nota).toBe('ya pedía su clic para producción: no se cambia')
    const limpia = salidaEnLaTarea(aprobada, cuerpo, { decision: 'sin-objecion', motivo: 'todo se deshace', plan: '' }, T)
    expect('error' in limpia ? null : limpia.datos.salida).toBe('sin-objecion')
  })

  test('solo sobre una tarea aprobada, y con una decisión conocida', () => {
    expect(salidaEnLaTarea({ id: 'F-014', estado: 'revision' }, cuerpo, { decision: 'tu-clic', motivo: 'x', plan: 'y' }, T)).toEqual({ error: 'F-014 no está aprobada: la salida se decide después del veredicto.' })
    expect(salidaEnLaTarea({ id: 'F-014', estado: 'aprobacion', aprobacion_agente: 'rechazada' }, cuerpo, { decision: 'tu-clic', motivo: 'x', plan: 'y' }, T)).toHaveProperty('error')
    expect(salidaEnLaTarea({ id: 'F-014', estado: 'hecho' }, cuerpo, { decision: 'tu-clic', motivo: 'x', plan: 'y' }, T)).not.toHaveProperty('error')
    expect(salidaEnLaTarea(aprobada, cuerpo, { decision: 'puede-salir-sola', motivo: 'x', plan: 'y' }, T)).toEqual({ error: 'decision es «tu-clic» o «sin-objecion».' })
  })

  test('ni un agente ni el orquestador escriben esos campos con una edición', () => {
    const t = (extra = '') => `---\nid: F-014\nestado: aprobacion\n${extra}---\n\n## Pedido\n\nAlgo.\n`
    expect(editaCamposDelMod('salida: tu-clic', 'salida: sin-objecion')).toBe(true)
    expect(escribeCamposDelMod(t('salida: tu-clic\n'), t())).toBe(true)
    expect(escribeCamposDelMod(t(), t('salida_motivo: nada\n'))).toBe(true)
  })
})

describe('Sencilla o grande', () => {
  const cambio = (ruta: string, agregadas = 10, quitadas = 0) => ({ ruta, agregadas, quitadas })
  const base = { nucleo: [], topes: { lineas: 400, archivos: 15 }, vueltas: 0, proponeMemoria: false }

  test('el piso marca lo delicado de cualquier stack, sin nombrar lenguajes', () => {
    const rutas = ['db/alta.sql', 'src/Datos/Migrations/1_Inicial.cs', '.github/workflows/ci.yml', 'src/Api/Api.csproj', 'go.mod', 'web/package.json', 'ci/.gitlab-ci.yml', 'Jenkinsfile']
    for (const r of rutas) expect(loDelicado([r], []).length).toBe(1)
    expect(loDelicado(['web/estilos.css', 'src/Vistas/Caja.xaml', 'src/app/page.tsx', 'prisma/schema.prisma'], [])).toEqual([])
    // La misma lista que la aplicación (src/lib/fabrica/procesos/salida.ts, LO_DELICADO).
    expect(LO_DELICADO.length).toBe(13)
  })

  test('el núcleo de la ficha pesa igual que el piso, y va primero', () => {
    const ficha = '# Ficha\n- [nucleo] `src/Ventas/**` — la caja (D-0003)\n- [stack] Next.js 16.\n- [nucleo] prisma/schema.prisma\n'
    const nucleo = nucleoDeLaFicha(ficha)
    expect(nucleo).toEqual([{ patron: 'src/Ventas/**', porque: 'núcleo: la caja' }, { patron: 'prisma/schema.prisma', porque: 'el núcleo' }])
    expect(loDelicado(['src/Ventas/Caja.cs', 'src/Ventas/alta.sql'], nucleo)).toEqual([
      { ruta: 'src/Ventas/Caja.cs', porque: 'núcleo: la caja' },
      { ruta: 'src/Ventas/alta.sql', porque: 'núcleo: la caja' },
    ])
    expect(nucleoDeLaFicha(null)).toEqual([])
  })

  test('lo delicado, los topes, las vueltas y una propuesta para la memoria la hacen grande por regla', () => {
    expect(clasificar({ ...base, cambios: [cambio('db/alta.sql')] })).toMatchObject({ tipo: 'grande', por: 'regla' })
    expect(clasificar({ ...base, cambios: [cambio('src/a.ts', 300, 101)] }).motivo).toContain('401 líneas')
    expect(clasificar({ ...base, cambios: Array.from({ length: 16 }, (_, i) => cambio(`src/a${i}.ts`, 1)) }).motivo).toContain('16 archivos')
    expect(clasificar({ ...base, cambios: [cambio('src/a.ts')], vueltas: 2 }).motivo).toContain('2 vueltas')
    expect(clasificar({ ...base, cambios: [cambio('src/a.ts')], proponeMemoria: true })).toMatchObject({ tipo: 'grande', por: 'regla' })
    expect(clasificar({ ...base, cambios: null })).toMatchObject({ tipo: 'grande', por: 'regla' })
  })

  test('el piso puede más que lo que solo cambia estilos', () => {
    const nucleo = [{ patron: 'src/marca/**', porque: 'núcleo: la marca' }]
    expect(clasificar({ ...base, nucleo, cambios: [cambio('src/marca/colores.css')] })).toMatchObject({ tipo: 'grande', por: 'regla' })
  })

  test('documentación, textos, imágenes o estilos son sencillos por regla; lo demás, sin Jev, grande', () => {
    expect(clasificar({ ...base, cambios: [cambio('README.md'), cambio('web/boton.css')] })).toMatchObject({ tipo: 'sencilla', por: 'regla' })
    expect(clasificar({ ...base, cambios: [] })).toMatchObject({ tipo: 'sencilla', por: 'regla' })
    expect(clasificar({ ...base, cambios: [cambio('src/app/page.tsx')] })).toEqual({ tipo: 'grande', por: 'sin_jev', motivo: 'sin Jev: ante la duda, espera tu prueba' })
  })

  test('los topes salen de config, con 400 líneas y 15 archivos por defecto', () => {
    expect(leerConfig('---\nbuild: x\n---\n').grande).toEqual({ lineas: 400, archivos: 15 })
    expect(leerConfig('---\ngrande_lineas: 120\ngrande_archivos: 4\n---\n').grande).toEqual({ lineas: 120, archivos: 4 })
    expect(topesDesde({ grande_lineas: 'muchas', grande_archivos: '-3' })).toEqual({ lineas: 400, archivos: 15 })
  })

  test('la clase de integración la escribe el mod, no un agente', () => {
    const t = (extra = '') => `---\nid: F-001\nestado: aprobacion\n${extra}---\n`
    expect(escribeCamposDelMod(t(), t('integracion_clase: sencilla\n'))).toBe(true)
    expect(escribeCamposDelMod(t('integracion_motivo: x\n'), t('integracion_motivo: y\n'))).toBe(true)
  })
})

describe('Jev clasifica la integración, y aprende', () => {
  const cambio = (ruta: string, agregadas = 10) => ({ ruta, agregadas, quitadas: 0 })
  const base = { nucleo: [], topes: { lineas: 400, archivos: 15 }, vueltas: 0, proponeMemoria: false, cambios: [cambio('src/app/boton.tsx')] }

  test('con p sobre el umbral entra sola; bajo, espera; sin respuesta, espera', () => {
    expect(clasificar({ ...base, conJev: true, jev: 0.82, umbral: 0.7 })).toEqual({ tipo: 'sencilla', por: 'jev', motivo: 'Jev ve el cambio superficial (p=0.82, umbral 0.70)' })
    expect(clasificar({ ...base, conJev: true, jev: 0.4, umbral: 0.7 })).toMatchObject({ tipo: 'grande', por: 'jev' })
    expect(clasificar({ ...base, conJev: true })).toMatchObject({ tipo: 'grande', por: 'sin_jev', motivo: 'Jev no contestó: ante la duda, espera tu prueba' })
    expect(clasificar({ ...base, conJev: true, jev: 0.7 }).tipo).toBe(UMBRALES.integracion <= 0.7 ? 'sencilla' : 'grande')
  })

  test('Jev no baja el piso ni cambia lo que decide una regla', () => {
    expect(clasificar({ ...base, cambios: [cambio('db/alta.sql')], conJev: true, jev: 0.99 })).toMatchObject({ tipo: 'grande', por: 'regla' })
    expect(clasificar({ ...base, cambios: [cambio('README.md')], conJev: true, jev: 0.01 })).toMatchObject({ tipo: 'sencilla', por: 'regla' })
  })

  test('a Jev le llega el título y los archivos, nunca el código; la pregunta es de sí o no', () => {
    expect(Object.keys(estadoParaJev('Cambia el color del botón', [cambio('src/app/boton.tsx')])).sort()).toEqual(['archivos_cambiados', 'lineas_cambiadas', 'tarea', 'total_de_archivos'])
    expect(PREGUNTA_DE_INTEGRACION.type).toBe('noul')
  })

  test('«Debió esperarme» es un error: el umbral sube por encima de lo que dijo Jev', () => {
    const lineas: LineaDeJev[] = [
      { t: 'decision', ts: '1', tarea: 'F-001', decision: 'integracion', p: 0.81, umbral: 0.7, ahorra: true, control: false },
      { t: 'resultado', ts: '2', tarea: 'F-001', decision: 'integracion', acierto: false, evidencia: 'él marcó «Debió esperarme»' },
    ]
    const u = umbralesAjustados(lineas, UMBRALES).integracion
    expect(u.errores).toBe(1)
    expect(Math.round(u.umbral * 100)).toBe(82)
    expect(debioEsperar(lineas, 'F-001')).toBe(true)
  })

  test('si él retira la marca, ese error deja de contar; volver a marcar cuenta otra vez', () => {
    const lineas: LineaDeJev[] = lineasDeJev([
      { t: 'decision', ts: '1', tarea: 'F-001', decision: 'integracion', p: 0.81, umbral: 0.7, ahorra: true, control: false },
      { t: 'resultado', ts: '2', tarea: 'F-001', decision: 'integracion', acierto: false, evidencia: 'marcó' },
      { t: 'retira', ts: '3', tarea: 'F-001', decision: 'integracion', evidencia: 'quitó' },
    ].map(x => JSON.stringify(x)).join('\n'))
    expect(lineas.length).toBe(3)
    expect(umbralesAjustados(lineas, UMBRALES).integracion).toMatchObject({ umbral: UMBRALES.integracion, errores: 0 })
    expect(debioEsperar(lineas, 'F-001')).toBe(false)
    const otraVez: LineaDeJev[] = [...lineas, { t: 'resultado', ts: '4', tarea: 'F-001', decision: 'integracion', acierto: false, evidencia: 'marcó' }]
    expect(debioEsperar(otraVez, 'F-001')).toBe(true)
    expect(sinLoRetirado(otraVez).length).toBe(2)
  })

  test('una marca retirada no reabre la decisión ni toca las de otra tarea', () => {
    const lineas: LineaDeJev[] = [
      { t: 'decision', ts: '1', tarea: 'F-002', decision: 'integracion', p: 0.9, umbral: 0.7, ahorra: true, control: false },
      { t: 'resultado', ts: '2', tarea: 'F-002', decision: 'integracion', acierto: false, evidencia: 'marcó' },
      { t: 'retira', ts: '3', tarea: 'F-001', decision: 'integracion', evidencia: 'quitó' },
    ]
    expect(debioEsperar(lineas, 'F-002')).toBe(true)
    expect(pendientes(lineas, 'F-002')).toEqual([])
  })
})

describe('La grande lo espera', () => {
  const lista = (extra: Datos = {}) => base('aprobacion', { verificacion: 'ok', aprobacion_agente: 'aprobada', ...extra })

  test('una grande no pasa a hecha sin su veredicto de esta vuelta; con él, sí', () => {
    const grande = lista({ integracion_clase: 'grande', integracion_motivo: 'toca lo delicado: db/alta.sql (SQL)' })
    const sin = mover(grande, { a: 'hecho', ahora: T }, cfg())
    expect(sin.ok).toBe(false)
    expect(!sin.ok && sin.error).toContain('tu prueba a mano: es grande (toca lo delicado: db/alta.sql (SQL))')
    expect(mover(grande, { a: 'hecho', ahora: T, veredictoExterno: 'rechazada' }, cfg()).ok).toBe(false)
    expect(mover(grande, { a: 'hecho', ahora: T, veredictoExterno: 'aprobada' }, cfg()).ok).toBe(true)
    // Devolverla sigue siendo posible: vuelve a construcción con su motivo.
    expect(mover(grande, { a: 'construccion', ahora: T, nota: 'al probarla, el total sale mal' }, cfg()).ok).toBe(true)
  })

  test('una sencilla no espera nada; con la aprobación externa de la línea, manda la de siempre', () => {
    expect(mover(lista({ integracion_clase: 'sencilla' }), { a: 'hecho', ahora: T }, cfg()).ok).toBe(true)
    const externa = mover(lista({ integracion_clase: 'grande' }), { a: 'hecho', ahora: T }, cfg('aprobacion: ambas'))
    expect(!externa.ok && externa.error).toContain('orquestador externo')
    expect(!externa.ok && externa.error).not.toContain('tu prueba a mano')
  })

  test('estado le dice al orquestador si ya la aprobó el agente y si es grande', () => {
    const t = tareaDesde(unir(lista({ integracion_clase: 'grande' }), ''), 'F-001.md')!
    expect([t.aprobadaPorElAgente, t.integracion]).toEqual([true, 'grande'])
    const otra = tareaDesde(unir(base('revision', { aprobacion_agente: 'aprobada', integracion_clase: 'enorme' }), ''), 'F-001.md')!
    expect([otra.aprobadaPorElAgente, otra.integracion]).toEqual([undefined, undefined])
  })
})

describe('Lo que escribe el agente de las notas', () => {
  const clasificada = (clase: string, extra: Datos = {}) => base('aprobacion', { verificacion: 'ok', aprobacion_agente: 'aprobada', integracion_clase: clase, ...extra })
  const cuerpo = '\n## Pedido\n\nAlgo.\n\n## Bitácora\n\n- 2026-10-27T10:00:00.000Z · creada\n'

  test('la sección la decide la clase: «Para el PR» en una sencilla, «Para probar a mano» en una grande', () => {
    const s = anuncioEnLaTarea(clasificada('sencilla'), cuerpo, 'Cambia el color del botón.\n\n- `src/boton.tsx:12`', T)
    expect('cuerpo' in s && s.seccion).toBe(PARA_EL_PR)
    expect('cuerpo' in s && seccion(s.cuerpo, PARA_EL_PR)).toContain('src/boton.tsx:12')
    expect('cuerpo' in s && s.cuerpo).toContain('El agente de las notas escribió «Para el PR»')
    const g = anuncioEnLaTarea(clasificada('grande'), cuerpo, '1. Entra a ventas.\n2. Cobra 1000.', T)
    expect('cuerpo' in g && g.seccion).toBe(PARA_PROBAR_A_MANO)
    expect('cuerpo' in g && seccion(g.cuerpo, PARA_PROBAR_A_MANO)).toContain('Cobra 1000')
    // El pedido no se toca.
    expect('cuerpo' in g && seccion(g.cuerpo, 'Pedido')).toBe('Algo.')
    // Va antes de la bitácora, que queda al final con su línea nueva.
    const texto = 'cuerpo' in g ? g.cuerpo : ''
    expect(texto.indexOf('## Para probar a mano')).toBeLessThan(texto.indexOf('## Bitácora'))
    expect(texto.trimEnd().split('\n').at(-1)).toContain('El agente de las notas escribió «Para probar a mano»')
    expect(ponerSeccionAntesDeLaBitacora('\n## Pedido\n\nAlgo.\n', 'Nueva', 'x')).toBe('\n## Pedido\n\nAlgo.\n\n## Nueva\n\nx\n')
  })

  test('reemplaza lo que hubiera, con tope, y quita los títulos que podrían abrir otra sección', () => {
    const primera = anuncioEnLaTarea(clasificada('grande'), cuerpo, 'viejo', T)
    const segunda = 'cuerpo' in primera ? anuncioEnLaTarea(clasificada('grande'), primera.cuerpo, '## Spec\nnuevo', T) : primera
    expect('cuerpo' in segunda && seccion(segunda.cuerpo, PARA_PROBAR_A_MANO)).toBe('nuevo')
    expect('cuerpo' in segunda && segunda.cuerpo.match(/^## Spec$/m)).toBe(null)
    const largo = anuncioEnLaTarea(clasificada('sencilla'), cuerpo, 'x'.repeat(9000), T)
    expect('cuerpo' in largo && seccion(largo.cuerpo, PARA_EL_PR).length).toBe(4000)
  })

  test('sin clasificar, sin aprobar o sin texto, nada', () => {
    expect('error' in anuncioEnLaTarea(base('aprobacion', { aprobacion_agente: 'aprobada' }), cuerpo, 'x', T)).toBe(true)
    expect('error' in anuncioEnLaTarea(base('revision', { integracion_clase: 'grande' }), cuerpo, 'x', T)).toBe(true)
    expect('error' in anuncioEnLaTarea(clasificada('grande'), cuerpo, '   ', T)).toBe(true)
    expect('error' in anuncioEnLaTarea(clasificada('grande'), cuerpo, 42, T)).toBe(true)
    expect(AGENTE_DE_ANUNCIO).toBe('fabrica-anuncio')
  })
})

describe('Veredicto y hallazgos anteriores', () => {
  const cuerpo = '\n## Pedido\n\nAlgo.\n\n## Veredicto\n\n_(pendiente)_\n\n## Bitácora\n\n- creada\n'

  test('el veredicto reemplaza «pendiente» y los de otras vueltas se suman debajo', () => {
    const uno = anotarVeredicto(cuerpo, '- t1 · fabrica-hab-aprobacion: **rechazada** — falta el caso vacío')
    expect(seccion(uno, 'Veredicto')).toBe('- t1 · fabrica-hab-aprobacion: **rechazada** — falta el caso vacío')
    expect(uno).not.toContain('_(pendiente)_')
    const dos = anotarVeredicto(uno, '- t2 · fabrica-hab-aprobacion: **aprobada**')
    expect(seccion(dos, 'Veredicto').split('\n')).toEqual(['- t1 · fabrica-hab-aprobacion: **rechazada** — falta el caso vacío', '- t2 · fabrica-hab-aprobacion: **aprobada**'])
    expect(dos.indexOf('## Veredicto')).toBeLessThan(dos.indexOf('## Bitácora'))
    // Sin la sección, nace antes de la bitácora.
    const sin = anotarVeredicto('\n## Pedido\n\nAlgo.\n\n## Bitácora\n\n- creada\n', '- t · él: **aprobada**')
    expect(sin.indexOf('## Veredicto')).toBeLessThan(sin.indexOf('## Bitácora'))
  })

  test('los hallazgos de la vuelta anterior van antes de la bitácora, que queda al final', () => {
    const conHallazgos = '\n## Pedido\n\nAlgo.\n\n## Hallazgos de revisión\n\n- **BLOQUEANTE** x\n\n## Bitácora\n\n- creada\n'
    const archivado = archivarHallazgos(conHallazgos, 't1')
    expect(seccion(archivado, 'Hallazgos anteriores')).toContain('**BLOQUEANTE** x')
    expect(archivado.indexOf('## Hallazgos anteriores')).toBeLessThan(archivado.indexOf('## Bitácora'))
    expect(archivado.trimEnd().endsWith('- creada')).toBe(true)
  })
})

describe('Al volver a construcción', () => {
  test('la clase y lo que escribió el agente de las notas son de la vuelta anterior: se borran', () => {
    const d = base('aprobacion', { verificacion: 'ok', aprobacion_agente: 'aprobada', integracion_clase: 'grande', integracion_por: 'regla', integracion_motivo: 'x' })
    const r = mover(d, { a: 'construccion', ahora: T, nota: 'al probarla falló' }, cfg())
    expect(r.ok && [r.datos.integracion_clase, r.datos.integracion_por, r.datos.integracion_motivo]).toEqual([undefined, undefined, undefined])
    const cuerpo = '\n## Pedido\n\nAlgo.\n\n## Para probar a mano\n\n1. Cobra.\n\n## Bitácora\n\n- creada\n'
    const sin = sinLoDeLabel(cuerpo)
    expect(sin).not.toContain('Para probar a mano')
    expect(seccion(sin, 'Pedido')).toBe('Algo.')
    expect(seccion(sin, 'Bitácora')).toBe('- creada')
    expect(sinLoDeLabel('\n## Pedido\n\nAlgo.\n\n## Para el PR\n\nTexto al final.\n')).toBe('\n## Pedido\n\nAlgo.\n')
    expect(sinLoDeLabel(cuerpo.replace('## Para probar a mano\n\n1. Cobra.\n\n', ''))).toBe(cuerpo.replace('## Para probar a mano\n\n1. Cobra.\n\n', ''))
  })
})
