# Especificación del sistema de campañas

Documento de análisis y diseño. Independiente de marca. Octubre 2026.

Cubre identidad y acceso, campañas, distribución a redes, landing, donaciones, suscripciones, medición, correos, segundo factor, consola de plataforma y seguridad de pagos.

---

## 1. Frontera del sistema

El sistema administra organizaciones que pagan una suscripción, crean campañas, publican piezas en las redes que cada organización conecta y, si el plan y el tipo de campaña lo permiten, reciben donaciones en una página pública. El donante no necesita cuenta. El usuario que opera la campaña sí.

Hay dos identidades que no se mezclan: entrar a la consola, y autorizar una red para publicar. Hay dos cobros que no se mezclan: el usuario paga el plan y el donante aporta a la campaña.

### Subsistemas

| Subsistema | Responsabilidad | Dueño del dato |
| --- | --- | --- |
| Identidad y acceso | Cuenta, sesión, membresía, roles | Usuario y organización |
| Campañas | Expediente, piezas, variantes, aprobación | Campaña |
| Distribución | Conexión OAuth de cada red y envío | Publicación y conexión |
| Donaciones | Página pública, cobro, libro y dispersión | Campaña recaudadora |
| Suscripciones | Plan, factura y derechos de uso | Organización como cliente |
| Auditoría | Hechos de seguridad y de dinero | Plataforma, solo inserción |

### Actores externos

| Actor | Intercambia | No hace |
| --- | --- | --- |
| Usuario operador | Credenciales, piezas, programación | Pagar la donación de un tercero |
| Donante | Monto y datos de recibo en la página pública | Entrar a la consola |
| Proveedor de identidad | Google o Microsoft, código con PKCE | Autorizar publicación en redes |
| Red social | OAuth de la cuenta que publica y el post | Cobrar la suscripción |
| Pasarela de donativos | Intento de pago y webhooks | Facturar el plan |
| Pasarela de suscripción | Customer, Subscription, Invoice | Asentar un donativo |
| Autoridad o contador | Exportes del libro | Operar la campaña |
| Operador de plataforma | Organizaciones, pagos atorados, usuarios | Editar montos del libro |

### Supuestos

Un usuario pertenece a varias organizaciones y elige una por petición. Los montos se guardan en unidades menores enteras más código de moneda. La programación la ejecuta este sistema a la hora debida. Solo se usa la programación nativa de la red cuando esa red la expone. WhatsApp y Telegram son mensajería con opt-in y quedan fuera del publicador de la primera entrega.

### Fuera de alcance

Compra de pauta publicitaria, padrón electoral, recorrido en campo, tienda y app móvil nativa. El gasto de pauta se carga a mano para calcular el CPC. El modelo deja llave para colgar después otras piezas de la campaña, sin mezclarlas con el publicador.

---

## 2. Casos de uso

Después del alcance, el análisis se fija en los casos de uso. Programar no es publicar: la publicación la dispara el reloj. Cobrar no es asentar: el asiento lo dispara el webhook.

### Relaciones

| Caso | Relación | Con | Cuándo |
| --- | --- | --- | --- |
| CU-01 Registrarse | include | CU-18 Verificar correo | Al terminar el alta |
| CU-02 Iniciar sesión | extend | CU-16 Step-up | Si el usuario ya enroló TOTP, y siempre en owner, admin, tesorero y operador |
| CU-03 Invitar | include | CU-03a Aceptar invitación | Cuando el invitado abre el enlace |
| CU-04 Contratar plan | extend | CU-04a Cambiar o cancelar | Con suscripción ya existente |
| CU-04 Contratar plan | include | CU-16 Step-up | Si la organización ya dispersa fondos |
| CU-07 Armar pieza | include | CU-13 Validar variante | Una vez por canal |
| CU-08 Programar | include | CU-13 Validar variante | Antes de crear la publicación |
| CU-08 Programar | dispara | CU-12 Ejecutar publicación | Al llegar la hora |
| CU-09 Donar | include | CU-14 Evaluar elegibilidad | Antes de crear el intento de pago |
| CU-09 Donar | dispara | CU-15 Asentar webhook | Cuando la pasarela confirma |
| CU-09 Donar | precondición | CU-21 Publicar aviso | Sin versión publicada no hay intento |
| CU-05 Crear campaña | extend | CU-23 Enlace de tienda | Si capturan una URL de tienda |
| CU-04 Contratar plan | dispara | CU-20 Timbrar CFDI | Cuando el webhook de billing marca la factura pagada |
| CU-10 Dispersar | include | CU-16 Step-up | Siempre |
| CU-19 Emitir en vivo | precondición | CU-06 Conectar red | Cada destino exige una conexión vigente |

