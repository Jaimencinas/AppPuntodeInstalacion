# Especificación técnica: Sistema de Reservas, Trazabilidad y Gestión de Puntos — Proyecto Volta

*Este documento está pensado para dárselo como contexto a Claude Code y usarlo como hoja de ruta de construcción del sistema. Complementa al informe de expansión de la red (población, reparto de puntos, problemas operativos).*

---

## 1. Qué tiene que resolver el sistema

Del informe anterior, el sistema tiene que resolver directamente los dos problemas más críticos detectados:

1. **Trazabilidad de la venta** (punto 7.2 del informe): que cada batería vendida a un punto quede vinculada a una instalación real, confirmada, con cliente y fecha — para que Volta no pierda ingresos por baterías que se venden pero no se reportan.
2. **Reservas de cita** (punto 7.1 del informe): que un cliente pueda reservar un cambio de batería (o presentarse sin cita) y que el punto de instalación correcto reciba esa reserva con tiempo de respuesta garantizado.

Además, tiene que dar soporte a la gestión de stock (10 baterías iniciales por punto, recompra a los 3 meses) y a los KPIs de seguimiento ya definidos en el informe (punto 9).

## 2. Actores del sistema (roles)

| Rol | Quién es | Qué necesita hacer |
|---|---|---|
| **Cliente final** | Persona que necesita cambiar la batería | Reservar cita (o pedir "lo antes posible"), recibir confirmación, saber a qué punto ir |
| **Punto de instalación** | Taller/gruista/personal propio | Ver su agenda, confirmar instalaciones, registrar qué batería instaló y a quién, ver su stock, solicitar reposición |
| **Administrador Volta** | Equipo de Volta | Ver todos los puntos en un mapa, dar de alta/baja puntos, ver KPIs globales, gestionar stock y recompras, gestionar facturación |

No hace falta que el cliente final tenga cuenta de usuario — con nombre, teléfono/email y matrícula del vehículo es suficiente para la reserva. Sí hacen falta cuentas con login para **punto de instalación** y **administrador**.

## 3. Modelo de datos (entidades principales)

Esto es lo primero que Claude Code tiene que construir (esquema de base de datos), porque todo lo demás depende de él.

```
PUNTOS_INSTALACION
- id
- nombre
- tipo            (taller | gruista | personal_propio)
- provincia
- ciudad
- direccion
- latitud, longitud
- telefono, email
- radio_servicio_km
- estado          (activo | pendiente_alta | baja)
- fecha_alta

USUARIOS
- id
- punto_id        (nulo si es admin)
- rol             (admin | punto)
- email, password_hash
- nombre

BATERIAS_CATALOGO
- id
- sku
- modelo, marca
- compatibilidad  (texto o tabla de vehículos compatibles)
- precio_mayorista (lo que paga el punto a Volta)

STOCK_PUNTO
- id
- punto_id
- bateria_id
- numero_serie
- fecha_recepcion  (para calcular los 3 meses de la política de recompra)
- estado           (en_stock | instalada | en_recompra)

RESERVAS
- id
- punto_id         (asignado, puede cambiar si se reasigna)
- cliente_nombre, cliente_telefono, cliente_email
- vehiculo_modelo, vehiculo_matricula
- tipo             (con_cita | walk_in)
- fecha_hora_solicitada
- estado           (pendiente | confirmada | completada | cancelada | no_presentado)
- origen           (google_ads | organico | telefono | otro)

INSTALACIONES
- id
- reserva_id
- punto_id
- stock_punto_id   (vincula la batería concreta instalada, con su número de serie)
- fecha_instalacion
- importe_servicio (30€ por defecto)
- confirmado_por   (usuario del punto que cierra la instalación)
- foto_evidencia   (opcional)

RECOMPRAS
- id
- stock_punto_id
- fecha_solicitud
- estado          (solicitada | aprobada | recogida | pagada)
```

**La pieza clave de todo el sistema es `STOCK_PUNTO` con `numero_serie`.** Cada batería que Volta envía a un punto entra como una fila individual, no como "10 unidades" genéricas. Esto es lo que permite: (a) saber exactamente qué batería se instaló en cada cliente, (b) calcular automáticamente cuáles llevan más de 3 meses sin venderse, y (c) cerrar el agujero de trazabilidad del informe anterior, porque una instalación solo se puede registrar contra una batería que existe en el sistema con ese número de serie.

## 4. Flujos clave

