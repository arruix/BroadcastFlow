# Despliegue piloto (Hostinger VPS)

- Código en `/opt/broadcastflow` (clonado con deploy key de solo lectura).
- Secretos en `/opt/broadcastflow/.env` (chmod 600, no versionado). Caddy sigue
  leyendo `.basic-auth.env` solo por `PROXY_SHARED_SECRET`; el basic auth ya no se usa.
- `docker compose -f docker-compose.prod.yml up -d --build`
- Esquema inicial: `campanas-esquema.sql` y luego `migraciones/*.sql` en orden.
- Caddy (red host) sirve 443 con certificado Cloudflare Origin CA en `certs/`.
  El sitio está detrás de Cloudflare Access. El origen solo acepta IPs de
  Cloudflare que traigan `Cf-Access-Jwt-Assertion`. UFW solo deja 80/443 desde
  rangos de Cloudflare; api y web escuchan en 127.0.0.1.
- El contenedor web llama al API por `API_INTERNAL_URL=http://api:3001/v1` y
  manda `X-BF-Proxy-Token` con el mismo `PROXY_SHARED_SECRET` del `.env`.
  `NEXT_PUBLIC_API_URL` sigue siendo la URL pública y solo la usa el navegador.
- Respaldos: `deploy/backup.sh` diario 03:00 (America/Mexico_City), 7 locales en `/var/backups/broadcastflow`.