Include entra en el flujo del caso base. Extend es opcional. Dispara abre otro caso con otro actor. Precondición exige que el otro caso ya haya terminado.

### CU-01 Registrarse

Actor: visitante. Disparador: pide crear una cuenta. Precondición: el correo no existe.

1. El visitante envía correo y contraseña.
2. El sistema exige 12 caracteres como mínimo.
3. Guarda el usuario con hash Argon2id, sin correo verificado y sin sesión.
4. Incluye CU-18.

Alternos: el correo ya existe y se ofrece entrar; la contraseña no cumple y no hay fila; el correo no se entrega y se puede reenviar el enlace.

### CU-18 Verificar correo

Actor: usuario. Precondición: token de un uso, vigente 24 horas.

Abre el enlace. El sistema marca el token usado y escribe la fecha de verificación. Si venció o ya se usó, no verifica y ofrece reenviar.

### CU-02 Iniciar sesión

Actor: usuario. Precondición: el usuario existe.

1. Envía correo y contraseña, o vuelve de Google o Microsoft con un subject ya guardado.
2. El sistema rechaza si el correo no está verificado o la cuenta está bloqueada.
3. Si entra con clave, compara la contraseña. Si vuelve del proveedor, busca el subject y no compara el correo.
4. Crea la sesión. El token de acceso dura 15 minutos y no lleva el rol.
5. Si el rol lo exige, o si hay TOTP enrolado, incluye CU-16 antes de entregar la cookie de refresh.
6. El usuario elige organización si tiene más de una.

Alternos: el proveedor no crea usuario y no se enlaza solo por correo. Para guardar el subject hay que entrar antes con la clave local, con el correo ya verificado. Un subject sirve para un solo usuario, y un usuario enlaza cada proveedor una vez. Al quinto fallo de clave, bloqueo de 15 minutos. La cookie de refresh dura 30 días, rota en cada uso y, si reaparece una ya usada, se revoca toda la familia.

### CU-17 Recuperar contraseña

La pantalla responde lo mismo exista o no la cuenta. Si el usuario existe, el enlace dura 1 hora. Al usarlo se reemplaza el hash, se pone en cero el contador de fallos y se revocan todas las sesiones.

### CU-03 Invitar miembro y CU-03a Aceptar

Owner o admin, con suscripción vigente y asiento libre, invita por correo con un rol distinto de owner. El enlace dura 7 días. Aceptar crea la membresía. Si no hay cuenta, el invitado pasa antes por CU-01 y CU-18.

### CU-04 Contratar plan y CU-04a Cambiar o cancelar

El cliente de la factura es la organización. Hay una sola suscripción. El checkout y el webhook de billing son distintos de los de donativos. Un pago inicial fallido deja la suscripción incomplete y no habilita escritura. Past due da 3 días de gracia: se puede leer y no se puede dar de alta. Cancelar corta al fin del periodo. Los datos no se borran. Bajar de plan espera a ese fin si el uso actual no cabe. Cuando el webhook de billing marca la factura pagada, dispara CU-20.

### CU-16 Step-up

Código TOTP de 6 dígitos y 30 segundos. La sesión elevada dura 10 minutos para acciones de dinero. Al quinto código mal hay que esperar. Si el caso padre exige 2FA y no hay secreto, el caso se detiene y se ofrece enrolar.

Decisión de acceso: owner, admin, tesorero y el operador de plataforma entran con contraseña y código en cada login. Editor, publisher y analyst pueden activarlo. La verificación de persona, con documento, se pide una vez al activar la organización para dispersar y otra vez si cambia el owner. El donante no inicia sesión.

### CU-05 Crear campaña

Admin o editor, con cupo y suscripción usable. Captura nombre, objetivo, tipo (electoral, causa o comercial), jurisdicción, zona horaria IANA, inicio y fin. Puede enviar el slug de la URL pública. Si no lo envía, el sistema lo genera a partir del nombre: minúsculas, números y guiones, entre 3 y 60 caracteres. Si ese slug ya existe, se le añade un sufijo. El usuario puede cambiarlo mientras el aviso no esté publicado. Con un aviso publicado, el slug queda fijo.

