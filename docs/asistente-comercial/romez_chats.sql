CREATE TABLE IF NOT EXISTS romez_chats (
  phone       text PRIMARY KEY,
  estado      text NOT NULL DEFAULT '{}',
  last_msg_id text,
  buffer      text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
