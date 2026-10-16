# Arquitectura de implementación

Documento de arquitectura para construir el sistema descrito en `analisis-sistema-campanas.md`. Octubre 2026.

El análisis manda en reglas de negocio, casos de uso, libros y seguridad. Este documento fija cómo se construye: forma del sistema, clientes, tecnologías, metodología, tablero casi en tiempo real, reportes, el cierre de los huecos críticos y la transmisión en vivo. El diseño detallado de esos casos está en `diseno-detallado-campanas.md`.

El sistema es multiplataforma. La primera construcción tiene dos clientes con el mismo peso de diseño: la página web y la aplicación para tabletas. Las dos son responsivas: cada pantalla se recompone según el ancho y la orientación, sin una versión aparte por aparato. El donante y el miembro pueden usar la web en el teléfono, en el navegador de una tableta o en escritorio. La app instalable sigue siendo la de tableta.

## 1. Decisiones de arquitectura

| Decisión | Resolución | Motivo, tomado del análisis |
| --- | --- | --- |
| Clientes | Web responsiva y aplicación de tableta en la fase 1. Una sola API | El landing, la ficha del enlace y el cobro son una página. El tablero se usa en el ancho que tenga el navegador y, en mesa, en la app de tableta |
| Layout | Mobile first. La misma pantalla a 390, 768, 1024 y 1440 px | El análisis ya baja el panel de donar en pantalla estrecha. La consola obedece la misma regla: nada queda fuera de alcance por el ancho |
| Forma | Monolito modular con workers en el mismo repositorio | Los contextos ya están separados y el asiento del donativo tiene que confirmarse en una sola transacción |
| Tiempo real | Tablero en segundos, en web y en tableta. Reportes en minutos, en segundo plano | Una visita tiene que verse pronto en la superficie que el admin tenga abierta. Un corte contable no puede correr sobre el libro en caliente |
| Dinero | PostgreSQL es la fuente de verdad. Redis no guarda montos | El cuadre y el libro de solo inserción no pueden vivir en una caché |
| Pagos | Un puerto, dos endpoints de webhook, Stripe como primer adaptador | Donativos y suscripción no comparten secreto ni libro |
| Redes | Un conector de publicación por red. El primero es Facebook Página | El análisis deja Instagram para cuando esa Página ya existe |
| En vivo | Un origen en la plataforma y un conector de live por red. Las primeras salidas son Facebook Página y YouTube | Cada red exige su propia sesión. El catálogo completo está en la sección 12 |
| Frente público | WAF, límite de tasa, saneo del HTML, CSP y CDN | El landing y el cobro los abre cualquiera |
| Factura | CFDI solo de la suscripción. El recibo del donativo dice que no es comprobante deducible | El análisis ya separa los dos cobros |
| Medición | Contadores por hora y por origen. Los porcentajes se calculan al leer | Evita guardar un porcentaje que deje de cuadrar cuando entra otra visita |

Casi en tiempo real, en este sistema, quiere decir: una visita contada aparece en el tablero del owner en menos de 5 segundos en el percentil 95, esté la consola en el navegador o en la tableta. El webhook de un pago responde solo después de dejar el asiento confirmado. Un reporte no entra en esa meta.

## 2. Clientes: página web y aplicación de tableta

Los dos clientes hablan con la misma API. No hay un backend por plataforma. La regla de negocio, el libro y el pixel viven en el servidor. La diferencia está en quién usa cada superficie y cómo se compone la pantalla.

| Superficie | Para quién | Anchos que tiene que aguantar | Qué hace en la fase 1 |
| --- | --- | --- | --- |
| Página web | Donante y miembro, en cualquier navegador | 390, 768, 1024 y 1440 px | Página pública, ficha del enlace, consola completa y consola de plataforma |
| Aplicación de tableta | Owner, admin, editor, publisher, tesorero y analyst | 768 a 1366 px, vertical y apaisado. iPad de 11 pulgadas y tableta Android de 10 pulgadas | Tablero, avisos, revisión de campaña, preview, programación y consulta de disputas, gasto y reportes |

La aplicación de tableta es una app instalable para iPadOS y Android, no una ventana estrecha de la web. El donante no la instala: el clic del post abre una URL.

### Qué vive en cada cliente

