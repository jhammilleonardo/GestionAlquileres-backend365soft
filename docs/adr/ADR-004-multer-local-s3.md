# ADR-004: Multer local en desarrollo — Plan de migración a S3

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-04-07 |
| **Autores** | Equipo 365Soft |
| **Estado** | Aceptado (migración a S3 pendiente para producción) |

---

## Contexto

El sistema gestiona múltiples tipos de archivos generados por los usuarios:

- Imágenes de propiedades (JPG/PNG, subidas por el admin)
- Documentos de contratos (PDF, generados o subidos)
- Comprobantes de pago (JPG/PNG/PDF, subidos por inquilinos)
- Fotos de mantenimiento (JPG/PNG, subidas por técnicos desde el celular)
- Documentos de solicitudes de alquiler (carnet de identidad, boletas de sueldo)

Se necesita una estrategia de almacenamiento que funcione en desarrollo local sin fricción y que escale en producción.

Se evaluaron dos opciones:

**Opción A — Solo Multer local:** Archivos en disco del servidor. Simple pero no escalable.  
**Opción B — Solo S3 desde el inicio:** Requiere cuenta AWS, configuración de bucket y costos desde el día uno, bloqueando el inicio del desarrollo.

---

## Decisión

**Multer local** para desarrollo y staging. **AWS S3** (o compatible) para producción.

El código de almacenamiento está centralizado en `src/common/utils/multer.config.ts`. Cuando se migre a S3, solo ese archivo cambia — los controllers y services no tocan la lógica de almacenamiento.

Archivos estáticos servidos con `useStaticAssets` en `main.ts`:
- `/uploads/` — documentos PDF (contratos, liquidaciones)
- `/storage/` — imágenes de propiedades

---

## Consecuencias

### Positivas (estado actual)

- **Sin dependencias externas para desarrollo:** Cualquier desarrollador puede clonar el repo y levantar el proyecto sin credenciales de AWS.
- **Iteración rápida:** Flujo de subida y visualización de archivos funcional desde el primer sprint.
- **Sin costos:** Apropiado durante el desarrollo y staging.
- **Abstracción preparada:** La configuración en un solo archivo facilita el swap a S3 sin cambios en la lógica de negocio.

### Negativas (estado actual)

- **Sin persistencia en contenedores efímeros:** Si Docker recrea el contenedor sin volumen montado, los archivos subidos se pierden. Mitigado en desarrollo montando un volumen.
- **No escalable horizontalmente:** Con múltiples instancias de la API, cada una tendría su propio disco. Los archivos subidos a una instancia no son visibles desde otra.
- **Sin backup automático:** Los archivos no tienen redundancia. En producción esto es inaceptable.
- **Límite de disco:** El servidor acumula archivos indefinidamente sin política de limpieza.

### Plan de migración a S3

Cuando el sistema pase a producción, ejecutar los siguientes pasos:

**1. Instalar dependencias:**
```bash
npm install @aws-sdk/client-s3 multer-s3
```

**2. Variables de entorno a agregar en `.env`:**
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=365soft-prod
```

**3. Actualizar `multer.config.ts`:**
Reemplazar `diskStorage` por `multer-s3` con el cliente S3. Las URLs de retorno cambiarán de `/storage/archivo.jpg` a `https://bucket.s3.region.amazonaws.com/tenant_slug/archivo.jpg`.

**4. Política de bucket:**
- Imágenes de propiedades (catálogo público): acceso público de lectura.
- Documentos (contratos, comprobantes, identificaciones): privados, URLs pre-firmadas con expiración de 1 hora.

**5. Estructura de carpetas en S3:**
```
365soft-prod/
├── tenant_mi_inmobiliaria/
│   ├── properties/
│   ├── contracts/
│   ├── payments/
│   └── maintenance/
└── tenant_otra_empresa/
    └── ...
```

**6. Eliminar** `useStaticAssets` de `main.ts` una vez migrado.

**7. Migrar archivos existentes** con un script de Node.js que lea `/storage` y `/uploads` y los suba a S3 manteniendo la misma estructura de paths.

---

## Estado

**Aceptado.** Multer local activo en desarrollo y staging. La migración a S3 está planificada para antes del lanzamiento a producción (Fase 3 del roadmap).
