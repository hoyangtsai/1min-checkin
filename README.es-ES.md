# 1min.ai Auto Checkin GitHub Action

Esta es una GitHub Action para el check-in diario automático en 1min.ai, compatible con inicio de sesión por correo electrónico/contraseña y autenticación de dos factores TOTP.

## Características

- 🤖 Check-in diario automático
- 🔐 Soporte para autenticación de dos factores TOTP
- 📊 Visualización de la información del saldo de la cuenta
- ⏰ Tiempo de ejecución personalizable
- 📝 Guardado automático de logs de ejecución

## Inicio Rápido

### 1. Crear un Nuevo Proyecto Usando Esta Plantilla

Haz clic en el botón "Use this template" para crear tu propio proyecto, o haz un fork de este proyecto en tu cuenta de GitHub.

### 2. Configurar GitHub Secrets

En tu proyecto de GitHub, ve a `Settings` > `Secrets and variables` > `Actions`, y añade los siguientes secretos:

**Configuraciones Obligatorias:**
- `EMAIL`: Tu correo electrónico de la cuenta de 1min.ai
- `PASSWORD`: Tu contraseña de la cuenta de 1min.ai

**Configuraciones Opcionales:**
- `TOTP_SECRET`: Tu clave secreta TOTP (solo necesaria si la autenticación de dos factores está habilitada)
- `TELEGRAM_BOT_TOKEN`: Token del bot de Telegram (obtenido a través de [@BotFather](https://t.me/BotFather)) — requerido para notificaciones de Telegram
- `TELEGRAM_CHAT_ID`: ID del chat de Telegram para recibir notificaciones

Si tanto `TELEGRAM_BOT_TOKEN` como `TELEGRAM_CHAT_ID` están configurados, el flujo de trabajo enviará un mensaje formateado en Markdown a ese chat después de cada ejecución: éxito (con saldo + recompensa) o fallo (con error). Si falta alguno de los dos, las notificaciones se omitirán silenciosamente.

### 3. Habilitar GitHub Actions

Asegúrate de que GitHub Actions esté habilitado para tu proyecto. La primera ejecución se iniciará automáticamente.

## Configuración Personalizada

### Modificar la Hora de Ejecución

Edita la expresión cron en el archivo `.github/workflows/daily-checkin.yml`:

```yaml
schedule:
  - cron: '5 8 * * *'  # Daily at UTC 8:05 (Taipei time 16:05)
```

Configuraciones de tiempo comunes:
- `0 0 * * *` - Diariamente a las 0:00 UTC (16:00 tiempo Taipei)
- `0 8 * * *` - Diariamente a las 8:00 UTC (16:00 tiempo Taipei)
- `0 12 * * *` - Diariamente a las 12:00 UTC (20:00 tiempo Taipei)

### Ejecución Manual

También puedes activar la ejecución manualmente en la página de GitHub Actions:
1. Ve a tu proyecto > página de Actions
2. Selecciona el flujo de trabajo "1min.ai Daily Auto Checkin"
3. Haz clic en el botón "Run workflow"

## Pruebas Locales

Si deseas probar el script localmente:

```bash
# Install dependencies
npm install

# Set environment variables
export EMAIL="your-email@example.com"
export PASSWORD="your-password"
export TOTP_SECRET="your-totp-secret"  # Optional

# Run test
npm start
```

## Estructura del Proyecto

```
├── .github/workflows/
│   ├── daily-checkin.yml    # Daily check-in workflow (cron + manual)
│   └── release.yml          # GitHub release on tag push
├── src/
│   ├── index.js             # Main check-in logic (OneMinAutoCheckin class)
│   ├── notifier.js          # Telegram notification sender
│   ├── test.js              # Local live runner
│   └── unit-test.js         # Offline unit tests
├── action.yml               # GitHub Action manifest (Node 24)
├── package.json             # Project configuration file
├── LICENSE                  # MIT License
└── README.md               # Documentation
```

## Requisitos

- Node.js **24** o posterior (Active LTS; coincide con el entorno de ejecución de GitHub Action).

## Notas Importantes

- Asegúrate de que tu cuenta de GitHub tenga suficiente cuota de uso de Actions.
- Revisa regularmente los resultados de la ejecución.
- Si ocurren fallos consecutivos, verifica que las credenciales de la cuenta sean correctas.
- La clave secreta TOTP solo es necesaria cuando la autenticación de dos factores está habilitada.

## Seguridad

- Toda la información sensible se almacena en GitHub Secrets.
- La información completa de cuenta/contraseña no se muestra en los logs.
- Utiliza GitHub Actions oficiales para garantizar la seguridad.

## Resolución de Problemas

### Problemas Comunes

1. **Error de Inicio de Sesión 401 (Login Failed)**
   - Verifica que el EMAIL y PASSWORD sean correctos.
   - Confirma que la cuenta no esté bloqueada.

2. **Fallo de Verificación TOTP**
   - Verifica que el TOTP_SECRET sea correcto.
   - Asegúrate de que la sincronización horaria sea correcta.

3. **GitHub Action No se Ejecuta**
   - Verifica que la expresión cron sea correcta.
   - Confirma que GitHub Actions esté habilitado.

### Ver Logs de Ejecución

1. Ve a tu proyecto > página de Actions.
2. Haz clic en el registro de ejecución más reciente.
3. Visualiza los logs detallados de la ejecución.

## Licencia

Este proyecto está bajo la Licencia MIT; consulta el archivo [LICENSE](LICENSE) para más detalles.