| Pantalla del análisis | Web | Tableta |
| --- | --- | --- |
| Aviso, landing, donar, recibo | Única. HTML en el primer response, con video, descripción y panel | No |
| Ficha del enlace (título, descripción, imagen) | Única. La arma el servidor para Facebook, Instagram, X y el resto | No |
| Registro, ingreso, clave, código 2FA | Sí | Sí |
| Tablero, avisos | Sí | Sí. Es la pantalla de apertura |
| Campañas, pieza, preview | Editor completo | Revisión en dos paneles: ficha a la izquierda, preview de la red a la derecha. La edición larga abre la web |
| Programación | Sí | Sí, calendario del rango |
| Conexiones | OAuth en el navegador | Abre el navegador del sistema y vuelve a la app por enlace |
| Gasto, disputas, plan | Captura y confirmación | Lectura. Confirmar dispersión o cambiar el plan abre la web, con el step-up de 10 minutos |
| Reportes | Descargar CSV o PDF | El mismo job. El PDF se abre en el visor del sistema y se puede compartir |
| En vivo | Origen de cámara, destinos y botón de iniciar o detener. El reproductor del landing | La misma sala. Desde 1024 px, vista previa y destinos juntos. Por debajo, uno bajo el otro |
| Consola de plataforma | Sí | Fuera de la fase 1. El operador trabaja en la web |

El pixel solo corre en el landing web, y solo si el aviso está publicado. La tableta no mide visitas. El tipo de dispositivo que el pixel clasifica (teléfono, tableta o escritorio) es el aparato del visitante, no el aparato de quien mira el tablero.

### Composición de la página web

Dos sitios del mismo repositorio, mismo diseño, distintos cascarones. Los dos son responsivos.

| Sitio | Rutas | Render |
| --- | --- | --- |
| Público | `/c/{campaña}` landing, aviso, donación, recibo | Servidor. La ficha del enlace sale en el HTML antes de que corra JavaScript |
| Consola | Acceso, organización, tablero, campañas, piezas, programación, conexiones, gasto, disputas, avisos, seguridad, plan, y el módulo de plataforma | Cliente autenticado, sobre la misma API |

El corte es mobile first. Por debajo de 1024 px hay una columna. Desde 1024 px el landing pone el video y la descripción a la izquierda y el panel de donar a la derecha. La consola, desde 1024 px, muestra el riel con las diez entradas del análisis y el contenido al lado. Por debajo de 1024 px el riel se guarda detrás de un botón y las tablas del tablero se apilan: cada red es un bloque, con sus porcentajes, en lugar de exigir scroll horizontal de la página. El scroll horizontal, si hace falta, queda dentro de la tabla. Los controles de toque miden al menos 44 px. El texto crece con el contenedor y no se sale del borde.

| Ancho | Landing | Consola web |
| --- | --- | --- |
| 390 px | Una columna. Panel de donar bajo el video | Menú cerrado. Formularios a ancho completo. Tarjetas del tablero una bajo otra |
| 768 px | Una columna, con más aire | Igual que 390, con tarjetas en dos columnas si caben |
| 1024 px | Dos columnas | Riel visible. Serie y tabla por origen juntas |
| 1440 px | Dos columnas, contenido limitado al ancho de lectura | Riel y contenido. La tabla por origen cabe sin partir los porcentajes |

El preview del post (Facebook, Instagram, X) y la ficha del enlace siguen siendo dos cosas distintas. El preview se dibuja en el editor y se reduce con su contenedor. La ficha la sirve la URL pública.

### Tecnologías de la aplicación web

| Pieza | Tecnología | Para qué |
| --- | --- | --- |
| Marco | Next.js con App Router | Público en el servidor. Consola como cliente autenticado. Una base de código para teléfono, tableta en el navegador y escritorio |
| Interfaz | React | Componentes de landing, consola y plataforma |
| Lenguaje | TypeScript | Tipos compartidos con el paquete `contracts` |
| Estilos | Tailwind CSS, mobile first | Los cortes de 768, 1024 y 1440 px viven en el tema. Los tokens de color, tipo y espacio entran por variables CSS |
| Gráficas del tablero | Recharts | La serie se dibuja al ancho del contenedor y se vuelve a medir si la ventana cambia |
| Tiempo real | EventSource (SSE) | El tablero escucha el canal de la organización en cualquier ancho |
| Cobro | Stripe.js, campos hospedados | El monto lo fija el servidor. El navegador no maneja el número de tarjeta |
| Pruebas de layout | Playwright | Cada historia con UI se recorre a 390, 768, 1024 y 1440 px |

### Composición de la aplicación de tableta

La app también es responsiva. Entre 768 y 1023 px, y en vertical, hay una columna: el panel de apoyo pasa debajo. Desde 1024 px en apaisado, los dos paneles van juntos. Nada se recorta.