La electoral sin paquete se guarda en borrador. No cambia de estado ni cobra hasta que el paquete esté cargado. Con paquete, el tipo electoral fuerza aprobación. Se puede guardar sin canales, y en ese caso no pasa a programada. El enlace de tienda, si viene, sigue CU-23. Postcondición: campaña en borrador, sin piezas y sin publicaciones.

Estados: borrador, en revisión, programada, activa, pausada, cerrada, archivada. Pausar detiene salidas. Cerrar cancela lo programado que el worker todavía no tomó. Con donaciones liquidadas no hay delete.

### CU-06 Conectar red social

OAuth de esa red, con state firmado que incluye la organización. Los tokens se cifran. No abre sesión en la consola. Sin el scope de publicación, la conexión queda en reautorización. WhatsApp y Telegram no entran a este caso.

### CU-07 Armar pieza y CU-13 Validar variante

El texto maestro no se envía a las redes. Cada canal tiene una variante. CU-13 compara longitud, tipo de archivo, peso, duración, campos obligatorios y scopes. Una variante inválida se guarda y no se programa. Las demás pueden seguir.

### CU-08 Programar y CU-12 Ejecutar publicación

Programar crea una fila por variante y conexión, con la hora futura dentro de la vigencia. Si el cupo del periodo no alcanza para el lote, no se guarda un subconjunto. A la hora, el reloj toma la fila con bloqueo, refresca el token si vence en menos de 5 minutos y publica usando el id de la publicación como llave. El fallo de una red no revierte las otras. Errores de tasa y 5xx se reintentan hasta 5 veces. Token sin refresh, medio rechazado y rechazo de política son terminales.

### CU-09 Recibir donación, CU-14 Elegibilidad y CU-15 Webhook

La página pública no pide cuenta. Precondición: CU-21 dejó una versión publicada; la donación guarda ese `privacy_notice_id`. Antes del cobro, la política puede rechazar tipo de persona, país o tope. Se crea la donación pendiente y el intento de pago. El webhook firmado, con event_id único, liquida y escribe tres asientos: bruto, fee de pasarela y fee de plataforma. El recibo muestra ese desglose y el texto de que no es un comprobante fiscal deducible. La factura del plan no aparece. Un reembolso o una disputa son asientos nuevos.

El recurrente es un mandato. Cada ciclo exitoso crea una donación hija. Un ciclo fallido marca el mandato past due y no cierra los pagos únicos.

### CU-10 Dispersar

Precondición: identidad de la organización verificada, cuadre del día en cero, saldo líquido y step-up vigente. La cuenta destino es la ya verificada. Si el monto supera 1,000 USD (100000 unidades menores), otro owner aprueba. Una dispersión en otra moneda también pide ese segundo owner. Si el cuadre no cierra, no hay dispersión. Un envío fallido deja un asiento inverso.

### CU-11 Cerrar campaña

No se cierra si hay una publicación en envío o un live en vivo. Se cancelan las programadas, se detiene el live, se cierra la página y se piden cancelar los mandatos. El libro permanece el plazo de retención.

### CU-19 Emitir en vivo

Actor: owner, admin o publisher. Precondición: campaña causa o comercial, o electoral con paquete de jurisdicción; minutos de live restantes en el plan; cada destino elegido tiene conexión vigente y conector de live encendido. El plan fundador tiene cero minutos. El plan de pago incluye 60 minutos al mes. Esta historia se construye después de ese plan.

1. Elige la campaña y uno o más destinos del catálogo de live.
2. El sistema abre una sesión y una fila por destino.
3. Cada conector crea la emisión en su red. La llave de entrada se cifra y no vuelve al navegador ni a la tableta.
4. El cliente recibe un token de sala, de la duración de esa sesión, y publica cámara y audio.
5. El worker envía un flujo por destino. El landing cambia el video por el reproductor y deja el panel de donar.
6. Al detener, se cierran los destinos que sigan en vivo, se guarda la grabación y se suman los minutos del mes.

Alternos: un destino falla y los demás siguen, con aviso al editor y al publisher. Sin minutos, la sala no abre. El electoral sin paquete no abre sala. Una red apagada o fuera del catálogo se muestra con el motivo y no recibe flujo. Si el origen se corta, hay 30 segundos para reconectar; al vencer, stop en cada red. A las cuatro horas la sala se corta. Repetir el inicio de la misma sesión no abre una segunda emisión. El donante no emite.

