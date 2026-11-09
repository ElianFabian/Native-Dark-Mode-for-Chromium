# Modo oscuro nativo para Chromium

<img src="extension/icons/icon128.png" width="72" alt="Icono de Modo oscuro nativo, una brocha clara sobre fondo índigo">

[Read in English](README.md)

Usa el modo oscuro integrado en Chromium en las webs y secciones que elijas. Guarda una regla una vez y la extensión la aplicará cuando vuelvas.

La **versión 0.7.0** añade los temas web Oscuro suave y Alto contraste, reglas de dominio y ruta más precisas y confirmaciones de borrado en el popup y el gestor. [Notas de la versión en inglés](docs/RELEASE-0.7.0.md)

Este proyecto se desarrolló con la ayuda de IA mediante OpenAI Codex.

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

Haz clic en una captura para abrirla a resolución completa.

### Panel de la extensión

<a href="docs/screenshots/popup.png"><img src="docs/screenshots/popup.png" width="1200" style="max-width: 100%; height: auto;" alt="Panel con una regla regional de Amazon sin guardar, controles de tamaño del texto y acceso al gestor de reglas"></a>

### Gestor de reglas

<a href="docs/screenshots/rule-manager.png"><img src="docs/screenshots/rule-manager.png" width="1200" style="max-width: 100%; height: auto;" alt="Gestor con editor, búsqueda, orden, estados de las reglas guardadas y copias JSON"></a>

## Usar la extensión

1. Abre una web HTTP o HTTPS y pulsa el icono de la extensión.
2. Para una regla nueva, el popup empieza en **Web completa** y muestra la dirección base del sitio. Elige **Sección por ruta** para usar la ruta de la pestaña actual sin parámetros de consulta ni fragmento. Puedes editar la URL antes de guardar.
3. En **Tema de la web**, elige **Nativo**, **Oscuro suave** o **Alto contraste** y pulsa **Activar y guardar**. La extensión recuerda tu elección para esa web o sección.
4. Pulsa **Desactivar y guardar** para guardar una exclusión, o abre **Gestionar reglas** para editar, buscar o eliminar reglas guardadas.

**Guardar ajustes** guarda el alcance y el tema elegidos, y conserva el estado de la regla si ya existe. Una regla nueva guardada así queda desactivada. En el popup, si cambias una sección guardada a **Web completa** y guardas, la regla del sitio sustituye a la de esa sección.

El icono de papelera junto a **Guardar ajustes** muestra la regla guardada seleccionada para el nombre de host actual y pide confirmación antes de moverla a la **Papelera**. En una regla regional, el icono aparece en el host donde se guardó la regla, incluido su alias `www`. En los demás hosts cubiertos, el popup ofrece una exclusión local. Para las reglas heredadas, el icono queda deshabilitado y su ayuda indica que se pueden eliminar en **Gestionar reglas**.

**Nativo** es el tema predeterminado de las reglas existentes. **Oscuro suave** usa fondos gris carbón y **Alto contraste** resalta el texto, los bordes y los contornos de foco. Los temas se aplican a la web y a los marcos en los que la extensión puede ejecutarse. El cambio de tema de una regla existente se guarda al instante. Para una regla nueva, elige el tema antes de pulsar **Activar y guardar**.

| Opción | Qué cubre |
| --- | --- |
| **Web completa** | El nombre de host indicado en el campo de URL. |
| **Sección por ruta** | Una ruta concreta, como `/articulos`. **Incluir subrutas** está activado por defecto y abarca también rutas como `/articulos/guia`. Desactívalo para que la regla se aplique solo a `/articulos`. |
| **Incluir subdominios** | Nombres como `developer.android.com`. El dominio base y su alias `www` comparten regla con independencia de esta opción. |
| **Incluir dominios regionales** | Varía el sufijo público y conserva el nombre registrado y el subdominio específico. Por ejemplo, `amazon.es` pasa a `amazon.*` y `fonts.google.com` a `fonts.google.*`. |
| **Aplicar a todo …** | Desde un subdominio como `fonts.google.com`, incluye el dominio base `google.com` y todos sus subdominios. Combínalo con los dominios regionales para abarcar la misma familia en otros sufijos públicos reconocidos. Si la página ya hereda una regla activa del dominio base, el popup muestra el interruptor marcado y bloqueado. Usa la acción de exclusión para exceptuar solo el subdominio actual. |