| Zona | Apaisado |
| --- | --- |
| Riel | Tablero, Campañas, Programación, Avisos. Gasto, Disputas, Reportes y Seguridad en un grupo secundario |
| Panel principal | La pantalla elegida |
| Panel de apoyo | En Tablero, la tabla por origen junto a la serie. En Pieza, el preview de la red junto a la ficha |

La sesión de la tableta usa el mismo contrato que la web: access token de 15 minutos en memoria, refresh de 30 días en el almacén seguro del sistema (Keychain en iPadOS, Keystore en Android), rotación y revocación de familia. Owner, admin y tesorero siguen entrando con TOTP en cada login. La biometría solo reabre un refresh que todavía es válido. No sustituye el código.

Cuando la app vuelve a primer plano, vuelve a leer los cubos. No confía en los avisos que pudo perder mientras estaba suspendida.

Los avisos push (publicación fallida, reautorizar red, suscripción impaga) usan el canal que el análisis ya definió como consola. No se manda un push por cada visita: eso no es el tablero.

### Contrato compartido

Un paquete `contracts` genera los tipos desde la especificación OpenAPI de la API. Web y tableta consumen ese paquete. Un cambio de campo del tablero rompe la compilación de los dos clientes en el mismo cambio.

Los tokens visuales (color, tipo, espacio, radio) viven en un paquete de valores. La web los aplica en CSS. La tableta los aplica en su sistema de estilos. Los componentes no se comparten: uno es DOM y el otro es nativo. Se comparte la regla, no el control.

## 3. Vista de despliegue

```text
Navegador y tableta   ----HTTPS/SSE---->  API
Navegador y tableta   ----WebRTC------->  LiveKit
Landing               ----beacon------->  WAF --> API
Landing y medios      <---HLS/imagen----  CDN
Pasarela              ----webhook------>  API
Worker de live        ----RTMP--------->  cada red con conector de live
Red social            <---OAuth/publish-- API

API  --> PostgreSQL (libros, sesiones, visitas, lives, outbox)
API  --> Redis (límite de tasa, pub/sub del tablero y del live)
API  --> almacén de objetos (medios, fichas, reportes, grabación)

Workers (mismo código, otro proceso)
  publicador     toma publication con SKIP LOCKED
  en_vivo        empuja RTMP y cierra destinos si cae el origen
  notificaciones manda correo y encola push
  medicion       aplica exclusiones y suma cubos
  reportes       arma CSV o PDF desde la réplica
  cuadre         compara libro y donaciones liquidadas
```

Un solo región al inicio, cercana a México. PostgreSQL con WAL continuo para el RPO de 15 minutos del análisis. RTO de 1 hora con restore probado, no solo configurado.

La API de negocio y el landing público pueden caer por separado. El checkout y el beacon no dependen de que la consola o la tableta estén abiertas. Si la app no está instalada, la web sigue operando la campaña completa.

## 4. Módulos

Cada módulo tiene dueño de tablas. Otro módulo no escribe esas tablas; llama una operación o consume un evento del outbox.

| Módulo | Tablas que posee | Operaciones que expone |
| --- | --- | --- |
| Identidad | user, session, mfa, email_token, device, external_identity, oauth_transaction | registrar, verificar, entrar, enlazar proveedor, step-up, registrar tableta |
| Organización | organization, membership, invitation | crear organización, invitar |
| Campaña | campaign, content, approval, share | crear, guardar pieza, guardar ficha |
| Distribución | social_connection, publication, attempt | conectar, programar, ejecutar |
| En vivo | live_session, live_destination | abrir sala, iniciar, detener, leer estado |
| Recaudación | donation_page, donation, mandate, privacy_notice | iniciar donación, evaluar elegibilidad, fijar la versión del aviso |
| Libro | campaign_ledger_entry, payout | asentar, reservar disputa, dispersar |
| Comercial | plan, subscription, invoice, ad_spend | contratar, cargar gasto |
| Medición | visit_event, metric_bucket | registrar visita, leer tablero |
| Avisos | notification, attempt, push_token | encolar después del hecho |
| Reportes | report_job | pedir corte, descargar |
| Plataforma | admin_action | alta de org, reintento de webhook, bloqueo |
| Auditoría | audit_event, webhook_event | solo inserción |

`ad_spend` vive en Comercial, no en el libro. El análisis lo separa del donativo.

`device` guarda la tableta registrada: plataforma (ipad o android), nombre que ve el usuario y la fecha del último refresh. No guarda identificador de hardware del donante. El pixel sigue sin identificador de equipo.

El outbox es una tabla `outbox_event` en la misma base. Quien confirma un hecho inserta el evento en la misma transacción. Un worker lo publica. Así el recibo no sale si el asiento no quedó, que es la regla del análisis. El push sale del mismo outbox, después del commit, igual que el correo.

