import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_INFO } from '../legal-info'

export const metadata: Metadata = {
  title: `Política de privacidad · ${LEGAL_INFO.businessName}`,
  description: `Cómo ${LEGAL_INFO.businessName} trata los datos de quienes le escriben por Messenger, Instagram y WhatsApp.`,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  const { businessName, platformProvider, facebookPageUrl, instagramHandle, instagramUrl } = LEGAL_INFO

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{businessName}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Política de privacidad</h1>
      <p className="mt-4 text-sm leading-7">
        Esta política explica qué datos recibe {businessName} cuando una persona le escribe por Facebook Messenger,
        Instagram o WhatsApp, para qué los usa y cómo puede pedir que se borren. Los mensajes se gestionan con un
        sistema de atención al cliente (CRM) provisto por {platformProvider}.
      </p>

      <Section title="1. Responsable">
        <p>
          El responsable de los datos es <strong>{businessName}</strong>. Podés contactarnos por mensaje privado a
          nuestra <a href={facebookPageUrl} className="font-bold underline">página de Facebook</a> o a{' '}
          <a href={instagramUrl} className="font-bold underline">{instagramHandle}</a> en Instagram.
        </p>
      </Section>

      <Section title="2. Qué datos recibimos">
        <p>Cuando nos escribís, Meta (Facebook / Instagram) o WhatsApp nos envían:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Tu nombre público y tu foto de perfil.</li>
          <li>Un identificador de tu cuenta asignado por Meta para nuestra página (no es tu contraseña ni tu mail).</li>
          <li>El contenido de los mensajes y los archivos que nos mandes (por ejemplo, fotos).</li>
          <li>La fecha y hora de cada mensaje.</li>
        </ul>
        <p>No pedimos ni recibimos tu contraseña, y no accedemos a otras conversaciones tuyas.</p>
      </Section>

      <Section title="3. Para qué los usamos">
        <ul className="list-disc space-y-1 pl-6">
          <li>Responder tus consultas y darte atención comercial.</li>
          <li>Llevar el historial de la conversación para no pedirte la misma información dos veces.</li>
          <li>Gestionar presupuestos, pedidos y ventas que nos solicites.</li>
        </ul>
        <p>No usamos tus datos para publicidad de terceros y <strong>no los vendemos ni los cedemos</strong> a nadie.</p>
      </Section>

      <Section title="4. Dónde se guardan y quién accede">
        <p>
          Los datos se guardan en servidores contratados por {platformProvider} para operar el CRM. Solo acceden las
          personas de {businessName} que atienden consultas y el equipo técnico de {platformProvider} cuando hace falta
          para dar soporte. Los mensajes también quedan en Meta o WhatsApp según sus propias políticas.
        </p>
      </Section>

      <Section title="5. Cuánto tiempo los conservamos">
        <p>
          Mientras exista una relación comercial o una consulta abierta, o hasta que pidas que se eliminen. Después los
          borramos, salvo lo que la ley nos obligue a conservar (por ejemplo, datos de facturación).
        </p>
      </Section>

      <Section title="6. Tus derechos">
        <p>
          Podés pedir en cualquier momento <strong>acceder, corregir o eliminar</strong> tus datos, como prevé la Ley
          25.326 de Protección de Datos Personales de Argentina. Cómo hacerlo está explicado en{' '}
          <Link href="/eliminacion-de-datos" className="font-bold underline">Eliminación de datos</Link>.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública (AAIP), órgano de control de la Ley 25.326, atiende las
          denuncias y reclamos de quienes consideren que no se respetaron sus derechos.
        </p>
      </Section>

      <Section title="7. Cambios">
        <p>Si cambiamos esta política, actualizamos esta página y la fecha de abajo.</p>
      </Section>
    </>
  )
}
