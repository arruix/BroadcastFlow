# BroadcastFlow

Especificación del sistema para crear una campaña y llevarla a las redes: página pública, donativos, tablero, reportes y live.

| Documento | Contenido |
| --- | --- |
| [analisis-sistema-campanas.md](analisis-sistema-campanas.md) | Alcance, casos de uso, reglas de negocio y datos |
| [analisis-sitio-promocional.md](analisis-sitio-promocional.md) | Página para promocionar la aplicación y llevar al alta |
| [arquitectura-implementacion-campanas.md](arquitectura-implementacion-campanas.md) | Arquitectura, tecnologías, tablero, reportes y live |
| [diseno-detallado-campanas.md](diseno-detallado-campanas.md) | Secuencias del webhook, la visita y el live |
| [campanas-esquema.sql](campanas-esquema.sql) | Modelo físico para PostgreSQL 16 |
| [campanas-openapi.yaml](campanas-openapi.yaml) | Contrato HTTP de las primeras historias |

El código vive en este repositorio.

| Carpeta | Contenido |
| --- | --- |
| `apps/api` | API NestJS. Puerto local 3001 |
| `apps/web` | Landing de campaña y consola |
| `apps/tablet` | App de tableta |
| `packages/contracts` | Tipos generados desde el OpenAPI |

`docker compose up -d` levanta PostgreSQL 16. Con `DATABASE_URL` tomado de `.env.example`, `npm run db:apply` carga `campanas-esquema.sql`.