Catálogo de live: Facebook Página y YouTube salen encendidos. LinkedIn, TikTok y X quedan apagados hasta que esa red autorice la emisión. Instagram no tiene entrada utilizable por un tercero. Threads, Pinterest, WhatsApp, Telegram y Snapchat no son destino.

### CU-20 Timbrar CFDI

Actor: el sistema. Disparador: el webhook de billing, con su propio secreto, marca pagada la factura de la organización. Precondición: la factura cuelga de la suscripción y no tiene llave hacia el libro de campaña.

1. Se confirma el pago de la suscripción en el libro comercial.
2. El puerto de CFDI 4.0 timbra a nombre de la organización.
3. La factura guarda el folio fiscal y queda timbrada.

Alternos: el PAC rechaza y la factura queda en fallo de timbrado; la suscripción puede estar active y el owner ve el fallo. Reintentar usa el mismo id de factura y no timbra dos veces. El donativo no entra a este caso. El recibo del donante no es un CFDI deducible; si la organización es donataria, ese comprobante lo emite ella.

### CU-21 Publicar aviso de privacidad

Actor: owner o admin. Precondición: campaña existente.

1. Redacta responsable, finalidad, datos y plazo.
2. Puede guardar un borrador. El borrador no mide ni cobra.
3. Publicar crea la versión siguiente, retira la versión publicada anterior y escribe la fecha. En esa misma transacción crea la página de donación si la campaña no es comercial y el plan tiene donativos. Si la página ya existe, no crea otra.
4. Desde ese momento el pixel puede correr. El botón Donar puede encenderse si la página quedó creada, la campaña está activa y el resto de CU-09 se cumple.

Alternos: publicar sin responsable, finalidad, datos o plazo se rechaza. El texto de ejemplo del diseño no cuenta como publicado. Una donación ya creada conserva el id de la versión que aceptó, aunque después se publique otra.

### CU-22 Atender derechos del donante

Actor: owner o tesorero. Disparador: el titular pide acceso, rectificación, cancelación u oposición sobre el nombre o el correo de una donación de esa organización.

1. Se localiza la donación dentro de la organización.
2. Acceso entrega el dato de contacto y la versión del aviso guardada.
3. Rectificación corrige nombre o correo mientras la fila no esté anonimizada.
4. Cancelación u oposición, cuando el plazo de la jurisdicción ya lo permite, deja nombre y correo vacíos y escribe la fecha de anonimización.

Alternos: si el plazo no se cumplió, no se anonimiza. Monto, moneda, campaña y `privacy_notice_id` no cambian. No hay delete de la donación, del intento, del libro ni de la auditoría.

### CU-23 Fijar enlace de tienda

Actor: owner, admin o editor. Precondición: la campaña existe y no está archivada. Aplica a cualquier tipo, incluida la comercial, que no abre página de donación.

1. Envía una URL que empiece por https, o vacío para quitarla.
2. El sistema la guarda en la campaña.
3. El landing la muestra como enlace. No abre sesión con la tienda.

Alternos: una URL que no es https se rechaza y la anterior permanece. No se leen pedidos, inventario ni pagos de Shopify, Etsy ni de otra tienda. Esas ventas no escriben el libro de donativos.

### Hueco cerrado en diseño

Ningún caso creaba la organización, y CU-05 la exige. Al primer ingreso, el usuario verificado da de alta la organización y queda como owner.

---

## 3. Autorización

| Acción | Owner | Admin | Editor | Publisher | Tesorero | Analyst |
| --- | --- | --- | --- | --- | --- | --- |
| Invitar y cambiar roles | Sí | Sí | No | No | No | No |
| Contratar plan | Sí | No | No | No | No | No |
| Crear campaña | Sí | Sí | Sí | No | No | No |
| Editar pieza | Sí | Sí | Sí | No | No | No |
| Aprobar pieza | Sí | Sí | No | No | No | No |
| Conectar red | Sí | Sí | No | No | No | No |
| Programar publicación | Sí | Sí | No | Sí | No | No |
| Ver donativos | Sí | Sí | No | No | Sí | Sí |
| Dispersar | Sí | No | No | No | Sí | No |
| Ver analítica | Sí | Sí | Sí | Sí | Sí | Sí |
| Cargar gasto de pauta | Sí | Sí | No | No | No | No |
| Ver disputas | Sí | No | No | No | Sí | Sí |
| Emitir en vivo | Sí | Sí | No | Sí | No | No |
| Publicar aviso | Sí | Sí | No | No | No | No |
| Fijar enlace de tienda | Sí | Sí | Sí | No | No | No |
| Atender derechos del donante | Sí | No | No | No | Sí | No |

