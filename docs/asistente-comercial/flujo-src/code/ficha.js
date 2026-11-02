// FICHA DE SERVICIOS: única fuente de precios y textos. EDITAR AQUÍ (y confirmar vigencia con el Lic. Rojas).
// El modelo NUNCA escribe precios: solo elige códigos de bloque y el flujo pega el texto exacto.
// Textos tomados de lo que el equipo manda hoy por WhatsApp (conversaciones del 19/10 al 1/11/2026).
const bloques = {
  EAS_COSTO:
    '📌 Creación de EAS – Gs. 880.000\n' +
    'Incluye:\n' +
    '✅ Elaboración de la proforma preestablecida.\n' +
    '✅ Inscripción en la DNIT (RUC).\n' +
    '✅ Inscripción en IPS.\n' +
    '✅ Inscripción en MTESS.\n' +
    '✅ Gestión de la Cédula MiPymes.\n' +
    '✅ Inscripción en el SUACE.\n' +
    '✅ Asesoramiento durante todo el proceso de constitución.\n' +
    '💳 Forma de pago: 50% para iniciar el trámite y 50% al finalizar.\n' +
    '⏳ Plazo de entrega: 15 días corridos, contados desde la recepción de toda la documentación requerida por parte del cliente.',
  EAS_CONTABLE:
    '📌 Servicio Contable para EAS – Gs. 440.000 mensuales\n' +
    'Incluye:\n' +
    '✅ Presentación de impuestos.\n' +
    '✅ Preparación de Estados Financieros.\n' +
    '✅ Manejo de las plataformas de IPS y MTESS.\n' +
    '✅ Preparación de libros contables y societarios.\n' +
    '✅ Asesoramiento tributario, contable y laboral.\n' +
    '✅ Informes trimestrales con proyección de los impuestos anuales a pagar.\n' +
    '✅ Retiro de documentos 1 vez al mes en Asunción y Gran Asunción.\n' +
    '❌ No incluye procesos judiciales laborales ni la liquidación de haberes de empleados, los cuales se cotizan por separado con una abogada laboralista.\n' +
    '💰 Honorarios: Gs. 440.000 mensuales, sin costos adicionales por nuestros servicios.',
  EAS_LIBROS:
    '📚 Elaboración de Libros Contables y Societarios para EAS – Gs. 2.750.000\n' +
    'Incluye la preparación de 7 libros oficiales, con 100 hojas cada uno:\n' +
    '📖 Libros Contables\n' +
    '✅ Libro Diario.\n' +
    '✅ Libro Mayor.\n' +
    '✅ Libro Inventario.\n' +
    '📋 Libros Societarios\n' +
    '✅ Libro de Actas de Gobierno.\n' +
    '✅ Libro de Registro de Acciones.\n' +
    '✅ Libro de Actas del Órgano de Administración.\n' +
    '✅ Registro de Asistencia a Asambleas.\n' +
    '💳 Forma de pago: 50% para iniciar el trabajo y 50% contra la entrega de los documentos.\n' +
    '💰 Honorarios: Gs. 2.750.000, sin costos adicionales por nuestros servicios profesionales.',
  EAS_REQUISITOS:
    'Requisitos para la EAS\n' +
    '1- Cédula del o los socios\n' +
    '2- Capital de la empresa\n' +
    '3- Domicilio Fiscal de la Empresa\n' +
    '4- Dirección por GPS\n' +
    '5- Correo de la empresa o del representante legal principal\n' +
    '6- Actividad económica al cual se va a dedicar\n' +
    '7- Definir representante legal principal y secundario\n' +
    '8- Factura de Ande no vencida más de 90 días',
  IVA_HABILITACION: 'La habilitación de IVA para prestación de servicios tiene un costo de Gs. 150.000.',
  UBICACION:
    'Estamos en Fernando de la Mora (Gran Asunción). Podemos guiarle en todo el proceso a distancia, ' +
    'pero la firma de los papeles en la DNIT debe hacerse de forma presencial.',
};

const catalogo = {
  EAS_COSTO: 'Costo de creación de una EAS, qué incluye, forma de pago y plazo.',
  EAS_CONTABLE: 'Servicio contable mensual para una EAS (qué incluye y qué no).',
  EAS_LIBROS: 'Libros contables y societarios de la EAS (7 libros).',
  EAS_REQUISITOS: 'Los 8 requisitos para constituir una EAS.',
  IVA_HABILITACION: 'Costo de habilitar IVA para prestación de servicios.',
  UBICACION: 'Dónde está la oficina y que la firma en la DNIT es presencial.',
};

// Temas SIN tarifa cargada: el bot debe derivar, nunca inventar.
const sinTarifa = [
  'Constitución de SRL o SA',
  'Marcas y registros (los atiende una abogada externa)',
  'Liquidación de haberes y juicios laborales (se cotizan aparte con una abogada laboralista)',
  'Descuentos, precios especiales o negociación',
];

// Si el CRM respondió (nodo «Config»), manda lo que se edita en el panel /asistente; si no, valen los valores de arriba.
const cfg = $('Config').first().json;
if (cfg.configOrigen === 'crm') {
  return [{ json: {
    bloques: cfg.bloques ?? {}, catalogo: cfg.catalogo ?? {}, sinTarifa: cfg.sinTarifa ?? [],
    instruccionesExtra: cfg.instruccionesExtra ?? '', mensajeFallback: cfg.mensajeFallback ?? '', origen: 'crm',
  } }];
}
return [{ json: { bloques, catalogo, sinTarifa, instruccionesExtra: '', mensajeFallback: '', origen: 'nodo' } }];