## 5. Tecnologías

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Página web | Next.js (App Router), React, TypeScript y Tailwind CSS | Landing y ficha con HTML en el primer response. Consola responsiva de 390 a 1440 px. El detalle está en la sección 2 |
| Aplicación de tableta | Expo y React Native, TypeScript | Un binario para iPadOS y otro para tabletas Android. Apaisado como diseño principal |
| Contrato | OpenAPI y un paquete TypeScript generado | Los dos clientes y las pruebas de contrato leen los mismos tipos |
| API | NestJS y TypeScript | Un módulo por contexto del análisis |
| Base | PostgreSQL 16 | RLS por organization_id, montos en bigint, libro de solo inserción |
| Migraciones | SQL versionado | Las restricciones de cuadre y el RLS se escriben en SQL, no se infieren |
| Cola de trabajo | PostgreSQL, SKIP LOCKED | Publicación, correo, reportes y reintentos. No hace falta otro broker para la fase 1 |
| Tablero en vivo | Redis pub/sub y SSE | El mismo canal para el navegador y para la tableta. Si Redis cae, los dos siguen leyendo PostgreSQL |
| Avisos a la tableta | APNs y FCM, detrás de un puerto | Solo los hechos que el análisis ya manda a la consola. El primer adaptador puede ser un proveedor que hable con los dos |
| Medios, reportes y grabaciones | Almacén compatible con S3, detrás de CDN | Binarios, CSV, PDF y el video ya emitido. La base guarda la llave. El HTML público y la imagen de la ficha también pasan por la CDN |
| Borde público | WAF | Delante del landing, del beacon y del inicio de cobro |
| Transmisión | LiveKit y un worker con FFmpeg | El navegador y la tableta entran por WebRTC. El worker empuja un RTMP por destino |
| Factura del plan | Puerto de CFDI 4.0. Primer adaptador: un PAC | Timbrado de la suscripción. El donativo no pasa por este puerto |
| Correo | Adaptador. Primer proveedor: Amazon SES | Plantillas del análisis detrás de un puerto |
| Pagos | Stripe, dos webhooks y Connect | PaymentIntents para donativos, Billing para el plan, cuenta conectada para dispersar. El checkout hospedado corre en la web |
| Identidad de cobro | Stripe Identity, una vez | Solo al activar dispersión y al cambiar el owner. El flujo se abre en la web |
| 2FA | TOTP, ventana de 30 segundos | Owner, admin, tesorero y operador en cada login. En la tableta, el mismo código |
| Contraseñas | Argon2id | Mínimo 12 caracteres |
| Geo del pixel | Base local GeoLite2 | Código postal aproximado. La IP no se conserva. Solo en el landing web |
| Secretos | Almacén del proveedor de nube | Webhooks, tokens de red y llaves de cifrado fuera del repositorio |
| Observabilidad | OpenTelemetry, logs JSON, métricas | Alerta si el cuadre diario no cierra. El cliente manda la superficie (web o tableta) en el log de la sesión, sin contenido del libro |

Node.js en versión LTS para la API y la web. La tableta se compila con el SDK de Expo del mismo repositorio. Un solo lenguaje reduce el salto entre el caso de uso y las dos pantallas.

Stripe es el primer adaptador porque cubre cobro, suscripción, dispersión y firma de webhooks con secretos distintos. El análisis pide un puerto: Mercado Pago puede entrar después sin mover el libro. El formulario de tarjeta no se reimplementa en la tableta: el cobro del donante es la página web, con campos hospedados.

## 6. Casi en tiempo real

Tres relojes distintos. No se trata igual una visita, un pago y un reporte.

| Flujo | Meta | Cómo |
| --- | --- | --- |
| Visita contada al tablero | Menos de 5 s en p95, en web y en tableta | Beacon del landing, filtro, cubo por hora y origen, aviso SSE a quien tenga el tablero abierto |
| Webhook de pago | Respuesta tras el commit del asiento | Firma, event_id, transacción del libro, outbox del recibo |
| Publicación | En el minuto programado | Worker con SKIP LOCKED |
| Aviso en consola | Segundos después del hecho si la superficie está abierta. Push si la tableta está en segundo plano | Outbox, SSE y, para la tableta, el puerto de push |
| Reporte | Minutos, sin bloquear el cobro | Job sobre la réplica de lectura. Lo piden la web y la tableta |
| Cuadre | Una vez al día, y al pedir dispersión | Compara libro y donaciones. Si difiere, bloquea el retiro |
| En vivo, del origen al landing | Menos de 5 s | WebRTC a LiveKit y HLS por la CDN. El retraso de Facebook o YouTube lo pone esa red |