El rol se lee en cada petición. Nadie borra filas de donación ni de auditoría.

---

## 4. Distribución a redes

No hay un post único para todas las redes. Una red está soportada cuando tiene fila en el catálogo, conector implementado y credenciales de aplicación vigentes.

Primera entrega de feed: Facebook (Página), Instagram (cuenta profesional ligada a una Página), X, YouTube, TikTok y LinkedIn. Threads y Pinterest después, por el mismo contrato. WhatsApp y Telegram son otro módulo. Snapchat queda fuera.

El conector implementa authorize, callback, refresh, validate, publish, status y revoke.

La primera red a construir es Facebook como Página. Instagram espera, porque necesita esa Página ya conectada.

X depende del nivel de API con permiso de escritura. TikTok, sin app auditada, solo puede dejar el video en borrador privado.

---

## 5. Landing, pixel y medición

El clic del post abre el landing de la campaña, no el formulario suelto. La página es pública. A la izquierda: video, descripción y avance de la meta. A la derecha: panel para donar. En pantalla estrecha el panel baja debajo del video.

### Tablero de la organización

Lo ven owner, admin y analyst. Por campaña y por red (Facebook, Instagram, TikTok, YouTube, X, directo, y cualquier otra que el referente identifique):

| Medida | Cálculo |
| --- | --- |
| Vistas y % vistas | Cargas contadas del landing, partidas por red. % vistas = vistas de esa red / vistas contadas |
| Clics y % clic | Clics en Donar, partidos por la red de la visita. % clic = clics de esa red / vistas de esa red |
| % donó | Donaciones liquidadas / clics en Donar de esa red |
| CPC | Gasto cargado de esa red / clics en Donar de esa red |

El CPC lo ven owner y admin. Si no hay gasto cargado, el CPC queda vacío y los clics y porcentajes siguen. El directo no tiene CPC. El gasto lo registra la organización; esta fase no compra la pauta. Ese gasto no es un asiento del libro de donativos. Un periodo cerrado no se edita; el ajuste es una fila nueva.

### Pixel

Corre solo en el landing de esa campaña. La carga de la página es una vista. El clic en Donar es un clic. Los dos viajan con el mismo identificador anónimo y se guardan con su tipo. Clasifica el origen con utm_source o con el dominio del referente. Guarda código postal aproximado por la red, navegador y tipo de dispositivo (teléfono, tableta o escritorio). No guarda calle, GPS ni identificador del equipo. La dirección de red se usa para la aproximación y no se conserva. La donación se atribuye cuando el cobro sigue en el mismo navegador. Cada organización ve sus campañas.

### Visitas que no cuentan

| Se excluye | Motivo |
| --- | --- |
| Vista previa de la red | Agente de Facebook, TikTok, X u otra red al armar la ficha |
| Recarga seguida | La misma visita, el mismo navegador, en menos de 30 minutos |
| Sin agente | La petición no trae navegador |

El evento se guarda con counted en falso y la razón. El tablero suma solo los contados. El admin ve cuántas quedaron fuera, no la dirección de red.

### Aviso de privacidad

El landing muestra responsable, finalidad, datos y plazo antes de medir y antes de cobrar. Sin aviso publicado, el pixel no corre y el botón Donar permanece apagado. El texto de ejemplo del diseño es un borrador de producto; el texto final lo revisa quien responda por la organización. El plazo de nombre y correo es el de la jurisdicción de la campaña.

### Ficha del enlace

Cada campaña guarda título, descripción e imagen. Esas piezas viajan con el enlace. Las redes arman con ellas la vista previa del clic. Si falta la imagen, el enlace se publica sin ficha.

---

## 6. Donaciones y suscripciones

### Donaciones

Página publicada, campaña activa y plan con donativos. Estados: pendiente, requiere acción, liquidada, fallida, reembolsada, disputada. Para cada liquidación, bruto = neto + fee de pasarela + fee de plataforma, en la misma moneda. Un cuadre diario compara el libro contra las donaciones liquidadas. Si difieren, esa campaña no se dispersa.

Paquete de jurisdicción versionado. La campaña electoral sin paquete no cobra. El tipo comercial no abre página de donación.

