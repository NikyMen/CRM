---
tags: [datos, prisma, postgres]
---

# Modelo de datos

La fuente ejecutable es `backend/prisma/schema.prisma`.

## Cliente y operación

```mermaid
erDiagram
  WORKSPACE ||--o{ COMPANY : contiene
  USER ||--o{ COMPANY : responsable
  COMPANY ||--o{ CLIENT_ASSIGNMENT : colaboradores
  USER ||--o{ CLIENT_ASSIGNMENT : participa
  COMPANY ||--o{ CONTACT : agrupa
  COMPANY ||--o{ DEAL : vincula
  COMPANY ||--o{ CLIENT_CHECKLIST : controla
  COMPANY ||--o{ RECEIVABLE : factura
  COMPANY ||--o{ PAYMENT : paga
  COMPANY ||--o{ TICKET : consulta
  COMPANY ||--o{ CLIENT_DOCUMENT : adjunta
```

`Company` sigue siendo el nombre técnico por compatibilidad y se expone como `Client`. Contiene persona física/jurídica, RUC, DV, razón social, nombre comercial, actividad, obligaciones, domicilio, estado y responsable.

## Cobranzas

```mermaid
erDiagram
  COMPANY ||--o{ RECURRING_CHARGE : planifica
  RECURRING_CHARGE ||--o{ RECEIVABLE : genera
  COMPANY ||--o{ PAYMENT : registra
  PAYMENT ||--o{ PAYMENT_ALLOCATION : aplica
  RECEIVABLE ||--o{ PAYMENT_ALLOCATION : recibe
```

- Importes con `Decimal(18,2)`.
- Unicidad por plan y período para generar honorarios de forma idempotente.
- Estados: pendiente, parcial, pagado, vencido y anulado.
- Cada moneda mantiene su propio saldo.

## Tickets

```mermaid
erDiagram
  WHATSAPP_SESSION ||--o{ WHATSAPP_CHAT : contiene
  WHATSAPP_CHAT ||--o{ WHATSAPP_MESSAGE : contiene
  WHATSAPP_CHAT ||--o{ TICKET : origina
  TICKET ||--o{ WHATSAPP_MESSAGE : acumula
  TICKET ||--o{ TICKET_COMMENT : comenta
  TICKET ||--o{ TICKET_EVENT : audita
```

`activeKey` asegura un solo ticket activo por conversación. Al resolver o cerrar se libera; el siguiente mensaje entrante puede crear un ticket nuevo.