### Recorrido de una visita

1. El landing web solo envía el beacon si el aviso de privacidad está publicado.
2. La API clasifica bots, vista previa de red, recarga de 30 minutos y petición sin agente.
3. Inserta `visit_event` con el tipo (`view` o `click`), `counted` y `exclude_reason`. La carga del landing es `view`. El clic en Donar es `click`.
4. Si cuenta, suma 1 al cubo `(campaña, origen, hora, tipo de evento)` y escribe el outbox.
5. El worker publica en Redis el canal de esa organización.
6. La consola web y la app de tableta, si están abiertas en el tablero, reciben el SSE y vuelven a leer los cubos del rango.

Los porcentajes no se guardan. La lectura hace `% vistas = vistas de la red / vistas contadas`, `% clic = clics en Donar de esa red / vistas de esa red`, `% donó = donaciones liquidadas / clics en Donar de esa red`. El CPC es gasto del periodo en esa red / clics en Donar de esa red, o vacío si no hay fila en `ad_spend`. Las dos superficies pintan la misma lectura. No hay un cálculo en el cliente.

La donación liquidada entra al mismo cubo de origen cuando el cobro trae el identificador anónimo de esa visita. El cubo de dinero se actualiza en la misma transacción del asiento, no desde el navegador ni desde la tableta.

### Recorrido de un pago

1. El servidor crea la donación y el intento por el monto que él calculó. El formulario está en la página web.
2. El webhook entra por el endpoint de donativos, con su secreto.
3. Se verifica firma y reloj. Se inserta `webhook_event`. Si el event_id ya existe, se responde éxito y no se escribe.
4. En una transacción: estado liquidada, tres asientos, outbox de recibo y de métrica.
5. Si bruto no cuadra con neto más las dos comisiones, la transacción no confirma y la campaña queda bloqueada para dispersar.

Redis no participa en este recorrido. La tableta no participa en este recorrido: ve el efecto cuando el cubo y el aviso ya quedaron escritos.

## 7. Tablero interactivo

La pantalla es la del análisis: una campaña, un rango, tarjetas, serie por día y tabla por origen. En la web, por debajo de 1024 px las tarjetas, la serie y la tabla van una bajo otra. Desde 1024 px la serie y la tabla van juntas. La app de tableta usa el mismo corte.

| Pieza de interfaz | Datos | Actualización |
| --- | --- | --- |
| Tarjetas de vistas, clics, % y CPC | Suma de cubos más gasto | Al cargar, al SSE y al volver a primer plano |
| Serie por día | Cubos agrupados por día del rango | Igual |
| Tabla por red | Cubos por origen, con los tres porcentajes | Igual |
| Visitas excluidas | Conteo de `counted = false` | Igual. Sin IP |

Filtros del análisis que las dos pantallas ofrecen: campaña de la organización y rango de fechas. El origen no se elige para ocultar redes; la tabla las muestra todas las que tuvieron eventos. Facebook, Instagram, TikTok, YouTube, X, directo y el resto salen del clasificador del pixel.

Permisos: owner, admin y analyst ven el tablero. CPC y la pantalla de gasto solo owner y admin. El editor no ve instrumentos de pago ni gasto. La tableta pide el rol en cada lectura. El token no trae el rol.

Si el SSE se corta, la pantalla sigue mostrando la última lectura y reintenta. No inventa puntos. En la tableta, al volver de segundo plano, la primera acción es esa lectura, aunque el SSE todavía no haya reconectado.

## 8. Reportes

Un reporte es una foto de un rango, pedida por una persona, generada fuera de la petición HTTP y guardada como archivo. No es el tablero. La web y la tableta crean el mismo `report_job`.

| Reporte | Quién lo pide | Fuente | Formato |
| --- | --- | --- | --- |
| Libro de campaña | Tesorero, owner | Asientos de solo inserción | CSV y PDF |
| Desempeño por origen | Owner, admin, analyst | Cubos contados y donaciones | CSV |
| Disputas y saldo reservado | Tesorero | Libro, entradas de reserva | PDF |
| Corte de jurisdicción | Owner, tesorero | Donaciones del paquete fijado en la campaña | CSV |
| Ingresos de plataforma | Operador, solo en la web | Facturas pagadas y fees. Sin neto de campañas | CSV |

Recorrido:

