# CRM frontend

El frontend se ejecuta en el VPS dentro de Docker junto con Fastify, PostgreSQL y Redis.

```bash
docker compose up -d --build frontend
```

Configura `NEXT_PUBLIC_API_URL` en el `.env` del VPS antes de construir la imagen, por ejemplo:

```env
NEXT_PUBLIC_API_URL=https://api.tudominio.com/api/v1
```
