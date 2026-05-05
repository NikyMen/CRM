WITH ranked AS (
  SELECT
    id,
    "workspaceId",
    channel,
    "contactId",
    FIRST_VALUE(id) OVER conversation_group AS keep_id,
    ROW_NUMBER() OVER conversation_group AS row_number
  FROM conversations
  WINDOW conversation_group AS (
    PARTITION BY "workspaceId", channel, "contactId"
    ORDER BY "lastMessageAt" DESC NULLS LAST, "updatedAt" DESC, "createdAt" DESC, id ASC
  )
),
duplicates AS (
  SELECT id, keep_id
  FROM ranked
  WHERE row_number > 1
),
rollup AS (
  SELECT
    d.keep_id,
    COALESCE(SUM(c."unreadCount"), 0)::integer AS unread_count,
    MAX(c."lastInboundAt") AS last_inbound_at,
    MAX(c."lastOutboundAt") AS last_outbound_at,
    MAX(c."lastMessageAt") AS last_message_at
  FROM duplicates d
  JOIN conversations c ON c.id = d.id
  GROUP BY d.keep_id
)
UPDATE conversations target
SET
  "unreadCount" = target."unreadCount" + rollup.unread_count,
  "lastInboundAt" = CASE
    WHEN target."lastInboundAt" IS NULL THEN rollup.last_inbound_at
    WHEN rollup.last_inbound_at IS NULL THEN target."lastInboundAt"
    ELSE GREATEST(target."lastInboundAt", rollup.last_inbound_at)
  END,
  "lastOutboundAt" = CASE
    WHEN target."lastOutboundAt" IS NULL THEN rollup.last_outbound_at
    WHEN rollup.last_outbound_at IS NULL THEN target."lastOutboundAt"
    ELSE GREATEST(target."lastOutboundAt", rollup.last_outbound_at)
  END,
  "lastMessageAt" = CASE
    WHEN target."lastMessageAt" IS NULL THEN rollup.last_message_at
    WHEN rollup.last_message_at IS NULL THEN target."lastMessageAt"
    ELSE GREATEST(target."lastMessageAt", rollup.last_message_at)
  END,
  "updatedAt" = NOW()
FROM rollup
WHERE target.id = rollup.keep_id;

WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER conversation_group AS keep_id,
    ROW_NUMBER() OVER conversation_group AS row_number
  FROM conversations
  WINDOW conversation_group AS (
    PARTITION BY "workspaceId", channel, "contactId"
    ORDER BY "lastMessageAt" DESC NULLS LAST, "updatedAt" DESC, "createdAt" DESC, id ASC
  )
),
duplicates AS (
  SELECT id, keep_id
  FROM ranked
  WHERE row_number > 1
)
UPDATE messages
SET "conversationId" = duplicates.keep_id
FROM duplicates
WHERE messages."conversationId" = duplicates.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER conversation_group AS row_number
  FROM conversations
  WINDOW conversation_group AS (
    PARTITION BY "workspaceId", channel, "contactId"
    ORDER BY "lastMessageAt" DESC NULLS LAST, "updatedAt" DESC, "createdAt" DESC, id ASC
  )
)
DELETE FROM conversations
USING ranked
WHERE conversations.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "conversations_workspaceId_channel_contactId_key"
ON "conversations"("workspaceId", "channel", "contactId");