### 4.1 Flujo de reserva del cliente

1. El cliente entra en la web pública de Volta (o llega desde el anuncio de Google Ads).
2. Indica su ubicación (o la detecta el navegador) y, opcionalmente, su matrícula/modelo de coche.
3. El sistema le muestra el punto de instalación más cercano según su radio de servicio.
4. El cliente elige: **(a) reservar cita** en un hueco disponible del calendario del punto, o **(b) "voy ahora / lo antes posible"** (modalidad walk-in, ver 4.1.1).
5. Recibe confirmación por SMS/email/WhatsApp con: dirección del punto, hora estimada, código de reserva.

#### 4.1.1 Cómo tratar el walk-in dentro del mismo sistema

El "ven cuando quieras" del boceto original no puede ser una reserva sin datos — si no queda registrado, se pierde toda la trazabilidad. Por eso conviene tratarlo igual que una cita, pero con hora "ahora": se crea una reserva con `tipo = walk_in` y `fecha_hora_solicitada = ahora`, se envía igualmente al punto, y el punto la ve en su panel como "urgente, en camino" en vez de como una franja del calendario. Así el 100% de las visitas —con cita o sin ella— pasan por el mismo sistema de trazabilidad.

### 4.2 Flujo de confirmación del punto de instalación (trazabilidad)

1. El punto ve en su panel la lista de reservas del día (con cita y walk-in mezcladas por orden de hora).
2. Cuando el cliente llega, marca la reserva como "en curso".
3. Al terminar, el punto **tiene que seleccionar de su stock la batería concreta instalada** (por número de serie, idealmente escaneando un código de barras/QR si las baterías lo llevan) y confirmar el importe cobrado de servicio.
4. Solo en ese momento la reserva pasa a "completada" y el stock del punto se descuenta automáticamente en 1 unidad.

Este paso 3 es intencionadamente obligatorio y no editable a posteriori sin dejar rastro: es el control que impide que una venta "se pierda" entre el punto y Volta.

### 4.3 Flujo de stock y recompra

1. Cada unidad de `STOCK_PUNTO` lleva su `fecha_recepcion`.
2. Un proceso automático (tarea programada, diaria) revisa qué unidades llevan más de 3 meses en estado `en_stock` y las marca como elegibles para recompra.
3. El punto ve un aviso en su panel ("tienes 2 baterías elegibles para recompra") y puede solicitarla.
4. El administrador de Volta gestiona la recogida y marca la recompra como pagada.

### 4.4 Flujo de administración (Volta)

- Mapa con todos los puntos activos, coloreado por nivel de stock o volumen de reservas.
- Panel de alta de nuevos puntos (dar de alta punto → asignar stock inicial de 10 baterías con sus números de serie → el punto ya puede recibir reservas).
- Dashboard de KPIs (los del punto 9 del informe: tasa de trazabilidad, rotación de stock, % de recompras, tiempo medio de instalación, etc.), calculados directamente de las tablas anteriores.

## 5. Arquitectura técnica propuesta

Para construir esto con Claude Code de forma ágil, recomiendo un stack estándar, bien documentado y muy usado (Claude Code trabaja especialmente bien con stacks populares porque tiene mucho contexto de entrenamiento sobre ellos):

| Capa | Recomendación | Por qué |
|---|---|---|
| Frontend + Backend | **Next.js (React + TypeScript)** | Un único proyecto sirve tanto las páginas públicas (reserva) como los paneles privados (punto/admin) y la API. Reduce la complejidad de tener repos separados. |
| Base de datos | **PostgreSQL**, gestionado con **Supabase** | Supabase da Postgres + autenticación + almacenamiento de fotos + permisos por fila (útil para que cada punto solo vea sus propios datos) en un solo servicio, sin montar infraestructura propia. |
| Autenticación | Supabase Auth (o NextAuth) | Login para puntos y administradores; el cliente final no necesita cuenta. |
| Hosting | Vercel (frontend/backend) + Supabase (datos) | Despliegue rápido, gratuito para empezar, escala sin apenas configuración. |
| Notificaciones | Twilio (SMS/WhatsApp) o un proveedor de email transaccional (Resend, Postmark) | Confirmaciones de reserva al cliente y avisos al punto. |
| Mapa | Google Maps API o Mapbox | Para el mapa de puntos del admin y el "punto más cercano" del cliente. |

