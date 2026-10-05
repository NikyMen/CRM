import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_INFO } from '../legal-info'

export const metadata: Metadata = {
  title: `Eliminación de datos · ${LEGAL_INFO.businessName}`,
  description: `Cómo pedirle a ${LEGAL_INFO.businessName} que elimine tus datos.`,
}

export default function DataDeletionPage() {
  const { businessName, facebookPageUrl, instagramHandle, instagramUrl } = LEGAL_INFO

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{businessName}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Eliminación de datos</h1>
      <p className="mt-4 text-sm leading-7">
        Si nos escribiste por Facebook Messenger, Instagram o WhatsApp y querés que borremos tus datos (nombre, foto
        de perfil, identificador de cuenta y mensajes), seguí estos pasos.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">Cómo pedirlo</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-7">
          <li>
            Mandanos un mensaje privado a nuestra <a href={facebookPageUrl} className="font-bold underline">página de Facebook</a>{' '}
            o a <a href={instagramUrl} className="font-bold underline">{instagramHandle}</a> en Instagram, desde la misma
            cuenta con la que nos escribiste.
          </li>
          <li>Escribí: <strong>&quot;Quiero que eliminen mis datos&quot;</strong>.</li>
          <li>Te confirmamos por el mismo medio cuando estén eliminados.</li>
        </ol>
        <p className="mt-3 text-sm leading-7">
          Escribir desde la misma cuenta nos permite saber que el pedido es tuyo sin pedirte documentación.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">Qué pasa después</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-7">
          <li>
            Eliminamos de nuestro sistema tu contacto, tu foto de perfil, el identificador de tu cuenta y el historial de
            mensajes, dentro de los 5 días hábiles que fija la Ley 25.326.
          </li>
          <li>Solo conservamos lo que la ley nos obligue a guardar, por ejemplo comprobantes de una compra.</li>
          <li>
            Borrar los datos de nuestro sistema no borra la conversación de tu Messenger, Instagram o WhatsApp: eso lo
            podés hacer vos desde la aplicación.
          </li>
        </ul>
      </section>

      <p className="mt-8 text-sm leading-7">
        Más detalles sobre qué datos tratamos y para qué, en nuestra{' '}
        <Link href="/privacidad" className="font-bold underline">Política de privacidad</Link>.
      </p>
    </>
  )
}
