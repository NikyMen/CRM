import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_INFO } from '../legal-info'

export const metadata: Metadata = {
  title: `Condiciones del servicio · ${LEGAL_INFO.businessName}`,
  description: `Condiciones de uso de la atención por mensajes de ${LEGAL_INFO.businessName}.`,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  const { businessName, platformProvider, facebookPageUrl, instagramHandle, instagramUrl } = LEGAL_INFO

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{businessName}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Condiciones del servicio</h1>
      <p className="mt-4 text-sm leading-7">
        Estas condiciones se aplican a la atención que brinda {businessName} por Facebook Messenger, Instagram y
        WhatsApp. Al escribirnos por esos medios, las aceptás.
      </p>

      <Section title="1. El servicio">
        <p>
          Respondemos consultas sobre nuestros productos, precios, disponibilidad, presupuestos y pedidos. Las
          conversaciones se gestionan con un sistema de atención al cliente provisto por {platformProvider}.
        </p>
      </Section>

      <Section title="2. Tiempos de respuesta">
        <p>
          Respondemos lo antes posible dentro de nuestro horario de atención, pero no garantizamos un tiempo de
          respuesta. Por reglas de Meta, solo podemos responderte por Messenger o Instagram dentro de las 24 horas
          posteriores a tu último mensaje: si pasa ese plazo, escribinos de nuevo.
        </p>
      </Section>

      <Section title="3. Precios, presupuestos y disponibilidad">
        <p>
          Los precios, presupuestos y la disponibilidad informados por mensaje son orientativos y pueden cambiar. Una
          compra o un pedido quedan confirmados solo cuando te lo confirmamos expresamente, con el precio final y la
          forma de pago y entrega.
        </p>
      </Section>

      <Section title="4. Uso correcto">
        <p>
          Te pedimos usar estos canales para consultas reales y de buena fe. Podemos dejar de responder o bloquear
          cuentas que envíen mensajes ofensivos, spam o contenido ilegal.
        </p>
      </Section>

      <Section title="5. Plataformas de terceros">
        <p>
          Messenger, Instagram y WhatsApp son servicios de Meta, que tiene sus propias condiciones y políticas. No somos
          responsables por fallas, demoras o cortes de esas plataformas.
        </p>
      </Section>

      <Section title="6. Tus datos">
        <p>
          Cómo tratamos tus datos está explicado en la{' '}
          <Link href="/privacidad" className="font-bold underline">Política de privacidad</Link>, y cómo pedir que los
          eliminemos, en <Link href="/eliminacion-de-datos" className="font-bold underline">Eliminación de datos</Link>.
        </p>
      </Section>

      <Section title="7. Cambios y ley aplicable">
        <p>
          Podemos actualizar estas condiciones; la versión vigente es siempre la publicada en esta página. Se rigen por
          las leyes de la República Argentina, incluida la Ley 24.240 de Defensa del Consumidor.
        </p>
      </Section>

      <Section title="8. Contacto">
        <p>
          Escribinos a nuestra <a href={facebookPageUrl} className="font-bold underline">página de Facebook</a> o a{' '}
          <a href={instagramUrl} className="font-bold underline">{instagramHandle}</a> en Instagram.
        </p>
      </Section>
    </>
  )
}