Este stack permite que Claude Code, trabajando desde el terminal o el escritorio, monte el proyecto completo (base de datos, backend y frontend) dentro de un mismo repositorio, con despliegue directo.

## 6. Integraciones externas

- **Google Ads:** cuando una reserva se marca como "confirmada", disparar un evento de conversión (Google Ads Conversion Tracking) para que la campaña sepa qué clics se convirtieron en cita real. Esto es clave para optimizar el gasto publicitario que ya se menciona en el boceto original.
- **Ficha de Google Negocio de cada punto ("Tienda"):** el botón de "Reservar" de cada ficha debe enlazar a la página pública de reserva de Volta, con el `punto_id` correspondiente ya preseleccionado (por ejemplo, `volta.es/reservar?punto=123`), para que el cliente no tenga que volver a elegir el punto.
- **WhatsApp/SMS:** confirmaciones y recordatorios automáticos, tanto al cliente como al punto.

## 7. Seguridad y permisos

- Cada punto de instalación solo puede ver y modificar **sus propias** reservas, su propio stock y sus propias instalaciones — nunca las de otro punto. Esto se implementa con permisos a nivel de fila en la base de datos (Row Level Security de Supabase), no solo con lógica en el frontend, para que sea imposible saltárselo aunque alguien manipule las peticiones.
- El administrador de Volta tiene acceso completo a todos los puntos.
- El registro de una instalación (paso 4.2.3) debe quedar en un histórico inmutable — no se debe poder editar libremente después de confirmada, solo anular con motivo, para preservar la trazabilidad.

## 8. Fases de construcción recomendadas (para ir pidiéndoselo a Claude Code por partes)

No conviene pedirle a Claude Code "construye todo el sistema" de una vez — funciona mucho mejor dividido en fases pequeñas y verificables:

**Fase 0 — Base del proyecto**
- Repositorio, proyecto Next.js, conexión a Supabase, esquema de base de datos (las tablas del punto 3).

**Fase 1 — Reserva pública + panel del punto (lo mínimo para operar)**
- Página pública de reserva (con o sin cita).
- Panel de login para el punto, con su agenda del día.
- Confirmación de instalación con número de serie (el corazón de la trazabilidad).

**Fase 2 — Stock y recompra**
- Alta de stock inicial por punto.
- Descuento automático de stock al confirmar instalación.
- Aviso automático a los 3 meses.

**Fase 3 — Panel de administración**
- Mapa de puntos, alta/baja de puntos, KPIs.

**Fase 4 — Notificaciones e integraciones**
- SMS/WhatsApp/email.
- Conversión de Google Ads.
- Enlace desde la ficha de Google Negocio.

**Fase 5 — Facturación**
- Liquidaciones periódicas por punto (lo que el punto debe a Volta por baterías, lo que Volta debe al punto en recompras).

## 9. Cómo trabajar esto en la práctica con Claude Code

1. **Crea un repositorio** para el proyecto (por ejemplo en GitHub) y ábrelo con Claude Code (terminal, VS Code, o la app de escritorio).
2. **Escribe un archivo `CLAUDE.md`** en la raíz del proyecto con el contexto de negocio resumido: el modelo (Volta vende baterías, el punto instala y cobra 30€ de servicio), el stack elegido (Next.js + Supabase), y las reglas importantes (ej. "cada instalación tiene que vincularse a una fila de STOCK_PUNTO con número de serie, nunca descontar stock genérico"). Claude Code lee este archivo automáticamente al empezar cada sesión, así no hay que repetir el contexto cada vez.
3. **Guarda este documento y el informe anterior** dentro del repo (por ejemplo en `/docs/`) para que Claude Code pueda consultarlos como referencia cuando lo necesite.
4. **Pide las fases del punto 8 una por una**, no todas de golpe — por ejemplo: *"Monta la Fase 0: proyecto Next.js con Supabase y crea las tablas del modelo de datos que están en /docs/especificacion.md"*. Cuando esté hecho y probado, se pasa a la siguiente fase.
5. Para cambios grandes de arquitectura, es buena práctica pedirle primero un plan ("no implementes todavía, dime cómo lo harías") antes de dejar que ejecute, así puedes corregir el enfoque antes de que escriba código.
6. Cada vez que Claude Code termine una fase, prueba el sistema en local o en el despliegue de Vercel antes de seguir — no acumules varias fases sin probar, porque los errores se detectan y corrigen mucho más rápido uno a uno.
