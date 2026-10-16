# Sitio para promocionar la aplicación

Documento de análisis. Octubre 2026. Describe la página con la que una organización decide crear una cuenta. No es el landing de una campaña, ni la consola, ni la app de tableta.

El análisis del sistema manda en reglas, precios y redes. Este sitio solo puede afirmar lo que ese análisis ya fijó.

## 1. Para qué existe

El visitante de esta página es quien va a operar campañas: el futuro owner. Llega, entiende el lazo y crea una cuenta. Ese alta es CU-01. A partir de ahí el producto sigue solo: verifica el correo, crea la organización y deja la primera campaña en borrador.

El donante no usa esta página. Quien hace clic en un post abre el landing de esa campaña.

## 2. Qué no es

| Superficie | Quién entra | Qué hace |
| --- | --- | --- |
| Este sitio | Futuro owner | Explica el producto y lleva a crear cuenta |
| Landing de campaña | Donante | Video, meta, aviso y panel para donar |
| Consola | Miembro | Tablero, piezas, programación, plan |
| App de tableta | Miembro | Tablero y operación en mesa |

La raíz de este sitio no puede ser `/c/{slug}`. Un slug de campaña y una ruta de promoción no comparten camino. El sitio promocional vive en su propio host. El landing de campaña vive en el host público del producto.

Aquí no hay botón Donar, no hay pixel de campaña y no se escribe `visit_event`. La medición de esta página es del sitio comercial, en otra propiedad. No entra al tablero de ninguna organización.

## 3. La página

Es una sola página, mobile first, en los anchos que ya usa el producto: 390, 768, 1024 y 1440 px. Por debajo de 1024 px hay una columna. Desde 1024 px el texto y la pieza de producto van juntos. Los controles de toque miden al menos 44 px.

El argumento cabe en el primer recorrido. Precio, tipos de campaña y preguntas son anclas de esa misma página. Aviso de privacidad del sitio y términos son las dos rutas aparte: son del proveedor del software, no el aviso CU-21 de una campaña.

| Ancla | Qué tiene que quedar claro |
| --- | --- |
| Inicio | Qué hace el producto y el alta |
| Recorrido | Campaña, red, página, donativo, tablero |
| La página del clic | Cómo ve el donante el landing |
| Tablero | Vistas, clics en Donar, origen |
| Precio | El plan que está en la tabla `plan` |
| Tipos | Causa, electoral y comercial, con su límite |
| Preguntas | Lo que el producto no hace |

## 4. Recorrido de la página

1. Una frase: se crea la campaña, se publica en las redes conectadas y quien hace clic llega a una página para donar.
2. El botón principal abre el registro del producto. El secundario baja a ver el landing de ejemplo.
3. Cinco pasos, en este orden: crear la campaña, conectar la red, publicar, abrir la página, ver el resultado. Programar no se presenta como si ya hubiera publicado. Cobrar no se presenta como si el dinero ya estuviera en el libro.
4. Una composición real de la consola y del landing, con los mismos tokens visuales del producto. No se usan fotos de actos ni de multitudes como si fueran una campaña de un cliente.
5. El precio, una sola tarjeta.
6. Tres tipos de campaña, cada uno con la restricción que el sistema ya impone.
7. Cierre con el mismo botón de crear cuenta.

El ejemplo del landing lleva la marca de ejemplo. No publica aviso, no enciende Donar y no crea un intento de pago. El texto de relleno del diseño no cuenta como aviso publicado.

## 5. Lo que se puede decir

La página habla en presente solo de lo que ya está construido. Lo demás no se anuncia como disponible.

Cuando estén cerradas las historias 1 a 9, la página puede decir:

- Cuenta, organización y campaña en borrador.
- Publicación en Facebook como Página.
- Landing con aviso de privacidad. Sin aviso publicado no hay medición ni botón Donar.
- Donación que queda en el libro, con bruto, comisión de la pasarela, comisión de la plataforma y neto.
- El recibo dice que no es un comprobante fiscal deducible.

Estas piezas se agregan el día en que su historia cierra, y no antes:

