export interface MergeCandidate {
  id: string
  companyId?: string | null
}

/**
 * Divide los contactos que comparten un mismo teléfono en grupos que sí se pueden
 * fusionar sin cambiar de cliente a nadie.
 *
 * Un mismo teléfono puede pertenecer a clientes distintos (una persona con varias
 * empresas, o un dato mal cargado). Fusionar esos contactos dejaba a uno solo con
 * el cliente y hacía que los tickets de un cliente cayeran en otro. Por eso:
 * - los contactos de clientes distintos nunca se fusionan entre sí;
 * - los que no tienen cliente se suman al único cliente que haya, si hay uno solo;
 * - si hay varios clientes, los que no tienen cliente se fusionan sólo entre ellos.
 */
export function groupContactsSafeToMerge<T extends MergeCandidate>(contacts: T[]): T[][] {
  const byCompany = new Map<string, T[]>()
  const withoutCompany: T[] = []

  for (const contact of contacts) {
    if (!contact.companyId) {
      withoutCompany.push(contact)
      continue
    }
    byCompany.set(contact.companyId, [...(byCompany.get(contact.companyId) ?? []), contact])
  }

  const groups = [...byCompany.values()]
  if (groups.length === 0) {
    groups.push(withoutCompany)
  } else if (groups.length === 1) {
    groups[0] = [...groups[0], ...withoutCompany]
  } else if (withoutCompany.length > 0) {
    groups.push(withoutCompany)
  }

  return groups.filter((group) => group.length > 1)
}
