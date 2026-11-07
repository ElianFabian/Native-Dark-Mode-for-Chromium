# Modo oscuro nativo para Chromium

[Read in English](README.md)

Usa el modo oscuro integrado en Chromium en las webs y secciones que elijas. Guarda una regla una vez y la extensión la aplicará cuando vuelvas.

## Instalar la extensión

Solo necesitas un navegador de escritorio basado en Chromium. La extensión se ha probado en Brave. El navegador carga la extensión directamente desde la carpeta descargada, sin necesidad de instalar Node.js, npm o Python.

1. **Descarga y descomprime el proyecto.** En GitHub, pulsa **Code → Download ZIP**. Extrae el ZIP en una carpeta que puedas conservar.
2. **Abre la página de extensiones.** Escribe `brave://extensions` en Brave, `chrome://extensions` en Chrome o Chromium, o `edge://extensions` en Edge.
3. **Carga la carpeta correcta.** Activa **Modo de desarrollador**, pulsa **Cargar descomprimida** (**Load unpacked**) y selecciona la carpeta **`extension`** que hay dentro del proyecto. Es la carpeta que contiene `manifest.json`.
4. **Abre la extensión.** Busca **Modo oscuro nativo** en el menú de extensiones. Puedes fijarla en la barra del navegador.

Para actualizarla, reemplaza los archivos de la carpeta cargada con la nueva versión y pulsa **Recargar** en la ficha de la extensión. Recarga la web si quieres volver a probarla.

## Motivación

Muchas webs carecen de un tema oscuro. En otras hay que activarlo a mano o volver a elegirlo en cada visita. Las extensiones de modo oscuro pueden ayudar, pero su resultado varía de una web a otra. A veces aparecen textos difíciles de leer, contrastes pobres o colores inesperados.

Este proyecto usa el motor de oscurecimiento del propio navegador y recuerda dónde quieres aplicarlo. Puedes activarlo para una web entera y guardar excepciones para un subdominio o una sección concreta.

## Capturas

### Panel de la extensión

![Panel con una regla regional de Amazon, controles de tamaño del texto y acceso al gestor de reglas](docs/screenshots/popup.png)

### Gestor de reglas

![Gestor con editor, búsqueda, orden, estado y fecha de añadido, copias JSON y papelera](docs/screenshots/rule-manager.png)

## Usar la extensión

1. Abre una web HTTP o HTTPS y pulsa el icono de la extensión.
2. Elige **Web completa** o **Sección por ruta**. Puedes ajustar la URL antes de guardar.
3. Pulsa **Activar y guardar**. El navegador aplica su modo oscuro nativo y la extensión recuerda la regla.
4. Pulsa **Desactivar y guardar** para guardar una exclusión, o abre **Gestionar reglas** para editar, buscar o eliminar reglas guardadas.

**Guardar ajustes** guarda el alcance elegido y conserva el estado de la regla si ya existe. Una regla nueva guardada así queda desactivada.

| Opción | Qué cubre |
| --- | --- |
| **Web completa** | El nombre de host indicado en el campo de URL. |
| **Sección por ruta** | Una ruta y sus subrutas. Por ejemplo, `/articulos` incluye `/articulos/guia`. |
| **Incluir subdominios** | Los subdominios del sitio. Con esta opción, `www.android.com` se trata como `android.com` y puede cubrir `developer.android.com`. |
| **Incluir dominios regionales** | El mismo nombre bajo sufijos reconocidos. `amazon.es` pasa a `amazon.*` y puede cubrir `amazon.com.au` y `amazon.co.uk`. Activa también los subdominios para obtener `*.amazon.*`. |

Las rutas más específicas tienen prioridad. Para la misma ruta, un dominio concreto tiene prioridad sobre una regla regional. Si la página hereda una regla activa, el panel puede ofrecer **Excluir este subdominio** o **Excluir este nombre de host** para guardar una excepción.

**Gestionar reglas** abre la lista completa en otra pestaña. Puedes buscar y ordenar por nombre o fecha de añadido, en orden ascendente o descendente. **Agrupar por dominio** muestra grupos plegables con el botón **Expandir todos / Contraer todos**. La fecha aparece cuando está guardada en la regla.

**Eliminar** mueve la regla a la **Papelera**, debajo del editor. Puedes recuperarla con sus ajustes o elegir **Vaciar papelera** y confirmar el borrado definitivo. Si ya existe una regla para el mismo alcance, la copia eliminada se queda en la papelera al intentar restaurarla.

