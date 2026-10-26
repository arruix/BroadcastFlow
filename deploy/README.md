# Despliegue piloto (Hostinger VPS)

- Código en `/opt/broadcastflow` (clonado con deploy key de solo lectura).
- Secretos en `/opt/broadcastflow/.env` y `.basic-auth*` (chmod 600, no versionados).
- `docker compose -f docker-compose.prod.yml up -d --build`
- Esquema inicial: `campanas-esquema.sql` y luego `migraciones/*.sql` en orden.
- Caddy (red host) sirve 443 con certificado Cloudflare Origin CA en `certs/`, con basic auth.
  UFW solo deja 80/443 desde rangos de Cloudflare; api/web escuchan en 127.0.0.1.
- Respaldos: `deploy/backup.sh` diario 03:00 (America/Mexico_City), 7 locales en `/var/backups/broadcastflow`.