| Historia cerrada | Frase que entonces sí puede salir |
| --- | --- |
| 10, medición | El tablero parte vistas, clics en Donar y origen por red. El CPC aparece si la organización cargó el gasto |
| 11, plan | El plan de pago reemplaza al fundador e incluye 60 minutos de live al mes |
| 14, live | Se emite a Facebook Página y a YouTube desde la web o la tableta. El plan fundador no abre sala |
| 12, dispersión | El retiro pide identidad verificada. Por encima de 1,000 USD aprueba otro owner |

Facebook Página es la primera red. Instagram se menciona como red que espera a esa Página, no como publicación disponible. LinkedIn, TikTok y X en vivo permanecen apagadas, con el motivo, hasta que el catálogo las encienda. Threads, Pinterest, WhatsApp, Telegram y Snapchat no se ofrecen.

## 6. Precio

Hay una tarjeta. Los números salen de la fila `plan` con código `campana`, no de un texto suelto en la página.

Referencia de diseño ya fijada: 199 USD al mes, 5 campañas, 60 minutos de live y comisión de 1.5% sobre el bruto de los donativos. La comisión de la pasarela se suma aparte y se muestra en el recibo del donante. El plan fundador no se vende en esta página: es el plan interno hasta que existe la suscripción de pago.

La tarjeta dice también lo que el precio no incluye: compra de pauta, app nativa de teléfono y lectura de pedidos de una tienda. El enlace de tienda, cuando se mencione, es una URL https en el landing.

El CFDI que el producto timbra es el de esta suscripción. No se presenta como comprobante del donativo.

## 7. Tres tipos, con su límite

| Tipo | Qué promete la página | Qué no promete |
| --- | --- | --- |
| Causa | Página para donar y, con el plan de pago, live | Un comprobante deducible emitido por el producto |
| Comercial | Publicación, landing y enlace de tienda | Página de donación |
| Electoral | Campaña en borrador desde el primer día | Cobro o live antes de cargar el paquete de jurisdicción |

## 8. Preguntas que la página responde

- El donante no crea cuenta.
- La tarjeta no entra a estos servidores. La pasarela la captura.
- El producto no compra pauta. El gasto, si se quiere ver el CPC, lo carga la organización.
- Una tienda no se conecta. Se puede fijar un enlace https.
- El recibo del donante no es un CFDI deducible. Si la organización es donataria, ese comprobante lo emite ella.
- WhatsApp y Telegram no son el publicador de esta entrega.

## 9. Confianza

La página separa los dos cobros. Quien contrata paga el plan. Quien dona aporta a la campaña. El proveedor del software no aparece como aportante.

Se muestran tres hechos, sin cifras de clientes que el sistema no tenga:

- Dos libros, el de la campaña y el comercial.
- El aviso publicado es condición para medir y para cobrar.
- Nadie en la consola reescribe un monto ya asentado.

No hay testimonios, logotipos de organizaciones ni métricas de recaudación hasta que existan y se puedan mostrar con su permiso. Un número inventado no entra.

## 10. Alta

El botón Crear cuenta sale del host promocional y abre el registro del producto. No se duplica el formulario en esta página: correo, contraseña, verificación y organización tienen una sola implementación, la de CU-01 y la del primer ingreso.

Google y Microsoft no están en esta página como alta. En el producto no crean usuario. El enlace del proveedor ocurre después, con la clave local.

Entrar, para quien ya tiene cuenta, apunta al mismo acceso de la consola.

## 11. Fuera de este sitio

Blog, padrón de casos de éxito, comparativa con otros productos, chat de ventas, checkout del plan dentro de la página promocional y cualquier donativo a nombre del proveedor. Contratar el plan sigue siendo CU-04, dentro de la consola, cuando esa historia exista.

## 12. Cuándo se construye

Después de que el registro y el landing de campaña existan en staging. La página promocional enseña esas dos superficies. No se publica antes, porque no tendría a dónde llevar el alta ni un landing real que mostrar.

Se revisa en los mismos anchos: 390, 768, 1024 y 1440 px. Se acepta cuando el botón crea una cuenta nueva por CU-01, el ejemplo no puede cobrar y ninguna frase anuncia una red o una historia que todavía no esté cerrada.