1. La web o la tableta crea `report_job` en `queued` con filtros, el usuario y la superficie.
2. El worker lee la réplica, no la primaria.
3. Escribe el archivo en el almacén, con caducidad.
4. Marca el job listo y encola el aviso. En la tableta, si la app no está abierta, el aviso también sale por push.
5. Descargar exige la misma organización y el mismo rol. En la tableta el archivo se abre con el visor del sistema. El operador no descarga el libro de una campaña salvo en modo soporte, y eso queda en auditoría. El modo soporte es de la web.

El archivo lleva en la cabecera el rango, la campaña, la hora de generación y si el cuadre de ese día estaba cerrado. Un reporte pedido mientras el cuadre está abierto se marca provisional, igual que el resumen de plataforma.

No se genera un PDF dentro del webhook, ni dentro del beacon, ni dentro de la app.

## 9. Metodología de construcción

Se construye en el orden de historias de la sección 12 del análisis. Una historia no se da por cerrada si falla su flujo principal o uno de sus alternos. Cada historia de consola se acepta en la web. La tableta entra en las historias que la sección 2 le asigna, con el mismo criterio, en su layout apaisado.

| Práctica | Regla |
| --- | --- |
| Entrega | Incrementos cortos. Cada historia deja un recorrido usable en staging, en la web. La tableta se suma cuando el endpoint de esa historia ya está en staging |
| Rama | Rama corta por historia, revisión antes de integrar a la rama principal |
| Decisiones | Un registro corto cuando se cambie una fila de la sección 1 de este documento |
| Pagos | Antes de la historia del libro: pruebas de firma, event_id repetido y cuadre roto. El checkout se prueba en la web |
| Conectores | Facebook detrás de bandera. La segunda red no se abre en el mismo incremento. El retorno OAuth se prueba en la web y desde la tableta |
| Datos | Migración SQL en el mismo cambio que usa la tabla. RLS desde la primera tabla de negocio |
| Pantallas | Toda historia con UI se revisa en la web a 390, 768, 1024 y 1440 px. En la app, a 768 px vertical y a 1024 px apaisado. Si un control queda fuera de la vista o la página gana scroll horizontal, la historia no cierra |
| Listo | Criterio de aceptación del análisis, prueba automática de ese criterio, y log sin tokens ni tarjeta |

Pruebas mínimas por tipo:

| Tipo | Qué cubre |
| --- | --- |
| Unidad | Elegibilidad, reparto bruto = neto + fees, clasificación de origen, exclusión de visitas |
| Integración | Transacción del webhook, SKIP LOCKED, RLS entre dos organizaciones |
| Contrato | Fixtures firmados de Stripe para pago, reembolso y disputa. El paquete OpenAPI compilado por la web y por la tableta |
| Recorrido web | Registro, aviso publicado, donación de prueba, asiento y fila del tablero. El mismo recorrido a 390, 768, 1024 y 1440 px |
| Recorrido tableta | Login con TOTP, tablero que recibe la visita sin recarga manual, preview de la pieza en apaisado, descarga del PDF |

Entornos: local, staging con llaves de prueba de la pasarela, producción. El pixel de staging no escribe cubos de producción. La tableta de staging apunta a la API de staging. Hay un simulador de iPad de 11 pulgadas y un emulador de tableta Android de 10 pulgadas en el mismo criterio de hecho.

Definición operativa de hecho para el tablero: una visita de prueba contada en staging se ve en la tabla de origen de la web y de la tableta sin recargar a mano, y una vista previa de red queda en el conteo de excluidas.

## 10. Seguridad que la implementación tiene que dejar cerrada

Estas reglas ya están en el análisis. Aquí quedan como trabajo de construcción, en las dos superficies.

- Argon2id, access token de 15 minutos sin rol, refresh de 30 días con rotación y revocación de familia.
- En la web el refresh va en cookie HttpOnly, Secure, SameSite=Lax. En la tableta va en el almacén seguro del sistema. Los dos entran en la misma familia de revocación.
- TOTP en cada login de owner, admin, tesorero y operador. Step-up de 10 minutos para dispersar y cambiar el plan. Esos dos pasos se confirman en la web.
- Verificación de persona una vez, al poder dispersar y al cambiar el owner. El flujo de documentos se abre en la web.
- Número de tarjeta fuera de logs, de avisos y de la base. La tableta no recoge PAN.
- Dos secretos de webhook. Rechazo si la firma o el reloj fallan.
- Destino de dispersión solo a la cuenta ya verificada.
- Modo soporte visible para el owner y escrito en auditoría. Solo desde la consola web.
- Aviso de privacidad publicado como condición del beacon y del botón Donar.
- El push token se borra al cerrar sesión y al revocar la familia. No se usa para medir al donante.
- El frente público, el dato del donante, el CFDI y las llaves del live se cierran como dice la sección 11. La llave RTMP no sale del worker.