### Contracargos

Cuando la pasarela abre una disputa, el libro reserva ese monto y lo resta del saldo que se puede retirar. El tesorero ve el donativo, la fecha, el plazo y el estado. El caso sigue abierto hasta el fallo de la pasarela. Cerrar a favor devuelve el monto al saldo. Perderlo deja el asiento inverso.

### Suscripciones

Planes en tablas: precio, intervalo y cupos (asientos, campañas no archivadas, conexiones activas, publicaciones del periodo de facturación, bandera de donativos, minutos de live). El periodo de posts se alinea al periodo de la suscripción. Hasta existir la suscripción de pago, opera un plan interno fundador: 1 campaña, 2 conexiones, donativos activos y 0 minutos de live. Contratar el plan lo reemplaza.

Referencia de precio de diseño, no lista cerrada: Campaña, 199 USD al mes, 5 campañas, 60 minutos de live y comisión 1.5% sobre el bruto de donativos. La pasarela se suma aparte y se muestra en el recibo.

---

## 7. Seguridad de pagos

La tarjeta no entra a estos servidores. La pasarela captura el pago. Aquí queda el identificador, la marca y los últimos cuatro dígitos.

El navegador no decide el neto, las comisiones ni la campaña que recibe el dinero. El servidor crea la donación contra una página publicada. Si el aviso de la pasarela trae otro monto, o si bruto no es neto más las dos comisiones, el asiento no se confirma y esa campaña no se dispersa.

| Control | Efecto |
| --- | --- |
| Campos de la pasarela | El número de tarjeta no se guarda ni se escribe en logs |
| Llave del cliente | Repetir el intento no crea dos donaciones |
| Firma del webhook | Un aviso sin firma, o con reloj vencido, no toca el libro |
| event_id único | El mismo aviso no escribe un segundo asiento |
| Una transacción | Estado liquidada y tres asientos se confirman juntos |
| Libro de solo inserción | Reembolso y disputa agregan un asiento |
| Cuadre | Si no cuadra, se detiene la dispersión |

Para sacar el dinero: identidad ya verificada, cuenta destino registrada de antemano, segundo factor del tesorero si la última verificación pasa de 10 minutos, y otro owner si el monto supera el umbral. Los secretos de los dos webhooks son distintos y viven fuera del código. El operador de plataforma puede reintentar un webhook y no puede cambiar cifras del libro a mano.

| Actor | Puede | No puede |
| --- | --- | --- |
| Donante | Pagar en la página publicada | Ver el libro ni elegir otra campaña |
| Tesorero | Ver donativos, disputas y pedir dispersión | Cambiar un monto ya asentado |
| Owner | Contratar el plan y aprobar una dispersión alta | Mezclar la factura del plan con el donativo |
| Operador | Reintentar un webhook | Corregir cifras del libro a mano |
| Editor | Publicar | Ver instrumentos de pago ni dispersar |

---

## 8. Correos, avisos y segundo factor

El correo entrega enlaces y recibos. La consola muestra el mismo hecho a quien opera la campaña. El segundo factor es TOTP de 6 dígitos y 30 segundos, más ocho códigos de recuperación de un solo uso. El correo no sustituye ese código.

| Evento | Destino | Canal | Se puede apagar |
| --- | --- | --- | --- |
| Verificar correo | Usuario | Correo | No |
| Nueva contraseña | Usuario | Correo | No |
| Invitación | Invitado | Correo | No |
| Recibo de donación | Donante | Correo | No |
| 2FA activado | Usuario | Correo | No |
| Publicación fallida | Editor y publisher | Correo y consola | Solo el correo |
| Destino de live fallido | Editor y publisher | Correo y consola | Solo el correo |
| CFDI fallido | Owner | Correo y consola | No |
| Reautorizar red | Admin | Correo y consola | Solo el correo |
| Suscripción impaga | Owner | Correo y consola | No |

El aviso se encola después de confirmar el hecho. Un recibo no sale si el asiento no quedó. La llave es evento más entidad. Fallo de red del proveedor: hasta 5 intentos. Rebote: se detiene. El token del enlace se genera al armar el mensaje. En base queda el hash.

Activar 2FA guarda el secreto solo después de un código válido, muestra los ocho códigos una vez y guarda el hash. Perder el dispositivo: un código de recuperación abre sesión y obliga a enrolar de nuevo. Apagar pide contraseña y un código vigente, borra secreto y códigos, y avisa por correo.