Las rutas más específicas tienen prioridad. Para la misma ruta, un dominio concreto tiene prioridad sobre una regla regional. Si la página hereda una regla activa, el panel puede ofrecer una exclusión para el nombre de host actual y la ruta heredada. Excluir `amazon.es` también excluye `www.amazon.es`.

Para excluir una ruta dentro de una web o sección activa, introduce la URL más específica, elige **Sección por ruta** y pulsa **Guardar ajustes** para crear una regla desactivada. Por ejemplo, una regla desactivada para `example.com/blog/privado` excluye esa ruta y sus subrutas de una regla activa para `example.com/blog`. Si ya hay una regla activa para esa ruta exacta, desactívala desde el listado.

**Gestionar reglas** abre la lista completa en otra pestaña. Puedes buscar y ordenar por nombre o fecha de añadido, en orden ascendente o descendente. **Agrupar por dominio** muestra grupos plegables con el botón **Expandir todos / Contraer todos**. La fecha aparece cuando está guardada en la regla.

**Eliminar** mueve la regla a la **Papelera**, después del listado de reglas guardadas. **Eliminar grupo** pide confirmación antes de mover todas las reglas de un grupo a la papelera, incluidas las ocultas por la búsqueda. Puedes recuperarlas con sus ajustes o elegir **Vaciar papelera** y confirmar el borrado definitivo. Si ya existe una regla para el mismo alcance, la copia eliminada se queda en la papelera al intentar restaurarla.

Con **Exportar configuración de reglas** puedes guardar una copia de las reglas. **Importar configuración de reglas** muestra una vista previa y te permite añadir solo las reglas nuevas, añadirlas y actualizar las coincidencias, o reemplazar toda la lista. El reemplazo muestra una lista desplazable de las reglas que se eliminarán y pide confirmación. La papelera y las preferencias de apariencia se guardan aparte.

La interfaz sigue el idioma del navegador por defecto. En **Idioma** puedes elegir español, inglés, francés, portugués europeo, italiano, chino simplificado, japonés, coreano o alemán.

Usa **A−** y **A+** en la parte superior para ajustar el texto del 75 % al 200 %. Cada vista guarda su propio tamaño de texto. En el panel, abre **Apariencia** para cambiar de tema o activar **Alto contraste**. En el gestor, esos controles están en la barra superior. Ambas vistas comparten el tema y el contraste. El tema sigue al sistema por defecto. El modo oscuro de las webs se controla por separado con las reglas.

## Cómo funciona

La [extensión Manifest V3](extension/manifest.json) tiene un panel, un gestor de reglas y un [servicio en segundo plano](extension/background.js).

1. Cuando una pestaña se carga o cambia de URL, el servicio busca la regla aplicable en `chrome.storage.local`. Para los dominios regionales, usa una copia de la sección ICANN de la [Public Suffix List](https://publicsuffix.org/list/).
2. Si la regla nativa está activa, el [controlador](extension/controller.js) se conecta a la pestaña con `chrome.debugger` y ejecuta `Emulation.setAutoDarkModeOverride`. Chromium se encarga del renderizado y de las imágenes. Los temas personalizados usan un [script de contenido](extension/website-theme.js) que aplica estilos reversibles en cada marco compatible y funciona sin una sesión de depuración.
3. Si la regla deja de aplicarse o se desactiva, el controlador retira el modo oscuro y cierra la conexión. Si cancelas la depuración, la activación automática queda pausada en esa pestaña hasta que pulses **Activar y guardar**.

La extensión usa permisos de depuración para el modo nativo, acceso a sitios HTTP y HTTPS para evaluar las reglas y aplicar los temas personalizados, el permiso `scripting` para aplicar esos temas en pestañas que ya estaban abiertas y almacenamiento para guardar las reglas en el dispositivo. No hace peticiones a servidores externos.

Los temas personalizados conservan los píxeles de imágenes, vídeos y canvas, así como las imágenes de fondo. Oscurecen los degradados CSS claros sin imágenes y aplican el tema a los Shadow DOM que Chromium expone a las extensiones. El texto sobre fotografías y los marcos en los que el navegador impide la inyección pueden conservar el aspecto del sitio. La extensión importa copias en las versiones 1, 2 y 3. Al exportar, usa la versión 3 si alguna regla se limita a una ruta exacta, la 2 si hay temas personalizados y la 1 en los demás casos.

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