## 11. Huecos contrastados con su resolución

Cada fila es un hueco que el análisis todavía no construye, y la forma en que esta arquitectura lo cierra.

| Hueco | Resolución | Cuándo entra |
| --- | --- | --- |
| El landing, el beacon y el alta del cobro están abiertos a cualquiera | Un WAF delante de esas tres rutas. Redis limita por dirección de red y por campaña: beacon, creación de intento de pago e inicio de sesión. Stripe Radar frena la prueba de tarjetas. El servidor sigue fijando el monto | Con el landing público, en el paso 3 del orden |
| La descripción de la campaña se pinta en una página pública | El API sanea el HTML en el servidor, con lista blanca de etiquetas de texto. Rechaza script, estilos en línea y marcos que no sean el reproductor de esta plataforma. La URL de video solo puede ser el almacén propio o el HLS del live. La página pública manda una CSP que prohíbe orígenes ajenos de script | Con el landing público |
| El video y la ficha salen del mismo origen que la API | La CDN sirve imágenes, video grabado y HLS. La API, los webhooks y el beacon no se cachean | Con el primer medio público |
| El libro no se borra, y el donativo guarda nombre y correo | La donación guarda `privacy_notice_id` de la versión aceptada. Una solicitud de acceso, rectificación, cancelación u oposición anonimiza nombre y correo en la fila del donativo cuando el plazo de la jurisdicción ya lo permite. Los asientos de monto permanecen | Con el libro, en el paso 3 |
| En México el plan es un servicio facturable y el donativo es otro hecho | La suscripción pagada dispara el puerto de CFDI 4.0 a nombre de la organización. El recibo del donante muestra bruto, comisión de la pasarela, comisión de la plataforma y neto, y el texto fijo de que no es un comprobante fiscal deducible. El comprobante deducible, si existe, lo emite la organización donataria por su cuenta | El CFDI, con la historia del plan. El texto del recibo, con el libro |
| Las llaves que cifran tokens de redes y el restore del libro no tienen dueño operativo | Cifrado con sobre y KMS. Rotación al salir quien tenía acceso y al menos una vez al año. El paso de dispersión no se acepta sin un restore del libro ya ensayado y sin una revisión de seguridad externa del cobro y del ingest del live | Antes de dispersar en producción y antes de abrir el live al público |
| Una campaña comercial puede querer Shopify o Etsy | La campaña guarda una URL https de tienda y el landing la muestra como enlace. No hay OAuth de la tienda ni lectura de pedidos. Si más adelante se conecta el catálogo, los pedidos escriben un libro de ventas distinto del libro de donativos, con su IVA y sus reembolsos | El enlace, con la campaña. El conector de pedidos queda fuera de esta construcción |
| Hace falta un SDK para integrar | El único SDK de esta fase es el paquete TypeScript generado desde OpenAPI, que ya consumen la web y la tableta. La API pública hacia terceros espera a una versión `/v1` congelada y a webhooks de salida. Un SDK de varios lenguajes se genera desde esa versión, cuando deje de moverse | El paquete interno, desde el primer incremento. El SDK externo queda fuera |

## 12. Transmisión en vivo

Desde la plataforma se emite un live de la campaña a las redes que tengan conector de live y credenciales vigentes. Hay un solo origen. Cada red recibe su propia sesión. Una red sin conector aparece en la pantalla con el motivo y no se finge.

Lo inician owner, admin y publisher, desde la web o desde la tableta. El editor y el tesorero no abren la sala. El donante no emite: en el landing ve el reproductor y el panel de donar.

El tipo causa puede emitir. El tipo comercial puede emitir. El tipo electoral espera el paquete de jurisdicción, igual que el cobro. El plan fundador trae cero minutos. El plan de pago trae 60 minutos en `live_minutes_included`. El contador es por organización y por mes. Si no quedan minutos, no se abre otra sala. Una sala abierta se corta a las cuatro horas. Esta salida se construye después de la historia del plan de pago.

### Catálogo

| Red | Cómo acepta un live de un tercero | En esta construcción |
| --- | --- | --- |
| Facebook Página | API de video en vivo, entrada RTMP | Primera salida |
| YouTube | Live Streaming API, entrada RTMP | Primera salida, en el mismo incremento |
| LinkedIn | RTMP solo si LinkedIn ya aprobó la página | Conector escrito y apagado hasta esa aprobación |
| TikTok | Live condicionado a la auditoría de la aplicación | Conector apagado |
| X | Emisión condicionada al permiso de live | Conector apagado hasta ese permiso |
| Instagram | Sin entrada RTMP pública y estable para un tercero | Fuera hasta que la API la ofrezca |
| Threads, Pinterest, WhatsApp, Telegram, Snapchat | No son destino de este live | Fuera |