---

## 9. Consola de plataforma

La usa el operador, con 2FA en cada sesión. No es miembro de la organización.

| Pantalla | Trabajo |
| --- | --- |
| Resumen | Organizaciones activas, campañas, ingreso del mes y pagos atorados |
| Organizaciones | Alta, país, verificación y plan. Sin identidad no se activa ni se dispersa |
| Campañas | Estado, bruto y cobertura de todas. Con libro no se borra; se pausa la página |
| Ingresos | Suscripciones cobradas más comisión. No es el neto de las campañas |
| Pagos | Webhook, disputa, dispersión fallida y suscripción impaga |
| Usuarios | Buscar, bloquear y cerrar sesiones. Con membresías no se elimina |

Si entra a la consola de una organización, es modo soporte: el owner ve ese acceso y la auditoría guarda quién entró y qué cambió. El ingreso de la plataforma es suscripción más comisión.

---

## 10. Interfaces

Tres cascarones de la organización, el mensaje de correo, la página pública y la consola de plataforma.

| Cascarón | Quién entra | Pantallas |
| --- | --- | --- |
| Acceso | Visitante o usuario sin sesión | Registro, verificación, ingreso, nueva clave, código 2FA |
| Consola | Miembro de la organización | Tablero, gasto, disputas, campañas, piezas, programación, conexiones, avisos, seguridad, plan |
| Público | Quien hace clic en el post | Aviso de privacidad, landing, panel de donación, recibo |
| Plataforma | Operador con 2FA | Resumen, organizaciones, campañas, ingresos, pagos, usuarios |

En Campaña, Pieza y Programar se ve el preview de la variante en Facebook, Instagram y X. El clic de ese preview abre el landing. La ficha del enlace es la vista previa que arma la red, distinta del preview del post.

---

## 11. Modelo de datos

PostgreSQL. Toda tabla de negocio lleva organization_id, salvo user, plan, el catálogo de redes, external_identity y oauth_transaction. Row level security exige ese predicado. Montos en bigint de centavos más char(3). Tokens en bytea cifrado. Medios en almacén de objetos.

Relaciones principales: user N—N organization por membership. Organization 1—1 subscription. Organization 1—N social_connection. Organization 1—N campaign 1—N content_item 1—N content_variant 1—1 publication 1—N publication_attempt. Campaign 1—1 donation_page 1—N donation. Cada liquidación genera asientos en campaign_ledger_entry. Invoice cuelga de subscription y no tiene llave hacia el libro de campaña.

Donaciones, intentos de publicación, libro y auditoría no se borran. El borrado en cascada solo aplica a variantes de una pieza que sigue en borrador.

Tablas que cierran los complementos:

| Tabla | Regla |
| --- | --- |
| ad_spend | Campaña, red, periodo y monto. No es libro de donativos. Periodo cerrado no se edita |
| visit_event | Vista o clic en Donar. counted y exclude_reason. Sin dirección de red conservada |
| external_identity | Proveedor google o microsoft, y el subject. No se enlaza por correo |
| oauth_transaction | State de un uso y verifier cifrado. Dura 10 minutos |
| campaign share | Título, descripción e imagen de la ficha del enlace |
| notification | event_code, channel email o in_app, status, idempotency_key único |
| mfa_recovery_code | Ocho hashes por usuario. Un uso |
| webhook_event | provider donations o billing, event_id único con el proveedor |
| privacy_notice | Versión por campaña. La donación guarda la versión aceptada |
| live_session y live_destination | Una sesión, una fila por red. La llave RTMP no está en claro |
| invoice | Folio fiscal del plan. Sin llave al libro de campaña |

El modelo físico, las políticas RLS y el contrato HTTP están en `diseno-detallado-campanas.md`, `campanas-esquema.sql` y `campanas-openapi.yaml`.

Atributos no funcionales: aislamiento por tenant, exactamente un cobro por evento, un post lógico por publication.id, secreto de red ilegible en el respaldo de aplicación, RPO de 15 minutos en libros y suscripción, RTO de 1 hora. Archivar no ejecuta DELETE de libro ni de auditoría.

---

## 12. Diseño de la fase 1 y orden de construcción