Con **Exportar JSON** puedes guardar una copia de las reglas. **Importar JSON** muestra una vista previa y te permite añadir solo las reglas nuevas, añadirlas y actualizar las coincidencias, o reemplazar toda la lista. El reemplazo muestra cuántas reglas se eliminarán. La papelera y las preferencias de apariencia se guardan aparte.

La interfaz sigue el idioma del navegador por defecto. En **Idioma** puedes elegir español, inglés, francés, portugués europeo, italiano, chino simplificado, japonés, coreano o alemán.

Usa **A−** y **A+** en la parte superior para ajustar el texto del 75 % al 200 %. En el panel, abre **Apariencia** para cambiar de tema o activar **Alto contraste**. En el gestor, esos controles están en la barra superior. El tema sigue al sistema por defecto. Las preferencias se comparten entre ambas vistas. El modo oscuro de las webs se controla por separado con las reglas.

## Cómo funciona

La [extensión Manifest V3](extension/manifest.json) tiene un panel, un gestor de reglas y un [servicio en segundo plano](extension/background.js).

1. Cuando una pestaña se carga o cambia de URL, el servicio busca la regla aplicable en `chrome.storage.local`. Para los dominios regionales, usa una copia de la sección ICANN de la [Public Suffix List](https://publicsuffix.org/list/).
2. Si la regla está activa, el [controlador](extension/controller.js) se conecta a la pestaña con `chrome.debugger` y ejecuta `Emulation.setAutoDarkModeOverride`. Chromium se encarga del renderizado y del tratamiento de las imágenes.
3. Si la regla deja de aplicarse o se desactiva, el controlador retira el modo oscuro y cierra la conexión. Si cancelas la depuración, la activación automática queda pausada en esa pestaña hasta que pulses **Activar y guardar**.

La extensión usa permisos de depuración para enviar ese comando, acceso a sitios HTTP y HTTPS para evaluar las reglas y almacenamiento para guardarlas en el dispositivo. No hace peticiones a servidores externos.

## Acceso directo opcional para ocultar el aviso de depuración

Puedes usar la extensión en cuanto esté cargada. Si el navegador muestra el aviso de depuración y quieres ocultarlo, ejecuta el instalador de tu sistema desde la carpeta del proyecto.

| Sistema | Instalador | Dónde aparece el acceso |
| --- | --- | --- |
| Windows | Haz doble clic en [install-launcher-windows.cmd](scripts/install-launcher-windows.cmd). | Menú Inicio y escritorio. |
| Linux | Ejecuta `sh scripts/install-launcher-linux.sh`. | Menú de aplicaciones y escritorio, si está configurado. El entorno de escritorio puede pedirte que marques el acceso como de confianza. |
| macOS | Ejecuta `sh scripts/install-launcher-macos.command`. | Carpeta `~/Applications` y un enlace en el escritorio, si la carpeta existe. |

1. El instalador busca Brave, Chrome, Chromium, Edge, Vivaldi y Opera. La consola muestra qué accesos crea y dónde. Pulsa **Enter** al terminar.
2. Cierra completamente el navegador y ábrelo desde su nuevo acceso **Nombre del navegador - Native Dark Mode**.

El acceso añade `--silent-debugger-extension-api` al inicio. Si el navegador admite ese parámetro, se ocultan los avisos de todas las extensiones de depuración durante esa sesión. Puedes comprobar que recibió el argumento en la página de versión del navegador, en el campo **Línea de comandos**.

Los instaladores usan herramientas del sistema y muestran mensajes en español o inglés según la configuración regional. Si el navegador está en una ruta personalizada, puedes pasar `--browser "RUTA_ABSOLUTA_AL_EJECUTABLE"`.

El acceso y la supresión del aviso se probaron en **Brave con Windows 11**. Linux y macOS tienen pruebas automatizadas de los archivos generados y siguen pendientes de probarse en esos sistemas. También queda por verificar la supresión del aviso en otros navegadores.

## Límites y desarrollo

- La extensión usa un comando experimental de Chromium. El resultado puede variar según la web y la versión del navegador. Chrome, Edge y otras variantes aún necesitan pruebas de extremo a extremo.
- Las reglas se aplican a webs HTTP y HTTPS. Chromium decide cómo trata las imágenes. La opción nativa de preservarlas está aplazada y documentada en [IMAGE-RESEARCH.md](IMAGE-RESEARCH.md).
- Las instrucciones de desarrollo, pruebas y versiones están en [AGENTS.md](AGENTS.md) y en el [README en inglés](README.md#development-and-screenshots).
