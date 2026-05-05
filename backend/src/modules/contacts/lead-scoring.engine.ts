import { type Prisma } from '@prisma/client'

type Contact = Prisma.ContactGetPayload<object>

// Reglas de scoring — cada regla suma puntos al score del contacto
// El score final es entre 0 y 100
const DEFAULT_RULES = [
  { type: 'HAS_EMAIL',   points: 20 },
  { type: 'HAS_PHONE',   points: 15 },
  { type: 'HAS_COMPANY', points: 10 },
  { type: 'HAS_AVATAR',  points: 5  },
  { type: 'STATUS_IS',   points: 30, value: 'QUALIFIED' },
  { type: 'STATUS_IS',   points: 20, value: 'ACTIVE'    },
  { type: 'SOURCE_IS',   points: 10, value: 'FACEBOOK'  },
  { type: 'SOURCE_IS',   points: 10, value: 'WHATSAPP'  },
]

export class LeadScoringEngine {
  calculate(contact: Contact): number {
    let score = 0

    for (const rule of DEFAULT_RULES) {
      switch (rule.type) {
        case 'HAS_EMAIL':
          if (contact.email) score += rule.points
          break
        case 'HAS_PHONE':
          if (contact.phone) score += rule.points
          break
        case 'HAS_COMPANY':
          if (contact.companyId) score += rule.points
          break
        case 'HAS_AVATAR':
          if (contact.avatar) score += rule.points
          break
        case 'STATUS_IS':
          if (contact.status === rule.value) score += rule.points
          break
        case 'SOURCE_IS':
          if (contact.source === rule.value) score += rule.points
          break
      }
    }

    // Garantizar que el score siempre esté entre 0 y 100
    return Math.max(0, Math.min(100, score))
  }
}