La fase 1 es el lazo mínimo: entrar, crear la organización y una campaña, recibir una donación que queda en el libro, y publicar en Facebook como Página. La política del primer cobro es el paquete causa: persona física u organización, sin tope, recibo con fees. El electoral usa el mismo puerto, sin reglas cargadas. Quedan especificados y fuera de esta construcción: invitaciones, la segunda red y el cambio de plan. Dispersión, disputas, gasto, aviso, pixel y ficha quedan especificados en este documento para no reabrir el modelo al construirlos.

| Orden | Historia | Se acepta cuando |
| --- | --- | --- |
| 1 | Cuenta verificada | Un correo nuevo verifica y entra. El duplicado no crea usuario. El token vencido no verifica |
| 2 | Sesión, 2FA de roles sensibles, recuperación y proveedor | La clave mala bloquea al quinto intento. La clave nueva revoca sesiones. Owner, admin y tesorero no entran sin código. Google o Microsoft no crean usuario ni enlazan por correo. Con sesión local, el subject queda guardado |
| 3 | Organización del owner | El primer ingreso crea la org y el rol owner |
| 4 | Campaña en borrador | Guarda sin canales. La electoral sin paquete queda en borrador y no sale de ese estado. Sin slug, el sistema lo genera |
| 5 | Aviso, página y elegibilidad | El borrador no enciende el pixel ni Donar. Publicar el aviso crea la página si la campaña no es comercial y el plan tiene donativos. Un rechazo no crea intento de pago |
| 6 | Libro y recibo | Un webhook deja tres asientos que cuadran. El mismo event_id no escribe de nuevo |
| 7 | Página de Facebook | La Página queda conectada y cifrada. Sin scope queda en reautorización |
| 8 | Pieza, ficha y preview | La variante inválida no se programa. La ficha sin imagen no se publica como vista previa |
| 9 | Salida a Facebook | La fila programada publica una vez. Un 5xx reintenta. El fallo no borra la pieza |
| 10 | Medición | El tablero parte vistas, clics en Donar y porcentajes por red, y deja fuera recargas y vistas previas. El CPC usa el gasto cargado y esos clics |
| 11 | Plan de pago | La suscripción active reemplaza al plan fundador e incluye 60 minutos de live. Un pago fallido deja incomplete |
| 12 | Dispersión y disputas | Sin identidad no hay retiro. Por encima de 1,000 USD otro owner aprueba. Una disputa reserva el monto y baja el saldo disponible |
| 13 | Aviso versionado y enlace de tienda | Sin versión publicada no hay pixel ni Donar. La donación guarda esa versión. Una URL que no es https no reemplaza la anterior |
| 14 | Live | Se construye después del plan de pago. Facebook y YouTube reciben flujo. Un destino fallido no apaga el otro. Sin minutos la sala no abre |
| 15 | CFDI del plan | La factura pagada guarda un folio. El mismo id no timbra dos veces. El recibo del donante dice que no es deducible |
| 16 | Derechos del donante | Se anonimiza nombre y correo cuando el plazo ya lo permite. El monto del libro permanece |

Cada historia se prueba con el flujo principal y con los alternos de su caso.

---

## 13. Decisiones que ordenan el sistema

1. Dos libros: campaña y comercial. El proveedor de software cobra un precio de servicio y no aparece como aportante.
2. Login con 2FA para quien administra o mueve dinero. Verificación de persona solo al habilitar la dispersión y al cambiar el owner.
3. El pixel y el donativo dependen del aviso de privacidad publicado en el landing.
4. El tablero muestra clics, porcentajes y origen por red. El CPC depende del gasto cargado, no de una compra de pauta hecha por el sistema.
5. El operador de plataforma supervisa y no reescribe el libro.
6. El live tiene un origen y un destino por red. El CFDI es del plan. El enlace de tienda no es un pedido. El aviso publicado se versiona y la donación conserva esa versión.
7. La electoral sin paquete permanece en borrador, no cobra y no abre sala.
8. El plan de pago incluye 60 minutos de live al mes. El live se construye después de ese plan. El fundador sigue en 0.
9. La URL pública usa un slug. Si el usuario no lo escribe, el sistema lo genera. Con el aviso publicado, el slug queda fijo.
10. Google y Microsoft entran en el primer contrato. No crean usuario ni se enlazan por correo. El subject se guarda después de entrar con la clave local.
11. El aviso tiene borrador y publicación. Publicar crea la página de donación si la campaña no es comercial y el plan tiene donativos.
12. Una vista es la carga del landing. Un clic es el clic en Donar. El segundo owner aprueba la dispersión por encima de 1,000 USD.
)