### Recorrido

1. Quien emite abre `live_session` de una campaña y elige destinos. El servidor comprueba rol, tipo de campaña, minutos restantes y que cada conexión siga válida.
2. Cada conector crea la emisión en su red y devuelve el destino RTMP. La llave de esa entrada se cifra. No viaja al navegador ni a la tableta, y no se escribe en logs.
3. La web o la tableta publica cámara y micrófono por WebRTC a LiveKit, con un token de sala que dura lo que la sesión y nombra ese `live_session.id`.
4. El worker toma la salida compuesta y empuja un RTMP por destino. Si una red rechaza, esa fila queda en fallo y las demás siguen.
5. Mientras el estado es en vivo, el landing cambia el video grabado por el HLS de la CDN. El panel de donar permanece.
6. Detener cierra todos los destinos que sigan en vivo, guarda la grabación en el almacén y suma los minutos al mes.
7. Si el origen se corta, hay 30 segundos para reconectar. Al vencer, la sesión termina y el worker manda stop a cada red, para que no quede una emisión vacía del otro lado.

Volver a iniciar con el mismo `live_session.id` no abre una segunda emisión en una red que ya está en vivo.

La pantalla, en cualquier ancho, lista las redes del catálogo. Las que no pueden salir muestran la razón. Desde 1024 px la vista previa queda junto a la lista. Por debajo, la lista va bajo la vista previa.

El estado por destino es pendiente, en vivo, fallo o terminado. El aviso de fallo de una red usa el mismo canal que una publicación fallida.

## 13. Qué queda explícitamente para después

App nativa de teléfono, instalador de escritorio, invitaciones, segunda red de publicación, cambio de plan ya especificado, compra automática de pauta, consola de plataforma dentro de la app de tableta, un segundo adaptador de pagos, el conector de pedidos de Shopify o Etsy, el SDK externo y las redes de live que la sección 12 deja apagadas o fuera. Operar desde el teléfono ya entra por la web responsiva. El enlace de tienda, el CFDI del plan, el frente público, el trato del dato del donante y el live a Facebook y YouTube entran en esta construcción.

## 14. Orden de la primera implementación

Sigue la tabla del análisis y le suma el cimiento técnico en el primer incremento. La web acompaña cada historia de consola. La tableta no bloquea el libro ni el landing: se entrega en cuanto el endpoint que necesita ya está en staging.

1. Repositorio con API, web y app de tableta, módulos vacíos, PostgreSQL, RLS, migraciones, CI y staging. El paquete de contratos compila aunque las pantallas estén vacías.
2. Historias 1 a 4 en la web: cuenta, 2FA de roles sensibles, enlace de Google o Microsoft después de la clave local, organización y campaña en borrador, con slug generado o escrito por el usuario y con la URL de tienda si la campaña la trae. La tableta entra con el mismo login y la lista de campañas en solo lectura.
3. Historias 5 y 6 en la web pública: borrador y publicación del aviso, página de donación creada al publicar, donación, libro, webhook idempotente, recibo con el texto fiscal, WAF, límite de tasa, saneo, CSP y CDN. La tableta no cobra.
4. Historias 7 a 9: Facebook en la web, pieza, ficha, preview y publicación. La tableta muestra el preview en dos paneles y abre el OAuth en el navegador.
5. Historia 10: pixel, exclusiones, cubos de vista y de clic en Donar, SSE, tablero y carga de gasto. El tablero queda en la web y en la tableta. El gasto se carga en la web y se consulta en la tableta.
6. Historia 11 en la web: suscripción con 60 minutos de live, CFDI del plan y reemplazo del plan fundador.
7. Live de la sección 12: sala en web y tableta, salida a Facebook Página y YouTube, reproductor en el landing, cuota de 60 minutos. Una red que falle no apaga la otra. El plan fundador no abre sala.
8. Historia 12 en la web: dispersión, segundo owner por encima de 1,000 USD, disputas y reporte del libro, después del restore ensayado y de la revisión de seguridad. La tableta consulta disputas y pide el PDF.
9. Consola de plataforma en la web, sobre los mismos hechos, sin un segundo libro.

Al cerrar el paso 5 el admin ya ve clics, porcentajes y origen en el navegador y en la tableta. Al cerrar el paso 3 el dinero ya cuadra aunque el tablero todavía no exista. Al cerrar el paso 7 ya se puede emitir a Facebook y a YouTube desde la web o desde la tableta.
