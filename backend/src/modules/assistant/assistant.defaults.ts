/**
 * Valores iniciales del asistente comercial: los textos que el equipo de ROMEZ ya envía hoy por
 * WhatsApp (conversaciones de la línea comercial, 19/10 al 1/11/2026). Los montos están como
 * campo aparte y entran en el texto con {{precio}}; hay que confirmarlos antes de usarlos con clientes.
 */
export type DefaultService = {
  code: string
  title: string
  description: string
  body: string
  amount: string | null
}

export const DEFAULT_SERVICES: DefaultService[] = [
  {
    code: 'EAS_COSTO',
    title: 'Creación de EAS',
    description: 'Costo de creación de una EAS, qué incluye, forma de pago y plazo.',
    amount: '880000',
    body: [
      '📌 Creación de EAS – Gs. {{precio}}',
      'Incluye:',
      '✅ Elaboración de la proforma preestablecida.',
      '✅ Inscripción en la DNIT (RUC).',
      '✅ Inscripción en IPS.',
      '✅ Inscripción en MTESS.',
      '✅ Gestión de la Cédula MiPymes.',
      '✅ Inscripción en el SUACE.',
      '✅ Asesoramiento durante todo el proceso de constitución.',
      '💳 Forma de pago: 50% para iniciar el trámite y 50% al finalizar.',
      '⏳ Plazo de entrega: 15 días corridos, contados desde la recepción de toda la documentación requerida por parte del cliente.',
    ].join('\n'),
  },
  {
    code: 'EAS_CONTABLE',
    title: 'Servicio contable para EAS',
    description: 'Servicio contable mensual para una EAS (qué incluye y qué no).',
    amount: '440000',
    body: [
      '📌 Servicio Contable para EAS – Gs. {{precio}} mensuales',
      'Incluye:',
      '✅ Presentación de impuestos.',
      '✅ Preparación de Estados Financieros.',
      '✅ Manejo de las plataformas de IPS y MTESS.',
      '✅ Preparación de libros contables y societarios.',
      '✅ Asesoramiento tributario, contable y laboral.',
      '✅ Informes trimestrales con proyección de los impuestos anuales a pagar.',
      '✅ Retiro de documentos 1 vez al mes en Asunción y Gran Asunción.',
      '❌ No incluye procesos judiciales laborales ni la liquidación de haberes de empleados, los cuales se cotizan por separado con una abogada laboralista.',
      '💰 Honorarios: Gs. {{precio}} mensuales, sin costos adicionales por nuestros servicios.',
    ].join('\n'),
  },
  {
    code: 'EAS_LIBROS',
    title: 'Libros contables y societarios',
    description: 'Libros contables y societarios de la EAS (7 libros).',
    amount: '2750000',
    body: [
      '📚 Elaboración de Libros Contables y Societarios para EAS – Gs. {{precio}}',
      'Incluye la preparación de 7 libros oficiales, con 100 hojas cada uno:',
      '📖 Libros Contables',
      '✅ Libro Diario.',
      '✅ Libro Mayor.',
      '✅ Libro Inventario.',
      '📋 Libros Societarios',
      '✅ Libro de Actas de Gobierno.',
      '✅ Libro de Registro de Acciones.',
      '✅ Libro de Actas del Órgano de Administración.',
      '✅ Registro de Asistencia a Asambleas.',
      '💳 Forma de pago: 50% para iniciar el trabajo y 50% contra la entrega de los documentos.',
      '💰 Honorarios: Gs. {{precio}}, sin costos adicionales por nuestros servicios profesionales.',
    ].join('\n'),
  },
  {
    code: 'EAS_REQUISITOS',
    title: 'Requisitos para la EAS',
    description: 'Los 8 requisitos para constituir una EAS.',
    amount: null,
    body: [
      'Requisitos para la EAS',
      '1- Cédula del o los socios',
      '2- Capital de la empresa',
      '3- Domicilio Fiscal de la Empresa',
      '4- Dirección por GPS',
      '5- Correo de la empresa o del representante legal principal',
      '6- Actividad económica al cual se va a dedicar',
      '7- Definir representante legal principal y secundario',
      '8- Factura de Ande no vencida más de 90 días',
    ].join('\n'),
  },
  {
    code: 'IVA_HABILITACION',
    title: 'Habilitación de IVA',
    description: 'Costo de habilitar IVA para prestación de servicios.',
    amount: '150000',
    body: 'La habilitación de IVA para prestación de servicios tiene un costo de Gs. {{precio}}.',
  },
  {
    code: 'UBICACION',
    title: 'Ubicación y trámite a distancia',
    description: 'Dónde está la oficina y que la firma en la DNIT es presencial.',
    amount: null,
    body: 'Estamos en Fernando de la Mora (Gran Asunción). Podemos guiarle en todo el proceso a distancia, pero la firma de los papeles en la DNIT debe hacerse de forma presencial.',
  },
]

export const DEFAULT_HANDOFF_TOPICS = [
  'Constitución de SRL o SA',
  'Marcas y registros (los atiende una abogada externa)',
  'Liquidación de haberes y juicios laborales (se cotizan aparte con una abogada laboralista)',
  'Descuentos, precios especiales o negociación',
]

export const DEFAULT_FALLBACK_MESSAGE =
  'Disculpe, en este momento no puedo darle la información. Le paso con el Lic. José Rojas, que le responde a la brevedad 🙏'

/** {{nombre}} se reemplaza por el primer nombre, o se omite si no se conoce. */
export const DEFAULT_FOLLOW_UP_MESSAGE =
  'Buenas {{nombre}}, le escribe nuevamente el equipo de la Consultora ROMEZ. ¿Pudo revisar la información que le enviamos? Si le quedó alguna duda, avíseme y con gusto se la resuelvo 🙌'
