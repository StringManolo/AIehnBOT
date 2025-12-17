# AIehnBOT

Userscript para ejecutar un consumidor de LLM (Ollama) directamente en la interfaz de foro.elhacker.net. El script genera respuestas automáticas basadas en el contexto del hilo utilizando la API de chat del foro.

## Características

* Integración de respuestas generadas por IA (modelo Gemma 3) en los hilos del foro.
* Renderizado de respuestas mediante streaming.
* Soporte para formato Markdown y resaltado de sintaxis para bloques de código.
* Sistema de sanitización de HTML y URLs para seguridad (XSS prevention).
* Panel de configuración integrado en el perfil del usuario.
* Personalización de prompt del sistema, avatar y firma.

## Instalación

1. Instalar un gestor de userscripts en el navegador (Violentmonkey recomendado).
2. Crear un nuevo script.
3. Pegar el contenido de `AIehnBOT_v2.0_Backend_Config.js`.
4. Guardar el script.

Alternativamente, el script está diseñado para funcionar en entornos de servidor local para desarrollo o inyección directa si se dispone de permisos de administración.

## Configuración y Uso

Por defecto, el bot no se ejecuta hasta que es habilitado manualmente por el usuario.

1. Iniciar sesión en foro.elhacker.net.
2. Navegar a **Perfil** (`profile.html`).
3. En el menú lateral, seleccionar la opción **Configurar LLM**.
4. Marcar la casilla **Habilitar Bot**.
5. Ajustar las variables opcionales:
* **Prompt:** Define el comportamiento y personalidad del bot.
* **Imagen del bot:** URL del avatar a mostrar.
* **Firma:** Texto al pie de la respuesta.
* **Scroll Automático:** Desplaza la pantalla hacia la respuesta generada.


6. Pulsar el botón **Guardar**.

Una vez habilitado, el bot leerá el contexto de los temas visitados y generará una respuesta automáticamente al final del hilo.

## Detalles Técnicos

* **Endpoint:** `https://api.elhacker.net/api/chat`
* **Modelo Base:** `gemma3:27b-it-fp16`
* **Almacenamiento:** Utiliza `localStorage` para persistir la configuración del usuario en el navegador.
* **Seguridad:** Implementa validación de IPs privadas y codificación de entidades HTML.
