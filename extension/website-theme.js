(() => {
  // A document can already have the declarative script when it is injected on demand.
  const existingListener = globalThis.nativeDarkModeWebsiteThemeListenerV4;
  if (existingListener && chrome.runtime.onMessage.hasListener(existingListener)) return;
  const previousListener = globalThis.nativeDarkModeWebsiteThemeListenerV3 ??
    globalThis.nativeDarkModeWebsiteThemeListenerV2 ??
    globalThis.nativeDarkModeWebsiteThemeListener;
  if (previousListener && chrome.runtime.onMessage.hasListener(previousListener)) {
    chrome.runtime.onMessage.removeListener(previousListener);
  }

  const palettes = {
    soft: { base: '#252a34', surface: '#303745', raised: '#3b4454', text: '#f0f3f8', link: '#b5dcff',
      border: '#929eaf', accent: '#ffc3d0', badge: '#61243a' },
    contrast: { base: '#080a0e', surface: '#11151d', raised: '#19212d', text: '#ffffff', link: '#c5e5ff',
      border: '#c2ccdc', accent: '#ffd4de', badge: '#54172d' }
  };
  const marker = 'data-native-dark-mode-paint';
  const transitionMarker = 'data-native-dark-mode-transition';
  const sampleMarker = 'data-native-dark-mode-sampling';
  const chromiumProbe = '--native-dark-mode-chromium-active';
  const transitionProbe = '--native-dark-mode-transition-guard';
  // An extension reload can leave its previous sheet in an open document.
  function removePreviousThemeSheets(root) {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(style => {
      const rules = style.cssRules;
      if ([chromiumProbe, transitionProbe].some(probe =>
        rules[0]?.style?.getPropertyValue(probe).trim() === 'yes')) return false;
      const themeSheet = [rules[1], rules[2]].some(rule => rule?.selectorText?.startsWith(`[${marker}~=`));
      return !themeSheet || ![':root', ':root:root'].includes(rules[0]?.selectorText);
    });
  }
  removePreviousThemeSheets(document);
  const marked = new Set();
  const pending = new Set();
  const shadowRoots = new Set();
  const elementColorRules = new Map();
  const authoredPaint = new WeakMap();
  const colorRules = new Map();
  const unusedColorRules = [];
  let sampledElements = new WeakSet();
  const artworkContrast = new WeakMap();
  const staticArtwork = new Map();
  let artworkReadQueue = Promise.resolve();
  const overlayImages = new Map();
  const overlayRequests = new WeakMap();
  const overlayLabels = new WeakMap();
  const overlayAuthoredInk = new WeakMap();
  const raisedLinks = new WeakSet();
  const chromiumColorCache = new Map();
  const paletteTransitionRules = new Map();
  const paletteTransitions = new WeakMap();
  const paletteFades = new WeakMap();
  const paletteRepairs = new WeakMap();
  const palettePaintRules = new Map();
  const paletteLabelRules = new Map();
  const excluded = 'script,style,link,meta,template,noscript';
  const interactive = 'a[href],button,[role="button"],[role="link"],[role="tab"]';
  const buttonInput = 'input:is([type="button"],[type="submit"],[type="reset"])';
  const actionButton = `button,[role="button"],${buttonInput}`;
  const textInput = 'input:not([type]),input[type="text"],input[type="search"],textarea';
  const heading = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  const borderEdges = ['Top', 'Right', 'Bottom', 'Left'];

  function paintedBorderSides(style) {
    return borderEdges.filter(side => parseFloat(style[`border${side}Width`]) > 0 &&
      chromiumSrgb(style[`border${side}Color`])?.[3] !== 0);
  }

  function hasPaintedOutline(style) {
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 &&
      chromiumSrgb(style.outlineColor)?.[3] !== 0;
  }

  function carouselDirection(element) {
    if (!element.matches(interactive) || element.childElementCount || element.textContent.trim() ||
        element.matches(':disabled,[aria-disabled="true"]') ||
        !/\b(?:carousel|carrusel|slides?|diapositivas?)\b/i.test(element.getAttribute('aria-label') ?? '')) return null;
    const direction = /(?:^|[-_])(right|left|next|prev)(?:[-_]|$)/i.exec(element.className)?.[1].toLowerCase();
    if (!direction) return null;
    return direction === 'right' || direction === 'next' ? 'right' : 'left';
  }

  function carouselArrow(direction, ink = 'white') {
    const angle = direction === 'right' ? 45 : 225;
    return `content: "" !important; display: block !important; position: absolute !important;
      inset: 50% auto auto 50% !important; width: .55em !important; height: .55em !important;
      box-sizing: border-box !important; margin: 0 !important; padding: 0 !important; background: none !important;
      border: 0 solid ${ink} !important; border-width: 2px 2px 0 0 !important; border-radius: 0 !important;
      -webkit-mask: none !important; mask: none !important; clip-path: none !important;
      opacity: 1 !important; visibility: visible !important; z-index: 1 !important;
      filter: drop-shadow(0 0 1px ${ink === 'white' ? 'black' : 'white'}) !important;
      transform: translate(-50%, -50%) rotate(${angle}deg) !important; pointer-events: none !important;`;
  }
  let preset;
  let sheet;
  let transitionSheet;
  let observer;
  let idleBatch;
  let chromiumRefreshTimer;
  let viewportFrame;
  let viewportRequested = false;
  let viewportNeedsResample = false;
  let viewportLookahead = false;
  let viewportPreloadAfter = false;
  let horizontalScrollTimer;
  const scrollOffsets = new WeakMap();
  const dirtySurfaces = new Set();
  const hoverTargets = new Set();
  let hoverFrame;
  let elements;
  let revision = 0;
  let emphasizeSeparators = false;
  const separatorLevels = {
    'very-low': { minimum: 1.65, opacity: .3, edgeWidth: 1 },
    low: { minimum: 2.5, opacity: .46, edgeWidth: 1 },
    true: { minimum: 3.7, opacity: .64, edgeWidth: 1 },
    high: { minimum: 5.3, opacity: .82, edgeWidth: 1 },
    maximum: { minimum: 8, opacity: 1, edgeWidth: 2 }
  };

  function paletteCSS(colors) {
    const selector = role => `[${marker}~="${role}"]:not(#native-dark-mode-priority#native-dark-mode-priority)`;
    const paint = (role, declaration) => `${selector(role)} { ${declaration} !important; }`;
    const backdrop = color => `--native-dark-mode-backdrop-rgb: ${color.slice(1).match(/../g)
      .map(channel => parseInt(channel, 16)).join(' ')}`;
    const level = separatorLevels[emphasizeSeparators];
    const separatorColor = level && `color-mix(in srgb, white ${level.opacity * 100}%, ${colors.surface})`;
    const contrastControls = [
      // Headings need a readable color as soon as the palette darkens their container.
      `:is(${heading}):not([${sampleMarker}],#native-dark-mode-priority#native-dark-mode-priority) { color: ${colors.text} !important; }`,
      `${selector('text')}:is(input, textarea):not(:disabled)::placeholder { color: ${colors.border} !important; opacity: 1 !important; }`,
      paint('icon-light', 'filter: brightness(0) invert(1)')
    ];
    return [
      `:root:root { color-scheme: dark !important; background-color: ${colors.base} !important; color: ${colors.text} !important; ${backdrop(colors.base)} !important; }`,
      `:root body { background-color: ${colors.surface} !important; ${backdrop(colors.surface)} !important; }`,
      paint('surface', `background-color: ${colors.surface} !important; ${backdrop(colors.surface)}`),
      paint('raised', `background-color: ${colors.raised} !important; ${backdrop(colors.raised)}`),
      paint('gradient', 'background-image: none'),
      paint('gradient', `background-color: ${colors.surface} !important; ${backdrop(colors.surface)}`),
      paint('backdrop-shadow', 'box-shadow: none'),
      `${selector('gradient')} :where(h1, h2, h3, h4, h5, h6) { color: ${colors.text} !important; }`,
      ...contrastControls,
      paint('text', `color: ${colors.text}`),
      paint('link', `color: ${colors.link}`),
      paint('text-fill', `-webkit-text-fill-color: ${colors.text}`),
      paint('link-fill', `-webkit-text-fill-color: ${colors.link}`),
      paint('badge', `background-color: ${colors.badge}`),
      paint('accent', `color: ${colors.accent}`),
      paint('accent', `-webkit-text-fill-color: ${colors.accent}`),
      paint('readable-light', `-webkit-text-fill-color: ${colors.text}`),
      paint('readable-dark', '-webkit-text-fill-color: #080a0e'),
      `${selector('white-card-label')}, ${selector('white-card-label')} * {
        color: white !important; -webkit-text-fill-color: white !important;
      }`,
      paint('heading-backdrop', `background-color: ${colors.base}`),
      paint('breadcrumb-backdrop', `background-color: ${colors.base} !important; ${backdrop(colors.base)}`),
      paint('canvas-image', 'background-blend-mode: multiply'),
      paint('decorative-background', 'filter: brightness(.18)'),
      ...['before', 'after'].map(pseudo =>
        `${selector(`decorative-${pseudo}`)}::${pseudo} { filter: brightness(.18) !important; }`),
      paint('card-raised', `background-color: ${colors.raised} !important; ${backdrop(colors.raised)}`),
      paint('card-recessed', `background-color: ${colors.base} !important; ${backdrop(colors.base)}`),
      `${selector('card-edge')}:not(:focus-visible) { outline: 1px solid color-mix(in srgb, ${colors.border} 65%, ${colors.surface}) !important; outline-offset: -1px !important; }`,
      paint('isolated-label', 'mix-blend-mode: normal'),
      paint('undimmed-label', 'filter: none'),
      ...borderEdges.map(side => paint(`border-${side.toLowerCase()}`, `border-${side.toLowerCase()}-color: ${colors.border}`)),
      ...(level ? [
        ...['top', 'right', 'bottom', 'left'].map(side => paint(`separator-${side}`, `border-${side}-color: ${separatorColor}`)),
        `${selector('card-outline')}:not(:focus-visible) { outline: ${level.edgeWidth}px solid ${separatorColor} !important; outline-offset: -${level.edgeWidth}px !important; }`
      ] : []),
      paint('icon-mask-light', 'background-color: white'),
      paint('photo', 'mix-blend-mode: normal'),
      paint('carousel-position', 'position: relative'),
      paint('carousel-sprite', 'background-image: none'),
      `${selector('carousel-right')}::after { ${carouselArrow('right')} }`,
      `${selector('carousel-left')}::after { ${carouselArrow('left')} }`,
      paint('pagination-dot', 'background-color: transparent !important; color: transparent !important; -webkit-text-fill-color: transparent'),
      paint('pagination-position', 'position: relative'),
      `${selector('pagination-dot')}::before {
        content: "" !important; display: block !important; position: absolute !important;
        inset: 50% auto auto 50% !important; width: 10px !important; height: 10px !important;
        transform: translate(-50%, -50%) !important; margin: 0 !important; border: 0 !important;
        border-radius: 50% !important; background: ${colors.border} !important;
        opacity: 1 !important; pointer-events: none !important;
      }`,
      `${selector('pagination-current')}::before {
        background: #ff5967 !important;
      }`,
      paint('pagination-own-dot', `background-color: ${colors.border} !important; color: transparent !important;
        opacity: 1 !important; -webkit-text-fill-color: transparent`),
      paint('pagination-own-current', 'background-color: #ff5967'),
      `${selector('pagination-dot')}::after { content: none !important; }`,
      `:root :focus-visible { outline: 2px solid ${colors.link} !important; outline-offset: 2px; }`
    ].join('\n');
  }

  function isLightColor([, red, green, blue, alpha = 1]) {
    return Number(alpha) > .2 && red * .213 + green * .715 + blue * .072 > 150;
  }

  function paletteFade(image) {
    const stops = [...image.matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g)];
    if (!stops.some(stop => Number(stop[4]) < 1)) return null;
    // Preserve the gradient geometry and opacity while matching the themed backdrop.
    return image.replace(/rgba?\(\d+, \d+, \d+(?:, ([\d.]+))?\)/g,
      (_, alpha = 1) => `rgb(var(--native-dark-mode-backdrop-rgb) / ${alpha})`);
  }

  const backdropShadowPattern = /(?:^|,\s*)rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\) 0px 0px 0px ([\d.]+)px(?=,|$)/g;

  function paginationDotRoles(element, style) {
    if (!element.matches('li > button') || !/^\d+$/.test(element.textContent.trim()) ||
        (style.fontSize !== '0px' && chromiumSrgb(style.color)?.[3] !== 0)) return '';
    const item = element.parentElement;
    const list = item.parentElement;
    if (!list?.matches('ul,ol,[role="list"]') || list.childElementCount < 2) return '';
    const dot = getComputedStyle(element, '::before');
    const circle = dot.content === '""' && parseFloat(dot.borderTopLeftRadius) > 0 &&
      parseFloat(dot.width) > 0 && dot.width === dot.height;
    const ownCircle = ['none', 'normal'].includes(dot.content) && style.backgroundImage === 'none' &&
      style.maskImage === 'none' && parseFloat(style.width) > 0 && parseFloat(style.width) <= 20 &&
      style.width === style.height && parseFloat(style.borderTopLeftRadius) >= parseFloat(style.width) / 2 &&
      chromiumSrgb(style.backgroundColor)?.[3] > 0;
    if (!ownCircle && !circle && !/^["'][•●○◦]["']$/.test(dot.content)) return '';
    const selected = '[aria-current]:not([aria-current="false"]),[aria-selected="true"]';
    const paint = ownCircle ? style : dot;
    const ink = chromiumSrgb(ownCircle || circle ? paint.backgroundColor : paint.color);
    const accent = color => color && Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 45;
    const stronger = [...list.children].some(peer => {
      const button = peer.firstElementChild;
      if (peer === item || !button?.matches('button')) return false;
      const other = getComputedStyle(button, ownCircle ? null : '::before');
      return Number(other.opacity) < Number(paint.opacity) ||
        (accent(ink) && !accent(chromiumSrgb(ownCircle || circle ? other.backgroundColor : other.color)));
    });
    const current = element.matches(selected) || item.matches(selected) || stronger;
    if (ownCircle) return `pagination-own-dot${current ? ' pagination-own-current' : ''}`;
    return `pagination-dot${style.position === 'static' ? ' pagination-position' : ''}${current ? ' pagination-current' : ''}`;
  }

  function isRedAccent(color) {
    const match = color.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
    if (!match) return false;
    const [, red, green, blue, alpha = 1] = match;
    return Number(alpha) > .65 && Number(red) >= 100 && red - Math.max(green, blue) >= 65;
  }

  function rolesFor(element, switchingRenderer) {
    if (element instanceof SVGSVGElement) {
      if (isDecorativeBackground(element, getComputedStyle(element))) return 'decorative-background';
      return svgControlContext(element) ? 'control-icon' : '';
    }
    if (!(element instanceof HTMLElement) || element.matches(excluded)) return '';
    const style = getComputedStyle(element);
    paletteRepairs.delete(element);
    paletteFades.delete(element);
    const pagination = paginationDotRoles(element, style);
    if (pagination) return pagination;
    const raised = trackRaisedLink(element, style);
    const original = switchingRenderer || raised ? originalTransitionColors(element, style) : style;
    const backgroundColor = original.backgroundColor ?? style.backgroundColor;
    const foreground = element.closest('a[href]') ? 'link' : 'text';
    const roles = [foreground];
    const imageLabel = Array.prototype.some.call(element.childNodes, textNode) &&
      imageLabelPaint(element, style, preset === 'contrast' ? 7 : 4.5);
    if (imageLabel) roles.push('image-label');
    if (style.webkitTextFillColor !== 'rgba(0, 0, 0, 0)' &&
        (style.webkitTextFillColor !== style.color || element.style.getPropertyPriority('color') === 'important')) {
      roles.push(`${foreground}-fill`);
    }
    const image = style.backgroundImage;
    const svgBackground = paleSvgBackground(image);
    if (!svgBackground && image.startsWith('url(') && isDecorativeBackground(element, style)) return 'decorative-background';
    for (const pseudo of decorativePseudos(element, style)) roles.push(`decorative-${pseudo.slice(2)}`);
    if (!svgBackground && (element === document.documentElement || element === document.body) &&
        /(?:url|image-set)\(/i.test(image)) roles.push('canvas-image');
    const solid = image === 'none' ? srgb(backgroundColor) : null;
    const coloredControl = solid && solid[3] >= .75 &&
      Math.max(...solid.slice(0, 3)) - Math.min(...solid.slice(0, 3)) >= 45 &&
      element.closest(interactive);
    if (coloredControl === element && element.matches('a[href]:not([aria-disabled="true"])') &&
        element.textContent.trim().length <= 80) {
      // Match a text-only tile, allowing single-child wrappers around its label.
      let label = element;
      let labelStyle = style;
      while (label.childElementCount === 1 && label.textContent.trim() === label.firstElementChild.textContent.trim()) {
        label = label.firstElementChild;
        labelStyle = getComputedStyle(label);
        if (labelStyle.backgroundImage !== 'none' || chromiumSrgb(labelStyle.backgroundColor)?.[3] !== 0) break;
      }
      if (label instanceof HTMLElement && !label.childElementCount && label.textContent.trim()) {
        const ink = chromiumSrgb(labelStyle.webkitTextFillColor);
        if ((label === element || (labelStyle.backgroundImage === 'none' &&
            chromiumSrgb(labelStyle.backgroundColor)?.[3] === 0)) &&
            ink?.[3] === 1 && ink.slice(0, 3).every(channel => channel >= 245)) roles.push('light-card-label');
      }
    }
    if (svgBackground) paletteFades.set(element, svgBackground.image);
    else if (image.includes('gradient(') && !/(?:url|image-set|cross-fade|image|paint|element)\(/i.test(image) &&
        [...image.matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g)].some(isLightColor)) {
      const fade = paletteFade(image);
      if (fade) paletteFades.set(element, fade);
      else roles.push('gradient');
    }
    // A wide, unblurred outer shadow can act as a separate page background.
    const backdropShadows = style.boxShadow.matchAll(backdropShadowPattern);
    if ([...backdropShadows].some(shadow => Number(shadow[5]) >= 24 && isLightColor(shadow))) {
      roles.push('backdrop-shadow');
    }
    const background = backgroundColor.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
    if (!coloredControl && element !== document.documentElement && background && Number(background[4] ?? 1) > 0.05) {
      const lightness = Number(background[1]) * .213 + Number(background[2]) * .715 + Number(background[3]) * .072;
      roles.push(lightness > 180 ? 'surface' : 'raised');
    } else if (!background && backgroundColor && !/\/\s*0(?:\.0+)?%?\s*\)$/.test(backgroundColor)) {
      // Wide-gamut colors can be serialized as color(), lab(), or oklch().
      roles.push('surface');
    }
    const borderSides = paintedBorderSides(style);
    if (emphasizeSeparators && raised && !borderSides.length &&
        style.borderImageSource === 'none' && !hasPaintedOutline(style)) roles.push('raised-link');
    const pseudoPaint = decorativeSolidPaint(element, style);
    if (isHeadingBackground(element) || isShallowDivider(element)) pseudoPaint.push(...headingPseudoGradients(element));
    let artworkPaint = '';
    const colors = palettes[preset];
    const surface = roles.includes('surface') ? colors.surface : roles.includes('raised') ? colors.raised : null;
    const ink = surface?.slice(1).match(/../g).map(channel => parseInt(channel, 16));
    const darkened = ink && [...ink, 1];
    const boxBorder = authoredFrameBorder(element, style, darkened);
    if (boxBorder) pseudoPaint.push([':not(:focus-visible)', boxBorder]);
    if (darkened && element.matches('span,small,label,[role="status"]')) {
      pseudoPaint.push(...labelPseudoSurfaces(element, chromiumSrgb(backgroundColor), darkened));
    }
    if (element instanceof HTMLImageElement || element.firstElementChild instanceof HTMLImageElement) {
      const { backing, filter } = artworkRepair(element, style, chromiumSrgb(backgroundColor), darkened);
      if (backing) artworkPaint += `background-color: ${rgba(backing)} !important;`;
      if (filter) artworkPaint += `filter: ${filter} !important;`;
    }
    if (imageLabel || artworkPaint || pseudoPaint.length) {
      paletteRepairs.set(element, [(imageLabel || '') + artworkPaint, pseudoPaint]);
    }
    if (solid?.[3] >= .75 && !coloredControl &&
        element.matches('article,aside,div,section,li,td') && !element.closest(`${interactive},[role="tablist"]`) &&
        (style.boxShadow !== 'none' || (parseFloat(style.borderTopLeftRadius) >= 4 && parseFloat(style.paddingTop) >= 6))) {
      roles.push('card');
      if (!borderSides.length && style.borderImageSource === 'none' && !hasPaintedOutline(style)) roles.push('card-outline');
    }
    if (image === 'none' && element.matches('.breadcrumb, [itemtype$="/BreadcrumbList"], nav[aria-label="breadcrumb" i]')) {
      roles.push('breadcrumb');
    }
    if (element.matches('span, div, small, strong, b, mark, label, [role="status"]') &&
        element.textContent.length <= 80 && element.textContent.trim() &&
        !element.closest('[disabled], [aria-disabled="true"]') &&
        !element.querySelector('img, svg, video, canvas')) {
      const badge = isRedAccent(backgroundColor);
      if (badge || isRedAccent(style.color)) roles.push('accent');
      if (badge && !coloredControl) roles.push('badge');
    }
    // Blending affects the entire rendered group, including nested labels.
    if (['multiply', 'darken', 'color-burn'].includes(style.mixBlendMode) &&
        element.textContent.trim() && !element.closest('[disabled], [aria-disabled="true"]')) {
      roles.push('isolated-label');
    }
    const brightness = /^brightness\(([\d.]+)\)$/.exec(style.filter);
    if (brightness && Number(brightness[1]) < .8 && element.textContent.trim() &&
        !element.closest('[disabled], [aria-disabled="true"]') &&
        !element.querySelector('img, svg, video, canvas') && image === 'none') {
      roles.push('undimmed-label');
    }
    if (element.matches('img') && style.mixBlendMode === 'multiply') roles.push('photo');
    if (borderSides.length) {
      for (const side of borderSides) roles.push(`border-${side.toLowerCase()}`);
      if (!element.closest(interactive) && !element.matches('input,select,textarea')) {
        for (const side of borderSides) {
          if (style[`border${side}Style`] === 'solid' && parseFloat(style[`border${side}Width`]) <= 2 &&
              chromiumSrgb(style[`border${side}Color`])?.[3]) roles.push(`separator-${side.toLowerCase()}`);
        }
      }
    }
    const paintsBackground = element === document.documentElement || element === document.body ||
      roles.some(role => ['surface', 'raised', 'gradient', 'badge'].includes(role));
    const properties = paintsBackground || imageLabel || raised ? ['color', 'background-color'] : ['color'];
    if (paletteFades.has(element)) properties.push('background-image');
    const transition = paintTransition(element, style, properties);
    if (transition) paletteTransitions.set(element, transition);
    return roles.join(' ');
  }

  function inspect(element, backdrops, switchingRenderer = false) {
    if (element instanceof HTMLElement || element instanceof SVGSVGElement) {
      const style = getComputedStyle(element);
      authoredPaint.set(element, {
        color: style.color, webkitTextFillColor: style.webkitTextFillColor,
        backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
        backgroundBlendMode: style.backgroundBlendMode, backgroundRepeat: style.backgroundRepeat,
        backgroundSize: style.backgroundSize, cursor: style.cursor,
        ...(labeledPointerControl(element, style) &&
          (style.backgroundImage !== 'none' || borderEdges.some(side => parseFloat(style[`border${side}Width`]) > 0)) ?
          Object.fromEntries(borderEdges.flatMap(side => ['Color', 'Style', 'Width'].map(property =>
            [`border${side}${property}`, style[`border${side}${property}`]]))) : {})
      });
    }
    const root = element.shadowRoot ?? (element instanceof HTMLElement
      ? chrome.dom?.openOrClosedShadowRoot(element) : null);
    if (root && !shadowRoots.has(root)) {
      shadowRoots.add(root);
      removePreviousThemeSheets(root);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      if (transitionSheet) root.adoptedStyleSheets = [...root.adoptedStyleSheets, transitionSheet];
      observer.observe(root, preset === 'chromium' ? chromiumObservationOptions : observationOptions);
      schedule(root);
    } else if (root && preset === 'chromium') {
      // A host's style can change inherited colors inside an existing shadow tree.
      schedule(root);
    }
    sampledElements.add(element);
    return preset === 'chromium' ? chromiumColors(element, backdrops, switchingRenderer) :
      rolesFor(element, switchingRenderer);
  }

  const rgba = ([r, g, b, alpha]) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

  function chromiumColor(color, role) {
    const key = `${role}:${color.join(',')}`;
    if (chromiumColorCache.has(key)) return chromiumColorCache.get(key);
    const result = globalThis.nativeDarkModeChromiumColor(color, role);
    if (chromiumColorCache.size >= 512) chromiumColorCache.clear();
    chromiumColorCache.set(key, result);
    return result;
  }

  function isHeadingBackground(element) {
    if (element.matches(heading)) return true;
    for (let wrapper = element, depth = 0; wrapper && depth < 3; wrapper = wrapper.firstElementChild, depth++) {
      if (wrapper.childElementCount > 6) return false;
      if (Array.prototype.some.call(wrapper.children, child => child.matches(heading))) return true;
    }
    return false;
  }

  const gradientStop = /(?:rgba?|color|hsla?|hwb|oklab|oklch|lab|lch)\([^()]*\)/g;
  const gradientFunction = /^(?:(?:-webkit-)?(?:repeating-)?(?:linear|radial|conic)-gradient|rgba?|color|hsla?|hwb|oklab|oklch|lab|lch|calc)$/;
  let gradientColorContext;

  function gradientColor(value, allowConversion) {
    const color = chromiumSrgb(value);
    if (color || !allowConversion || !CSS.supports('color', value)) return color;
    gradientColorContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!gradientColorContext) return null;
    const context = gradientColorContext;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, alpha / 255];
  }

  function chromiumGradient(style, headingBackground = false) {
    const image = style.backgroundImage;
    if (!image.includes('gradient(')) return null;
    if (!headingBackground && style.backgroundBlendMode.split(', ').includes('multiply')) return null;
    const functions = image.match(/[\w-]+(?=\()/g);
    if (functions.some(name => !gradientFunction.test(name))) return null;
    if (headingBackground && ![...image.matchAll(gradientStop)].some(([stop]) => {
      const color = gradientColor(stop, true);
      return color?.[3] && Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 24 &&
        chromiumColor(color, 'background');
    })) return null;
    let changed = false;
    let safe = true;
    const result = image.replace(gradientStop, value => {
      const color = gradientColor(value, headingBackground);
      if (!color) {
        safe = false;
        return value;
      }
      const [r, g, b, alpha] = color;
      if (!alpha) return value;
      const brightest = Math.max(r, g, b);
      let transformed = chromiumColor(color, 'background');
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const pale = chroma <= 60 && Boolean(transformed) && Math.min(r, g, b) >= 190;
      if (headingBackground && chroma > 24 && !pale) return value;
      if ((chroma > 24 && !pale) || (!headingBackground && !transformed && brightest >= 150)) {
        safe = false;
        return value;
      }
      if (headingBackground && !transformed && brightest > 64) transformed = [64, 64, 64, alpha];
      if (!transformed) return value;
      changed = true;
      return rgba(transformed);
    });
    return safe && changed ? result : null;
  }

  const svgBackgrounds = new Map();
  function paleSvgBackground(image) {
    const match = /^url\("data:image\/svg\+xml,([^"]+)"\)$/i.exec(image);
    if (!match || match[1].length > 12000) return null;
    if (svgBackgrounds.has(image)) return svgBackgrounds.get(image);
    let svg;
    try { svg = decodeURIComponent(match[1]); } catch { return null; }
    const width = Number(/^<svg\b[^>]*\bwidth=['"](\d+)['"]/i.exec(svg)?.[1]);
    const height = Number(/^<svg\b[^>]*\bheight=['"](\d+)['"]/i.exec(svg)?.[1]);
    if (!(width >= 360 && height >= 160) || /<(?!\/?(?:svg|path|defs|linearGradient|radialGradient|stop)\b)/i.test(svg)) return null;
    let backdrop;
    let valid = true;
    const transformed = svg.replace(/\bstop-color=(['"])#([\da-f]{6})\1/gi, (whole, quote, hex) => {
      const ink = [...hex.matchAll(/../g)].map(([channel]) => parseInt(channel, 16));
      if (Math.min(...ink) < 190 || Math.max(...ink) - Math.min(...ink) > 60) {
        valid = false;
        return whole;
      }
      const color = chromiumColor([...ink, 1], 'background');
      if (!color) {
        valid = false;
        return whole;
      }
      if (!backdrop || luminance(color) > luminance(backdrop)) backdrop = color;
      return `stop-color=${quote}rgb(${color.slice(0, 3).join(',')})${quote}`;
    });
    const result = valid && backdrop ? {
      image: `url("data:image/svg+xml,${encodeURIComponent(transformed)}")`, backdrop
    } : null;
    if (svgBackgrounds.size >= 32) svgBackgrounds.clear();
    svgBackgrounds.set(image, result);
    return result;
  }

  const svgGlyphs = new Map();
  const externalSvgGlyphs = new Map();
  const svgPaint = /\b(fill|stroke)\s*=\s*(['"])([^'"]+)\2/gi;

  function backgroundSvgGlyph(style, boundedBox = false, twoTone = false) {
    const image = style.backgroundImage;
    if (style.backgroundRepeat !== 'no-repeat' ||
        (!(boundedBox && ['contain', 'cover'].includes(style.backgroundSize)) &&
          (!/^(?:auto|\d+(?:\.\d+)?px)(?: (?:auto|\d+(?:\.\d+)?px))?$/.test(style.backgroundSize) ||
            style.backgroundSize.split(' ').some(size => parseFloat(size) > 48)))) return null;
    const match = /^url\("data:image\/svg\+xml,((?:\\.|[^"\\])+)"\)$/i.exec(image);
    if (!match || match[1].length > 4096) return null;
    const key = `${image}|${twoTone}`;
    if (svgGlyphs.has(key)) return svgGlyphs.get(key);
    let svg;
    try { svg = decodeURIComponent(match[1].replace(/\\(["\\])/g, '$1')); } catch { return null; }
    const root = /^<svg\b[^>]*>/i.exec(svg)?.[0];
    const width = Number(/\bwidth=['"](\d+)['"]/i.exec(root)?.[1]);
    const height = Number(/\bheight=['"](\d+)['"]/i.exec(root)?.[1]);
    let glyph = null;
    const explicitFill = /\bfill\s*=/.test(root) ||
      [...svg.matchAll(/<(?:path|circle|ellipse|line|polygon|polyline|rect)\b[^>]*>/gi)]
        .every(([shape]) => /\bfill\s*=/.test(shape));
    if (width > 0 && height > 0 && Math.max(width, height) <= 48 && explicitFill &&
        !/<(?!\/?(?:svg|g|path|circle|ellipse|line|polygon|polyline|rect)\b)|\b(?:style|class|href|opacity|fill-opacity|stroke-opacity)\s*=/i.test(svg)) {
      const paints = [...svg.matchAll(svgPaint)].map(([, , , value]) => value).filter(value => value !== 'none');
      const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(paints[0]);
      const ink = hex ? [...hex.slice(1).map(channel => parseInt(channel, 16)), 1] :
        paints.length && gradientColor(paints[0], true);
      const inks = paints.map(value => /^#[\da-f]{6}$/i.test(value) ?
        [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)).concat(1) : gradientColor(value, true));
      const multi = twoTone && new Set(paints).size <= 2 && inks.every(color => color?.[3] === 1);
      if (ink?.[3] === 1 && (paints.every(value => value === paints[0]) || multi)) glyph = { svg, ink, multi };
    }
    if (svgGlyphs.size >= 128) svgGlyphs.clear();
    svgGlyphs.set(key, glyph);
    return glyph;
  }

  function labeledPointerControl(element, style = getComputedStyle(element)) {
    return element.matches(interactive) ||
      (element instanceof HTMLAnchorElement && style.cursor === 'pointer' && Boolean(element.textContent.trim()));
  }

  function labeledGlyphHost(element, style) {
    return labeledPointerControl(element, style) || (element.matches('li') &&
      Boolean(element.closest('.breadcrumb,[itemtype$="/BreadcrumbList"],nav[aria-label="breadcrumb" i]')));
  }

  function elementBackgroundGlyph(element, style) {
    if (!style.backgroundImage.startsWith('url("data:image/svg+xml,')) return null;
    const glyph = backgroundSvgGlyph(style);
    if (glyph || !labeledPointerControl(element, style)) return glyph;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && Math.max(box.width, box.height) <= 48 ?
      backgroundSvgGlyph(style, true, true) : null;
  }

  function wrappedBackgroundGlyphLabel(element, style) {
    if (!style.backgroundImage.startsWith('url("data:image/svg+xml,')) return false;
    // A compact background glyph can label a paragraph inside a plain wrapper,
    // rather than a direct text node or an interactive control.
    for (let label = element, depth = 0; depth < 3; depth++) {
      if (label.childElementCount !== 1) return false;
      label = label.firstElementChild;
      if (!(label instanceof HTMLElement) || label.matches('img,picture,video,canvas,input,select,textarea,button')) return false;
      if (Array.prototype.some.call(label.childNodes, textNode)) return label.textContent.trim().length <= 160;
    }
    return false;
  }

  function contrastingGlyphInk(original, backdrop, minimum, preferNative = false) {
    if (!original || !backdrop) return null;
    const ink = readableColor(original, backdrop, minimum);
    if (!ink) return null;
    if (luminance(backdrop) < .18 &&
        (preferNative || Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) > 24)) {
      const nativeInk = chromiumColor(original, 'foreground');
      if (nativeInk) return readableColor(nativeInk, backdrop, minimum) ?? nativeInk;
    }
    return ink;
  }

  function externalSvgGlyph(element, style) {
    if (!element.matches(`${interactive}`) || !element.hasAttribute('aria-label') ||
        element.childElementCount || element.textContent.trim() || element.matches(':disabled,[aria-disabled="true"]') ||
        chromiumSrgb(style.backgroundColor)?.[3] !== 0) return null;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || Math.max(box.width, box.height) > 48) return null;
    const match = /^url\("(https?:[^"\\]+\.svg(?:\?[^"\\]*)?)"\)$/i.exec(style.backgroundImage);
    if (!match) return null;
    const source = match[1];
    let entry = externalSvgGlyphs.get(source);
    if (!entry) {
      if (externalSvgGlyphs.size >= 128) return null;
      entry = { glyph: null, users: new Set(), done: false };
      externalSvgGlyphs.set(source, entry);
      void readImageResource(source, 'cors').then(resource => {
        if (resource?.type === 'image/svg+xml' && resource.data.length <= 4096) {
          const svg = new TextDecoder().decode(resource.data).trim();
          const glyph = backgroundSvgGlyph({ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
            backgroundRepeat: 'no-repeat', backgroundSize: 'auto' });
          if (glyph) entry.glyph = { ...glyph, external: true };
        }
        entry.done = true;
        for (const user of entry.users) {
          if (entry.glyph && preset && user.isConnected) scheduleDirtySurface(user);
        }
        entry.users.clear();
      });
    }
    if (!entry.done) entry.users.add(element);
    return entry.glyph;
  }

  function contrastingSvgBackground(glyph, backdrop, minimum, preferNative = false) {
    if (!glyph || !backdrop) return null;
    let changed = false;
    const svg = glyph.svg.replace(svgPaint, (whole, property, quote, paint) => {
      if (paint === 'none') return whole;
      const original = glyph.multi ? (/^#[\da-f]{6}$/i.test(paint) ?
        [1, 3, 5].map(index => parseInt(paint.slice(index, index + 2), 16)).concat(1) : gradientColor(paint, true)) : glyph.ink;
      const ink = contrastingGlyphInk(original, backdrop, minimum, preferNative);
      if (!ink) return whole;
      changed = true;
      return `${property}=${quote}rgb(${ink.slice(0, 3).join(',')})${quote}`;
    });
    if (!changed) return null;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function isDecorativeBackground(element, style) {
    if (style.filter !== 'none' || (style.pointerEvents !== 'none' && element.getAttribute('aria-hidden') !== 'true') ||
        element.closest(interactive)) return false;
    const layer = ['absolute', 'fixed'].includes(style.position) ? element : element.parentElement;
    if (!layer || (layer !== element && !['absolute', 'fixed'].includes(getComputedStyle(layer).position))) return false;
    const { width, height } = element.getBoundingClientRect();
    if (width < 360 || height < 160) return false;
    if (element instanceof SVGSVGElement) {
      if (element.querySelector('a,button,image,use,foreignObject,text,[tabindex]')) return false;
      return Array.prototype.some.call(element.querySelectorAll('stop,path,rect,circle,ellipse,polygon'), shape => {
        const paint = getComputedStyle(shape);
        const color = chromiumSrgb(shape.localName === 'stop' ? paint.stopColor : paint.fill);
        return color?.[3] > .2 && luminance(color) > .6;
      });
    }
    return !element.childElementCount && !element.textContent.trim();
  }

  function headingPseudoGradients(element) {
    const fixes = [];
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (style.content === 'none' || style.content === 'normal') continue;
      const gradient = chromiumGradient(style, true);
      const color = chromiumSrgb(style.backgroundColor);
      const surface = color?.[3] && chromiumColor(color, 'background');
      const gradientMask = style.content === '""' && style.backgroundImage === 'none' &&
        ['absolute', 'fixed'].includes(style.position) && /^(?:linear|radial|conic)-gradient\(/.test(style.maskImage);
      if (!gradient && !(gradientMask && surface)) continue;
      fixes.push([pseudo, (gradient ? `background-image: ${gradient} !important;` : '') +
        (surface ? `background-color: ${rgba(surface)} !important;` : '')]);
    }
    return fixes;
  }

  function isShallowDivider(element) {
    if (!element.matches('hr,[role="separator"],div:empty') || element.closest(interactive)) return false;
    const { width, height } = element.getBoundingClientRect();
    return width >= 160 && height > 0 && height <= 96 && width >= height * 4;
  }

  function horizontalSeparatorPaint(style, backdrop) {
    const declarations = [];
    const soften = value => {
      const ink = chromiumSrgb(value);
      if (!ink?.[3] || Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 24 ||
          luminance(compositeColor(ink, backdrop)) < luminance(backdrop) + .12) return null;
      return rgba([...ink.slice(0, 3), ink[3] * .2]);
    };
    for (const side of ['Top', 'Bottom']) {
      const width = parseFloat(style[`border${side}Width`]);
      if (!width || style[`border${side}Style`] !== 'solid') continue;
      const property = `border-${side.toLowerCase()}`;
      const color = soften(style[`border${side}Color`]);
      if (color) declarations.push(`${property}-color: ${color} !important;`);
      if (width > 1) declarations.push(`${property}-width: 1px !important;`);
    }
    const fill = soften(style.backgroundColor);
    if (fill && style.backgroundImage === 'none') {
      declarations.push(`background-color: ${fill} !important;`);
    }
    return declarations;
  }

  function labelPseudoSurfaces(element, background, surface) {
    if (!background || !surface || !element.matches('span,small,label,[role="status"]') ||
        !element.textContent.trim() || element.textContent.length > 80 ||
        element.querySelector('img,svg,video,canvas')) return [];
    const matchesBackground = value => {
      const color = chromiumSrgb(value);
      return color?.every((channel, index) => Math.abs(channel - background[index]) <= (index === 3 ? .01 : 6));
    };
    return ['::before', '::after'].flatMap(pseudo => {
      const style = getComputedStyle(element, pseudo);
      if (style.content !== '""') return [];
      const declarations = [];
      if (matchesBackground(style.backgroundColor)) declarations.push(`background-color: ${rgba(surface)} !important;`);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (parseFloat(style[`border${side}Width`]) > 0 && matchesBackground(style[`border${side}Color`])) {
          declarations.push(`border-${side.toLowerCase()}-color: ${rgba(surface)} !important;`);
        }
      }
      return declarations.length ? [[pseudo, declarations.join('')]] : [];
    });
  }

  function decorativePseudos(element, style) {
    const width = element.clientWidth;
    if (width < 360 || element.clientHeight < 160 || element.closest(interactive) ||
        (style.position === 'static' && width < innerWidth * .85)) return [];
    return ['::before', '::after'].filter(pseudo => {
      const layer = getComputedStyle(element, pseudo);
      if (layer.content !== '""' || !['absolute', 'fixed'].includes(layer.position) || layer.filter !== 'none' ||
          parseFloat(layer.width) < 360 || parseFloat(layer.height) < 160) return false;
      return layer.backgroundImage.startsWith('url(') || Boolean(chromiumGradient(layer));
    });
  }

  function decorativeSolidPaint(element, style) {
    if (style.position === 'static' || element.childElementCount < 2 || element.closest(interactive)) return [];
    const paint = [];
    for (const pseudo of ['::before', '::after']) {
      const layer = getComputedStyle(element, pseudo);
      if (layer.content !== '""' || layer.position !== 'absolute' || !(Number(layer.zIndex) < 0) ||
          parseFloat(layer.width) < 96 || parseFloat(layer.height) < 48 ||
          layer.backgroundImage !== 'none' || layer.maskImage !== 'none') continue;
      const ink = chromiumSrgb(layer.backgroundColor);
      if (ink?.[3] !== 1 || Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 36) continue;
      const fill = chromiumColor(ink, 'background');
      if (fill) paint.push([pseudo, `background-color: ${rgba(fill)} !important;`]);
    }
    return paint;
  }

  function chromiumBackdropShadow(shadow) {
    const result = shadow.replace(backdropShadowPattern, (match, r, g, b, alpha = 1, spread) => {
      if (Number(spread) < 24 || Number(alpha) <= .2) return match;
      const color = chromiumColor([r, g, b, alpha].map(Number), 'background');
      return color ? match.replace(/rgba?\([^)]*\)/, rgba(color)) : match;
    });
    return result === shadow ? null : result;
  }

  function hasImageBackdrop(element, style, backdrops) {
    if (backdrops.has(element)) return backdrops.get(element);
    let hasImage = style.backgroundImage !== 'none' && !backgroundSvgGlyph(style) && !paleSvgBackground(style.backgroundImage) &&
      !chromiumGradient(style, isHeadingBackground(element));
    if (!hasImage && chromiumSrgb(style.backgroundColor)?.[3] !== 1) {
      const parent = element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
      if (parent) hasImage = backdrops.get(parent) ?? hasImageBackdrop(parent, authoredBackdropStyle(parent), backdrops);
    }
    backdrops.set(element, hasImage);
    return hasImage;
  }

  function overlayImage(element, style) {
    const card = element.closest('a[href]');
    if (!(card || element.closest(heading)) || element.textContent.trim().length > 180) return null;
    let overlay = element;
    for (let depth = 0; overlay && overlay !== card && depth < 7; depth++, overlay = overlay.parentElement) {
      const layer = overlay === element ? style : authoredBackdropStyle(overlay);
      if (layer.backgroundImage !== 'none' || chromiumSrgb(layer.backgroundColor)?.[3] > 0) return null;
      if (layer.position !== 'absolute') continue;
      const text = element.getBoundingClientRect();
      if (!text.width || !text.height) return null;
      return Array.prototype.find.call(overlay.parentElement?.querySelectorAll('img') ?? [], image => {
        if (overlay.contains(image)) return false;
        const rect = image.getBoundingClientRect();
        return rect.width >= 96 && rect.height >= 64 && text.left >= rect.left - 1 && text.right <= rect.right + 1 &&
          text.top >= rect.top - 1 && text.bottom <= rect.bottom + 1;
      });
    }
    return null;
  }

  function textNode(node) {
    return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
  }

  async function overlayThumbnail(image, width, height) {
    const local = artworkPixels(image, width, height);
    if (local) return local;
    const source = image.currentSrc;
    if (!/^https?:/i.test(source)) return null;
    const resource = await readImageResource(source, 'cors');
    if (!resource || !/^image\/(?:avif|webp|jpeg|png)$/.test(resource.type)) return null;
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([resource.data], { type: resource.type }), {
        resizeWidth: width, resizeHeight: height, resizeQuality: 'medium'
      });
      return artworkPixels(bitmap, width, height);
    } catch {
      return null;
    } finally {
      bitmap?.close();
    }
  }

  function overlayColors(element, image) {
    const rect = image.getBoundingClientRect();
    const source = image.currentSrc;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight || !source) return null;
    if (!overlayImages.has(source)) {
      if (rect.right < -128 || rect.left > innerWidth + 128 || rect.bottom < -128 || rect.top > innerHeight + 128) {
        sampledElements.delete(element);
        return null;
      }
      const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const sample = { width, height, pixels: undefined };
      sample.ready = overlayThumbnail(image, width, height).then(pixels => { sample.pixels = pixels; });
      if (overlayImages.size >= 32) overlayImages.delete(overlayImages.keys().next().value);
      overlayImages.set(source, sample);
    }
    const sample = overlayImages.get(source);
    if (sample.pixels === undefined && overlayRequests.get(element) !== sample) {
      overlayRequests.set(element, sample);
      sample.ready.then(() => {
        if (preset && image.currentSrc === source && overlayRequests.get(element) === sample) scheduleDirtySurface(element);
      });
    }
    if (!sample.pixels) return null;
    const imageStyle = getComputedStyle(image);
    const position = /^(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/.exec(imageStyle.objectPosition);
    if (!position || imageStyle.transform !== 'none' || imageStyle.filter !== 'none' ||
        imageStyle.mixBlendMode !== 'normal' || imageStyle.opacity !== '1') return null;
    const [topInset, rightInset, bottomInset, leftInset] = borderEdges.map(side =>
      parseFloat(imageStyle[`padding${side}`]) + parseFloat(imageStyle[`border${side}Width`]));
    const boxWidth = rect.width - leftInset - rightInset;
    const boxHeight = rect.height - topInset - bottomInset;
    let width = boxWidth, height = boxHeight;
    if (imageStyle.objectFit !== 'fill') {
      const xScale = width / image.naturalWidth;
      const yScale = height / image.naturalHeight;
      const scale = imageStyle.objectFit === 'cover' ? Math.max(xScale, yScale) :
        imageStyle.objectFit === 'none' ? 1 : Math.min(xScale, yScale, imageStyle.objectFit === 'scale-down' ? 1 : Infinity);
      width = image.naturalWidth * scale;
      height = image.naturalHeight * scale;
    }
    const left = rect.left + leftInset + (boxWidth - width) * Number(position[1]) / 100;
    const top = rect.top + topInset + (boxHeight - height) * Number(position[2]) / 100;
    const range = document.createRange();
    const colors = new Map();
    for (const node of element.childNodes) {
      if (!textNode(node)) continue;
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.left < Math.max(left, rect.left + leftInset) - 1 ||
            line.right > Math.min(left + width, rect.right - rightInset) + 1 ||
            line.top < Math.max(top, rect.top + topInset) - 1 ||
            line.bottom > Math.min(top + height, rect.bottom - bottomInset) + 1) return null;
        const x0 = Math.max(0, Math.floor((line.left - left) * sample.width / width));
        const x1 = Math.min(sample.width, Math.ceil((line.right - left) * sample.width / width));
        const y0 = Math.max(0, Math.floor((line.top - top) * sample.height / height));
        const y1 = Math.min(sample.height, Math.ceil((line.bottom - top) * sample.height / height));
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const index = (y * sample.width + x) * 4;
            if (sample.pixels[index + 3] !== 255) return null;
            const [r, g, b] = sample.pixels.subarray(index, index + 3);
            const key = (r << 16) + (g << 8) + b;
            if (!colors.has(key)) colors.set(key, [r, g, b, 1]);
          }
        }
      }
    }
    return colors.size ? [...colors.values()] : null;
  }

  function imageLabelPaint(element, style, minimum) {
    const image = overlayImage(element, style);
    if (!image) return '';
    const fill = style.webkitTextFillColor;
    const inherited = !sheet.disabled && element.parentElement?.hasAttribute(marker) &&
      getComputedStyle(element.parentElement).webkitTextFillColor === fill;
    const authored = inherited && overlayAuthoredInk.get(element) || chromiumSrgb(fill);
    if (!authored?.[3] || style.backgroundClip === 'text') return '';
    overlayAuthoredInk.set(element, authored);
    if (!overlayLabels.has(image)) overlayLabels.set(image, new Set());
    overlayLabels.get(image).add(element);
    const dark = [18, 18, 18, 1], light = [255, 255, 255, 1];
    const colors = overlayColors(element, image) ?? [dark, light];
    const contrast = (ink, backing, alpha) => {
      let worst = Infinity;
      for (const pixel of colors) {
        const bg = alpha ? compositeColor([...backing.slice(0, 3), alpha], pixel) : pixel;
        worst = Math.min(worst, contrastRatio(luminance(compositeColor(ink, bg)), luminance(bg)));
      }
      return worst;
    };
    const darkContrast = contrast(dark), lightContrast = contrast(light);
    const ink = contrast(authored) >= minimum ? authored : darkContrast > lightContrast ? dark : light;
    const backing = ink === dark ? light : dark;
    let alpha = 0;
    while (contrast(ink, backing, alpha) < minimum && alpha < 1) alpha = Math.min(1, alpha + .1);
    return `color: ${rgba(ink)} !important; -webkit-text-fill-color: ${rgba(ink)} !important;` +
      (alpha ? `background-color: ${rgba([...backing.slice(0, 3), Math.round(alpha * 10) / 10])} !important;` : '');
  }

  function authoredBackdropStyle(element) {
    // Local sampling removes only the target's paint. Its ancestors may still be themed.
    if (!sheet.disabled && element.hasAttribute(marker) && authoredPaint.has(element)) return authoredPaint.get(element);
    return getComputedStyle(element);
  }

  function textBackdrop(element, cache, simulated = false) {
    if (!element) return null;
    if (cache.has(element)) return cache.get(element);
    const style = simulated ? authoredBackdropStyle(element) : getComputedStyle(element);
    let backdrop = simulated ?
      paleSvgBackground(style.backgroundImage)?.backdrop ?? darkGradientBackdrop(style, isHeadingBackground(element)) : null;
    if (style.backgroundImage === 'none' || elementBackgroundGlyph(element, style)) {
      const color = chromiumSrgb(style.backgroundColor);
      if (color) {
        const layer = simulated ? chromiumSurfaceColor(element, style, color) ?? color : color;
        if (layer[3] === 1) backdrop = layer;
        else if (simulated && element === document.documentElement && layer[3] === 0) backdrop = [18, 18, 18, 1];
        else {
          const parent = element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
          const below = textBackdrop(parent, cache, simulated);
          if (below) backdrop = compositeColor(layer, below);
        }
      }
    }
    cache.set(element, backdrop);
    return backdrop;
  }

  function chromiumTextBackdrop(element, cache) {
    return textBackdrop(element, cache, true);
  }

  function authoredSolidBackdrop(element) {
    const layers = [];
    for (let node = element, depth = 0; node && depth < 32; depth++) {
      const style = authoredBackdropStyle(node);
      if (style.backgroundImage !== 'none' && !backgroundSvgGlyph(style)) return null;
      const color = chromiumSrgb(style.backgroundColor);
      if (!color) return null;
      layers.push(color);
      if (color[3] === 1) return layers.reduceRight((backdrop, layer) => compositeColor(layer, backdrop), color);
      node = node.assignedSlot ?? node.parentElement ?? node.getRootNode().host;
    }
    return null;
  }

  function authoredAccentInk(element, backdrop, minimum) {
    if (!backdrop || !element.closest('a[href]') || element.closest(`${heading},${actionButton}`)) return null;
    const style = authoredBackdropStyle(element);
    const ink = chromiumSrgb(style.color);
    if (style.webkitTextFillColor !== style.color || !ink?.[3] ||
        Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) < 24) return null;
    const source = authoredSolidBackdrop(element);
    if (!source || luminance(source) <= .35 ||
        Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)) < 45 ||
        contrastRatio(luminance(compositeColor(ink, source)), luminance(source)) < 3) return null;
    const adapted = luminance(backdrop) < .18 ? chromiumColor(ink, 'foreground') ?? ink : ink;
    return readableColor(adapted, backdrop, minimum) ?? adapted;
  }

  function chromiumSurfaceColor(element, style, color) {
    if (!color?.[3] || element.style.getPropertyPriority('background-color') === 'important') return null;
    const surface = chromiumColor(color, 'background');
    if (!surface || color[3] !== 1 || style.backgroundImage !== 'none' ||
        !element.matches('div,span,small,strong,b,label,[role="status"]') ||
        element.textContent.length > 80 || !element.textContent.trim() ||
        element.clientWidth > 360 ||
        (element.matches('div') && !element.closest(interactive) && !element.matches('[role="status"]')) ||
        element.querySelector('img,svg,video,canvas')) return surface;

    // A nearly identical light backing on a short label should still blend into its card.
    const headingBacking = element.matches('span') && element.closest(heading) &&
      Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 16;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = authoredBackdropStyle(parent);
      const backdrop = chromiumSrgb(parentStyle.backgroundColor);
      if (!backdrop || parentStyle.backgroundImage !== 'none') break;
      if (!backdrop[3]) continue;
      if (backdrop[3] === 1 && (color.slice(0, 3).every((channel, index) =>
        Math.abs(channel - backdrop[index]) <= 16) || (headingBacking &&
        Math.max(...backdrop.slice(0, 3)) - Math.min(...backdrop.slice(0, 3)) >= 45))) {
        return chromiumSurfaceColor(parent, parentStyle, backdrop) ?? backdrop;
      }
      break;
    }
    return surface;
  }

  function darkGradientBackdrop(style, headingBackground) {
    const image = style.backgroundImage;
    if (!image.includes('gradient(') ||
        image.match(/[\w-]+(?=\()/g).some(name => !gradientFunction.test(name))) return null;
    const painted = chromiumGradient(style, headingBackground) ?? image;
    let lightest = null;
    let maximum = 0;
    for (const [stop] of painted.matchAll(gradientStop)) {
      const color = gradientColor(stop, headingBackground);
      if (color?.[3] !== 1) return null;
      const light = luminance(color);
      if (light > .18) return null;
      if (!lightest || light > maximum) {
        lightest = color;
        maximum = light;
      }
    }
    return lightest;
  }

  function compositeColor(color, backdrop) {
    return color.map((channel, index) => index === 3 ? 1 :
      channel * color[3] + backdrop[index] * (1 - color[3]));
  }

  function contrastRatio(first, second) {
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }

  function artworkPixels(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    try {
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    } catch {
      // The browser can display an image even when its pixels are inaccessible.
      return null;
    }
  }

  function sampleArtwork(image, original, darkened) {
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight),
      Math.sqrt(16384 / (image.naturalWidth * image.naturalHeight)));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const pixels = artworkPixels(image, width, height);
    if (!pixels) return null;
    const originalLight = luminance(original);
    const darkenedLight = luminance(darkened);
    const tileSize = 24;
    const columns = Math.ceil(width / tileSize);
    const totals = new Uint16Array(columns * Math.ceil(height / tileSize));
    const losses = new Uint16Array(totals.length);
    let transparent = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const alpha = 4 * (y * width + x) + 3;
        if (pixels[alpha] <= 64) transparent++;
        if (pixels[alpha] < 192 || (pixels[alpha - 4] > 64 && pixels[alpha + 4] > 64 &&
            pixels[alpha - 4 * width] > 64 && pixels[alpha + 4 * width] > 64)) continue;
        const ink = [pixels[alpha - 3], pixels[alpha - 2], pixels[alpha - 1], pixels[alpha] / 255];
        const tile = Math.floor(y / tileSize) * columns + Math.floor(x / tileSize);
        totals[tile]++;
        if (contrastRatio(luminance(compositeColor(ink, darkened)), darkenedLight) < 2 &&
            contrastRatio(luminance(compositeColor(ink, original)), originalLight) >= 3) losses[tile]++;
      }
    }
    // Assess edges next to transparency locally. Bright badges elsewhere can hide
    // the loss of a dark wordmark in an image-wide average.
    return transparent >= width * height * .05 &&
      losses.some((count, tile) => count >= 12 && count >= totals[tile] * .6) ? pixels : null;
  }

  function neutralSilhouetteInk(pixels) {
    if (!pixels) return null;
    let darkest = 255;
    let lightest = 0;
    let transparent = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) {
        transparent++;
        continue;
      }
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      darkest = Math.min(darkest, red, green, blue);
      lightest = Math.max(lightest, red, green, blue);
      if (lightest - darkest > 8) return null;
    }
    return darkest <= lightest && transparent >= pixels.length / 80 ? [lightest, lightest, lightest, 1] : null;
  }

  function isStaticSvgArtwork(data) {
    const svg = new DOMParser().parseFromString(new TextDecoder().decode(data), 'image/svg+xml');
    if (svg.documentElement.localName !== 'svg' || svg.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg' ||
        Array.from(svg.childNodes).some(node => node.nodeType === Node.PROCESSING_INSTRUCTION_NODE)) return false;
    // A simple internal paint class does not make a resource animated. Reject all
    // other CSS, including imports, URLs, custom properties and animation rules.
    const solidPaint = '(?:#[\\da-f]{3,8}|none|black|white|transparent)';
    const paintRule = new RegExp(`^\\.[\\w-]+\\s*\\{\\s*(?:(?:fill|stroke)\\s*:\\s*${solidPaint}\\s*;?\\s*)+\\}`, 'i');
    for (const style of svg.querySelectorAll('style')) {
      let css = style.textContent.trim();
      while (css) {
        const rule = paintRule.exec(css);
        if (!rule) return false;
        css = css.slice(rule[0].length).trim();
      }
    }
    return Array.from(svg.querySelectorAll('*')).every(element =>
      /^(svg|g|path|circle|ellipse|line|polygon|polyline|rect|defs|clipPath|linearGradient|radialGradient|stop|style|title|desc)$/.test(element.localName) &&
      Array.from(element.attributes).every(attribute => !/^on/i.test(attribute.localName) &&
        (attribute.localName !== 'href' || /^#[\w:.-]+$/.test(attribute.value)) &&
        (!/url\s*\(/i.test(attribute.value) || /^url\(#[\w:.-]+\)$/.test(attribute.value)) &&
        (attribute.localName !== 'style' || /^enable-background:\s*new[\d\s.+-]+;?$/i.test(attribute.value))));
  }

  async function readImageResource(source, mode) {
    const maxBytes = 512 * 1024;
    let reader;
    try {
      const response = await fetch(source, { mode, credentials: mode === 'cors' ? 'omit' : 'same-origin',
        cache: 'force-cache', signal: AbortSignal.timeout(2000) });
      reader = response.body?.getReader();
      const type = response.headers.get('content-type')?.split(';', 1)[0];
      if (!response.ok || !reader || !type?.startsWith('image/') ||
          Number(response.headers.get('content-length')) > maxBytes) return null;
      const chunks = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) return null;
        chunks.push(value);
      }
      const data = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { data, type };
    } catch {
      return null;
    } finally {
      reader?.cancel().catch(() => {});
    }
  }

  async function checkStaticArtwork(source) {
    if (!source) return null;
    const crossOrigin = new URL(source).origin !== location.origin;
    const resource = await readImageResource(source, crossOrigin ? 'cors' : 'same-origin');
    if (!resource) return false;
    const { data, type } = resource;
    let decoder;
    try {
      if (type === 'image/svg+xml') {
        if (!isStaticSvgArtwork(data)) return null;
        return { kind: 'svg', ink: crossOrigin ? await resourceSilhouetteInk(resource) : null };
      }
      if (crossOrigin) return null;
      if (!await globalThis.ImageDecoder?.isTypeSupported(type)) return false;
      decoder = new ImageDecoder({ data, type, preferAnimation: true });
      await decoder.tracks.ready;
      await decoder.completed;
      return decoder.tracks.selectedTrack?.frameCount === 1 ? { kind: 'raster' } : null;
    } catch {
      return false;
    } finally {
      decoder?.close();
    }
  }

  async function resourceSilhouetteInk(resource) {
    // Decode only a verified static SVG from a successful credential-free CORS
    // read. The original img can taint canvas even when its CDN permits CORS.
    if (resource.data.length > 32768) return null;
    const url = URL.createObjectURL(new Blob([resource.data], { type: resource.type }));
    const probe = new Image();
    let timeout;
    try {
      await new Promise((resolve, reject) => {
        probe.onload = resolve;
        probe.onerror = reject;
        timeout = setTimeout(reject, 2000);
        probe.src = url;
      });
      const { naturalWidth: width, naturalHeight: height } = probe;
      if (!width || !height || width * height > 262144) return null;
      return solidSilhouetteInk(artworkPixels(probe, width, height));
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      probe.onload = probe.onerror = null;
      URL.revokeObjectURL(url);
    }
  }

  function checkArtworkTint(image, sample) {
    const source = image.currentSrc;
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width * height > 262144) return;
    if (!staticArtwork.has(source)) {
      if (staticArtwork.size >= 64) staticArtwork.delete(staticArtwork.keys().next().value);
      // Serialize resource verification/decoding rather than starting one read
      // per visible logo at once. Cache failed CORS/format checks as well.
      const result = artworkReadQueue.then(() => checkStaticArtwork(source));
      staticArtwork.set(source, result);
      artworkReadQueue = result.catch(() => null);
    }
    staticArtwork.get(source).then(resource => {
      if (!resource || !preset || !image.isConnected || image.currentSrc !== source ||
          artworkContrast.get(image) !== sample) return;
      if (sample.crossOriginSolid) {
        const ink = resource.ink;
        const brighter = ink && readableColor(ink, sample.backdrop, 4.5);
        if (!brighter) return;
        const channel = ink.indexOf(Math.min(...ink.slice(0, 3)));
        sample.colorLift = (brighter[channel] - ink[channel]) / (255 - ink[channel]);
        sample.tint = true;
        schedule(image);
        return;
      }
      if (sample.solid ? !solidSilhouetteInk(artworkPixels(image, width, height)) :
          sample.colorLift ? resource.kind !== 'svg' : !neutralSilhouetteInk(artworkPixels(image, width, height))) return;
      sample.tint = true;
      schedule(image);
    });
  }

  function surroundingArtworkColors(element, boundary) {
    let parent = element.parentElement;
    for (let depth = 0; parent && parent !== document.body && (boundary || depth < 8); depth++, parent = parent.parentElement) {
      const layer = authoredBackdropStyle(parent);
      if (layer.backgroundImage !== 'none') break;
      const color = chromiumSrgb(layer.backgroundColor);
      if (!color || color[3] > 0) return [color, chromiumSurfaceColor(parent, layer, color)];
      if (parent === boundary) break;
    }
    return [];
  }

  function wrappedArtworkBacking(wrapper, style, original, darkened) {
    const image = wrapper.firstElementChild;
    if (!(image instanceof HTMLImageElement) || image.nextElementSibling || wrapper.textContent.trim() ||
        !image.complete || !image.naturalWidth || !image.naturalHeight ||
        style.display === 'contents' || style.backgroundImage !== 'none') return null;
    if (!darkened) {
      if (!(wrapper instanceof HTMLAnchorElement) || !wrapper.hasAttribute('href') ||
          original?.[3] !== 0 || wrapper.style.getPropertyPriority('background-color') === 'important') return null;
      const banner = wrapper.closest('header,[role="banner"]');
      const home = wrapper.relList.contains('home') ||
        (wrapper.origin === location.origin && wrapper.pathname === '/');
      if (!banner && !home) return null;
      [original, darkened] = surroundingArtworkColors(wrapper, banner);
    }
    return artworkBackingForImage(image, original, darkened);
  }

  function artworkRepair(element, style, original, darkened) {
    if (!(element instanceof HTMLImageElement || element.firstElementChild instanceof HTMLImageElement)) return {};
    if (darkened || (element.matches('a[href]') && style.display !== 'inline')) {
      return { backing: wrappedArtworkBacking(element, style, original, darkened) };
    }
    if (!(element instanceof HTMLImageElement)) return {};
    const parent = element.parentElement;
    if (parent instanceof HTMLAnchorElement && element.style.getPropertyPriority('background-color') !== 'important') {
      const linkStyle = getComputedStyle(parent);
      // An inline link around a block image has no box behind the image.
      if (linkStyle.display === 'inline') {
        return { backing: wrappedArtworkBacking(parent, linkStyle, chromiumSrgb(linkStyle.backgroundColor), null) };
      }
    }
    if (!parent?.matches(heading) || parent.firstElementChild !== element || parent.textContent.trim().length > 120) return {};
    const [light, dark] = surroundingArtworkColors(element);
    const backing = artworkBackingForImage(element, light, dark, Boolean(parent.textContent.trim()));
    if (backing && artworkContrast.get(element)?.tint) {
      return { filter: `brightness(0) invert(1) brightness(${artworkTintLevel(dark)})` };
    }
    return { backing };
  }

  function artworkBackingForImage(image, original, darkened, allowTint = false) {
    if (!darkened || original?.[3] !== 1 || luminance(original) < .75 || luminance(darkened) > .12) return null;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight ||
        image.style.getPropertyPriority('background-color') === 'important') return null;
    const imageStyle = getComputedStyle(image);
    if (!['inline', 'block'].includes(imageStyle.display) || imageStyle.backgroundImage !== 'none' ||
        chromiumSrgb(imageStyle.backgroundColor)?.[3] !== 0 || imageStyle.mixBlendMode !== 'normal' ||
        imageStyle.filter !== 'none' || imageStyle.opacity !== '1' ||
        ['absolute', 'fixed'].includes(imageStyle.position) || image.clientWidth < 96 || image.clientHeight < 20) return null;
    const key = `${image.currentSrc}|${original}|${darkened}|${allowTint}`;
    let sample = artworkContrast.get(image);
    if (sample?.key !== key) {
      const pixels = sampleArtwork(image, original, darkened);
      sample = { key, keepBackdrop: Boolean(pixels), tint: false };
      artworkContrast.set(image, sample);
      if (allowTint && neutralSilhouetteInk(pixels)) checkArtworkTint(image, sample);
    }
    return sample.keepBackdrop ? original : null;
  }

  function relatedColorLift(pixels, backdrop) {
    if (!pixels) return 0;
    let transparent = 0, opaque = 0, colored = 0;
    let firstHue, darkestInk;
    let darkestLight = 1;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 32) transparent++;
      if (alpha < 224) continue;
      opaque++;
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      if (Math.max(red, green, blue) - Math.min(red, green, blue) < 24) continue;
      colored++;
      const hue = Math.atan2(Math.sqrt(3) * (green - blue), 2 * red - green - blue);
      firstHue ??= hue;
      if (Math.cos(hue - firstHue) < Math.SQRT1_2) return 0;
      const ink = [red, green, blue, 1];
      const light = luminance(ink);
      if (light < darkestLight) {
        darkestInk = ink;
        darkestLight = light;
      }
    }
    if (transparent < pixels.length / 80 || colored < opaque * .8 || !darkestInk) return 0;
    const brighter = readableColor(darkestInk, backdrop, 4.5);
    if (!brighter) return 0;
    const channel = darkestInk.indexOf(Math.min(...darkestInk.slice(0, 3)));
    return (brighter[channel] - darkestInk[channel]) / (255 - darkestInk[channel]);
  }

  function linkedGlyphFilter(image, style, getBackdrop) {
    const link = image.parentElement;
    const imageOnly = link instanceof HTMLAnchorElement && !link.textContent.trim() && link.childElementCount === 1;
    if (!(link instanceof HTMLAnchorElement) || !link.hasAttribute('href') ||
        !image.complete || !image.naturalWidth || !image.naturalHeight || !image.clientWidth || !image.clientHeight ||
        (imageOnly ? image.clientWidth > 400 || image.clientHeight > 160 ||
          image.naturalWidth * image.naturalHeight > 262144 :
          Math.max(image.clientWidth, image.clientHeight) > 64 || Math.max(image.naturalWidth, image.naturalHeight) > 128) ||
        style.filter !== 'none' || style.opacity !== '1' || style.mixBlendMode !== 'normal' ||
        style.backgroundImage !== 'none' || chromiumSrgb(style.backgroundColor)?.[3] !== 0 ||
        style.position === 'absolute' || style.position === 'fixed') return;
    const backdrop = getBackdrop(image);
    if (!backdrop || luminance(backdrop) > .18) return;
    const key = `${image.currentSrc}|${backdrop}|glyph`;
    let sample = artworkContrast.get(image);
    if (sample?.key !== key) {
      const pixels = artworkPixels(image, image.naturalWidth, image.naturalHeight);
      const solid = imageOnly && solidSilhouetteInk(pixels);
      const ink = solid ? null : neutralSilhouetteInk(pixels);
      const brighter = solid && readableColor(solid, backdrop, 4.5);
      const channel = solid && solid.indexOf(Math.min(...solid.slice(0, 3)));
      const colorLift = solid ? (brighter ? (brighter[channel] - solid[channel]) / (255 - solid[channel]) : 0) :
        imageOnly ? 0 : ink ? 0 : relatedColorLift(pixels, backdrop);
      const crossOriginSolid = imageOnly && !pixels && new URL(image.currentSrc).origin !== location.origin;
      sample = { key, tint: false, colorLift, solid: Boolean(solid), crossOriginSolid, backdrop };
      artworkContrast.set(image, sample);
      if (colorLift || crossOriginSolid || (ink && readableColor(ink, backdrop, 4.5))) checkArtworkTint(image, sample);
    }
    if (sample.tint) return sample.colorLift ? `invert(1) brightness(${1 - sample.colorLift}) invert(1)` :
      'brightness(0) invert(1)';
  }

  function solidSilhouetteInk(pixels) {
    if (!pixels) return null;
    let ink, transparent = 0, opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) transparent++;
      if (pixels[index + 3] < 224) continue;
      const color = [pixels[index], pixels[index + 1], pixels[index + 2], 1];
      ink ??= color;
      if (color.some((channel, i) => Math.abs(channel - ink[i]) > 8)) return null;
      opaque++;
    }
    return opaque >= 16 && transparent >= pixels.length / 80 ? ink : null;
  }

  function artworkTintLevel(backdrop) {
    const neutral = [209, 209, 209, 1];
    return (readableColor(neutral, backdrop) ?? neutral)[0] / 255;
  }

  function readableColor(color, backdrop, minimum = 4.5) {
    const light = luminance(backdrop);
    const ratio = ink => contrastRatio(luminance(compositeColor(ink, backdrop)), light);
    if (ratio(color) >= minimum) return null;
    const target = light + .05 > Math.sqrt(.05 * 1.05) ? 0 : 255;
    minimum = Math.min(minimum, ratio([target, target, target, 1]));
    let low = 0;
    let high = 16;
    while (high - low > 1) {
      const step = (high + low) >> 1;
      const candidate = color.map((channel, index) => index === 3 ? 1 :
        Math.round(channel + (target - channel) * step / 16));
      if (ratio(candidate) >= minimum) high = step;
      else low = step;
    }
    return color.map((channel, index) => index === 3 ? 1 :
      Math.round(channel + (target - channel) * high / 16));
  }

  function perceptualHeadingColor(ink, backdrop) {
    const score = globalThis.nativeDarkModePerceptualContrast;
    const backgroundLight = luminance(backdrop);
    const contrast = color => contrastRatio(luminance(color), backgroundLight);
    const light = [255, 255, 255, 1];
    const dark = [32, 32, 32, 1];
    const options = [light, dark].filter(color => contrast(color) >= 3);
    const preferred = options.sort((a, b) => Math.abs(score(b, backdrop)) - Math.abs(score(a, backdrop)))[0];
    if (!preferred) return readableColor(ink, backdrop);
    const rendered = compositeColor(ink, backdrop);
    if (contrast(rendered) >= 3 && Math.sign(score(rendered, backdrop)) === Math.sign(score(preferred, backdrop))) {
      return null;
    }
    return preferred;
  }

  function chromiumSeparators(element, style, backdrops, boxShadow) {
    if (element.closest(interactive) || element.matches('input,select,textarea')) return [];
    const ring = /rgba?\([^)]*\) 0px 0px 0px [12]px(?: inset)?(?=,|$)/g;
    const decorativeRing = !emphasizeSeparators && boxShadow.search(ring) !== -1 &&
      element.tabIndex < 0 && !element.matches(':focus-within');
    const raisedSurface = emphasizeSeparators && !element.matches('hr,[role="separator"],[role="tablist"]') && boxShadow !== 'none' &&
      !boxShadow.includes('inset') && parseFloat(style.borderTopLeftRadius) > 0 &&
      chromiumSrgb(style.backgroundColor)?.[3] === 1;
    if (!raisedSurface && !decorativeRing && style.borderStyle === 'none' && !boxShadow.includes('inset')) return [];
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(side =>
      style[`border${side}Style`] === 'solid' && parseFloat(style[`border${side}Width`]) <= 2 &&
      parseFloat(style[`border${side}Width`]) > 0);
    if (!raisedSurface && !decorativeRing && !sides.length && !boxShadow.includes('inset')) return [];
    const panel = !emphasizeSeparators && element.clientWidth >= 360 &&
      (element.matches('header,nav,[role="banner"],[role="navigation"]') ||
        (element.matches('[role="region"]') && element.clientHeight >= 160));
    const backdrop = chromiumTextBackdrop(element, backdrops.solid) ??
      (panel ? chromiumTextBackdrop(document.documentElement, backdrops.solid) : null);
    if (!backdrop || luminance(backdrop) > .18) return [];
    let sourceBackdrop;
    const darkEdgeInk = value => {
      const original = chromiumSrgb(value);
      if (!original?.[3] || luminance(original) >= .18 ||
          Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) > 24) return null;
      sourceBackdrop ??= authoredSolidBackdrop(element);
      if (!sourceBackdrop ||
          contrastRatio(luminance(compositeColor(original, sourceBackdrop)), luminance(sourceBackdrop)) < 3) return null;
      return readableColor(original, backdrop, 3) ?? original;
    };
    if (emphasizeSeparators) {
      const { minimum, opacity } = separatorLevels[emphasizeSeparators];
      const strengthen = (value, baseline) => {
        const color = chromiumSrgb(value);
        if (!color?.[3]) return null;
        const ink = opacity === 1 ? color : [...color.slice(0, 3), color[3] * opacity];
        // Emphasis is an increase over the repaired Off edge, not a lower absolute target.
        const target = baseline ? minimum - 1 +
          contrastRatio(luminance(compositeColor(baseline, backdrop)), luminance(backdrop)) : minimum;
        return readableColor(ink, backdrop, target) ?? (ink !== color ? ink : null);
      };
      const declarations = sides.flatMap(side => {
        const original = style[`border${side}Color`];
        const color = strengthen(original, darkEdgeInk(original));
        return color ? [`border-${side.toLowerCase()}-color: ${rgba(color)} !important;`] : [];
      });
      const shadow = boxShadow.replace(/(rgba?\([^)]*\)) (-?[012]px) (-?[012]px) 0px(?: 0px)? inset/g,
        (match, value, x, y) => {
          const color = x === '0px' && y === '0px' ? null : strengthen(value);
          return color ? match.replace(value, rgba(color)) : match;
        });
      if (shadow !== boxShadow) declarations.push(`box-shadow: ${shadow} !important;`);
      if (raisedSurface && !sides.length) {
        const outside = chromiumTextBackdrop(element.parentElement ?? element.getRootNode().host, backdrops.solid);
        const edge = raisedSurfaceEdge(style, backdrop, outside, boxShadow);
        if (edge) declarations.push(edge);
      }
      return declarations;
    }
    const soften = value => {
      const color = chromiumSrgb(value);
      if (!color || luminance(compositeColor(color, backdrop)) < luminance(backdrop) + .12) return value;
      const neutral = Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 24;
      if (panel && !neutral) return value;
      return rgba([...color.slice(0, 3), color[3] * (panel ? .12 : .2)]);
    };
    const declarations = [];
    for (const side of sides) {
      const color = style[`border${side}Color`];
      const darkInk = darkEdgeInk(color);
      if (darkInk) {
        // A dark authored edge on a light canvas must not remain black on its dark replacement.
        declarations.push(`border-${side.toLowerCase()}-color: ${rgba(darkInk)} !important;`);
        continue;
      }
      const softened = soften(color);
      if (softened !== color) {
        declarations.push(`border-${side.toLowerCase()}-color: ${softened} !important;`);
      } else if (sides.length === 1 && (side === 'Top' || side === 'Bottom') &&
          color === style.color && paintedBorderSides(style).length === 1) {
        const ink = chromiumSrgb(color);
        if (ink?.[3] && Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 24) {
          // Keep a thin divider from inheriting the stronger contrast used for text.
          const line = readableColor(ink, backdrop, 1.5) ?? ink;
          // Increase the visible edge slightly without changing its geometry.
          const adjusted = line.slice(0, 3).map((channel, index) =>
            Math.min(255, channel + Math.round(Math.max(0, channel - backdrop[index]) * .08)));
          declarations.push(`border-${side.toLowerCase()}-color: ${rgba([...adjusted, line[3]])} !important;`);
        }
      }
    }
    let shadow = boxShadow.replace(/(rgba?\([^)]*\)) (-?[012]px) (-?[012]px) 0px(?: 0px)? inset/g,
      (match, color, x, y) => x === '0px' && y === '0px' ? match : match.replace(color, soften(color)));
    if (decorativeRing) {
      shadow = shadow.replace(ring, match => match.replace(/^rgba?\([^)]*\)/, value => {
        const ink = chromiumSrgb(value);
        return ink && Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 24 ? soften(value) : value;
      }));
    }
    if (shadow !== boxShadow) declarations.push(`box-shadow: ${shadow} !important;`);
    return declarations;
  }

  function iconControlEdges(element, style, backdrop) {
    if (!emphasizeSeparators || !element.matches(interactive) ||
        element.matches(':disabled,[aria-disabled="true"],[role="tab"]') ||
        paintedBorderSides(style).length || hasPaintedOutline(style) || style.borderImageSource !== 'none' ||
        !backdrop || luminance(backdrop) > .18) return [];
    const box = element.getBoundingClientRect();
    if (Math.min(box.width, box.height) < 20 || Math.max(box.width, box.height) > 80) return [];
    // Hidden accessible labels do not make an icon control a text button.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('svg')) continue;
      const textStyle = getComputedStyle(node.parentElement);
      if (textStyle.visibility !== 'visible' || Number(textStyle.opacity) === 0 ||
          chromiumSrgb(authoredBackdropStyle(node.parentElement).webkitTextFillColor)?.[3] === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 2 && rect.height > 2 && rect.right > box.left && rect.left < box.right &&
            rect.bottom > box.top && rect.top < box.bottom) return [];
      }
    }
    const { minimum, edgeWidth } = separatorLevels[emphasizeSeparators];
    const layers = chromiumSrgb(style.backgroundColor)?.[3] ? [['', style, backdrop]] :
      ['::before', '::after'].flatMap(pseudo => {
        const layer = getComputedStyle(element, pseudo);
        const color = chromiumSrgb(layer.backgroundColor);
        // A separate empty layer can draw the rounded control backing and rotate on hover.
        if (layer.content !== '""' || layer.position !== 'absolute' || !color?.[3] ||
            layer.backgroundImage !== 'none' || Number(layer.opacity) !== 1 ||
            paintedBorderSides(layer).length || hasPaintedOutline(layer) || layer.borderImageSource !== 'none' ||
            Math.abs(parseFloat(layer.width) - box.width) > 2 || Math.abs(parseFloat(layer.height) - box.height) > 2 ||
            Math.abs(parseFloat(layer.top)) > 2 || Math.abs(parseFloat(layer.left)) > 2) return [];
        return [[pseudo, layer, compositeColor(color, backdrop)]];
      });
    return layers.flatMap(([pseudo, layer, background]) => {
      if (luminance(background) > .18) return [];
      const edge = readableColor(background, background, minimum);
      return [[`:not(:focus-visible)${pseudo}`, `box-shadow: inset 0 0 0 ${edgeWidth}px ${rgba(edge)}` +
        (layer.boxShadow === 'none' ? '' : `, ${layer.boxShadow}`) + ' !important;']];
    });
  }

  function raisedSurfaceEdge(style, backdrop, outside, shadow) {
    if (!backdrop || luminance(backdrop) > .18 || style.borderStyle !== 'none' ||
        style.borderImageSource !== 'none' || hasPaintedOutline(style)) return '';
    if (!outside || Math.abs(luminance(outside) - luminance(backdrop)) >= .03) return '';
    const { minimum, edgeWidth } = separatorLevels[emphasizeSeparators];
    const edge = readableColor(backdrop, backdrop, minimum);
    return `box-shadow: inset 0 0 0 ${edgeWidth}px ${rgba(edge)}, ${shadow} !important;`;
  }

  function raisedLink(element, style) {
    return element.matches('a[href]:not([aria-disabled="true"])') &&
      ['block', 'flex', 'grid'].includes(style.display) && parseFloat(style.borderTopLeftRadius) >= 4 &&
      style.boxShadow !== 'none' && !style.boxShadow.includes('inset') && chromiumSrgb(style.backgroundColor)?.[3] === 1 &&
      element.clientWidth >= 120 && element.clientHeight >= 64;
  }

  function trackRaisedLink(element, style) {
    const raised = raisedLink(element, style);
    if (raised) raisedLinks.add(element);
    return raised;
  }

  function subduedChipBorder(element, style, surface) {
    if (emphasizeSeparators || !element.matches('button:not(:disabled,[aria-pressed],[aria-selected],[aria-disabled="true"])') ||
        style.borderStyle !== 'solid' || parseFloat(style.borderTopLeftRadius) < 6 ||
        !element.querySelector(':scope > svg') || !element.textContent.trim() ||
        !surface || surface[3] !== 1 || luminance(surface) > .18 ||
        element.offsetHeight > 48) return '';
    return ['Top', 'Right', 'Bottom', 'Left'].map(side => {
      const width = parseFloat(style[`border${side}Width`]);
      const ink = chromiumSrgb(style[`border${side}Color`]);
      if (width <= 0 || width > 2 || !ink ||
          Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 24 ||
          luminance(compositeColor(ink, surface)) < luminance(surface) + .12) return '';
      return `border-${side.toLowerCase()}-color: ${rgba([...ink.slice(0, 3), ink[3] * .15])} !important;`;
    }).join('');
  }

  function compactTextControl(element) {
    if (!element.matches('a[href],button') || element.matches(':disabled,[aria-disabled="true"],[aria-pressed],[aria-selected],[aria-current]') ||
        !element.textContent.trim() || element.textContent.trim().length > 100) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.width <= 320 && box.height > 0 && box.height <= 48;
  }

  function coloredControlBorder(element, style, getBackdrop) {
    if (!element.matches(interactive) ||
        element.matches(':disabled,[aria-disabled="true"],[aria-pressed],[aria-selected],[aria-current],[role="tab"]') ||
        style.borderImageSource !== 'none') return '';
    const source = authoredBackdropStyle(element);
    if (chromiumSrgb(source.backgroundColor)?.[3] > .2) return '';
    const backdrop = getBackdrop(element);
    if (!backdrop || luminance(backdrop) >= .18) return '';
    return borderEdges.map(side => {
      const width = parseFloat(source[`border${side}Width`]);
      const ink = chromiumSrgb(source[`border${side}Color`]);
      if (!(width > 0 && width <= 2) || source[`border${side}Style`] !== 'solid' || !ink?.[3] ||
          Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) < 45) return '';
      const color = contrastingGlyphInk(ink, backdrop, 4.5, true) ?? ink;
      return `border-${side.toLowerCase()}-color: ${rgba(color)} !important;`;
    }).join('');
  }

  function authoredFrameBorder(element, style, backdrop, sourceBackground) {
    const compact = compactTextControl(element);
    if (!backdrop || luminance(backdrop) > .18 ||
        (!compact && element.closest(interactive)) || element.closest('[role="tablist"]') || element.matches('input,select,textarea') ||
        style.borderImageSource !== 'none' || hasPaintedOutline(style)) return '';
    const background = sourceBackground ?? chromiumSrgb(style.backgroundColor);
    const color = chromiumSrgb(style.borderTopColor);
    const width = parseFloat(style.borderTopWidth);
    // Pixel snapping at fractional scale can report an authored 1px border as 0.8px.
    if (background?.[3] !== 1 || luminance(background) < .6 || color?.[3] !== 1 ||
        Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 16 || width <= 0 || width > 8 ||
        !['Top', 'Right', 'Bottom', 'Left'].every(side => style[`border${side}Style`] === 'solid' &&
          style[`border${side}Color`] === style.borderTopColor && parseFloat(style[`border${side}Width`]) === width)) return '';
    const originalContrast = contrastRatio(luminance(color), luminance(background));
    if (originalContrast > 1.8) return '';
    // Off follows the authored visual weight; the preference supplies a graduated target.
    const target = emphasizeSeparators ? separatorLevels[emphasizeSeparators].minimum :
      Math.max(1.05, originalContrast * 1.08);
    const edge = readableColor(backdrop, backdrop, target);
    return `border-color: ${rgba(edge)} !important;`;
  }

  function listItemFramePaint(element, getBackdrop) {
    if (!element.matches('li,[role="listitem"]') || element.matches(':focus-within')) return [];
    const backdrop = getBackdrop(element);
    if (!backdrop || luminance(backdrop) > .18) return [];
    const paints = [];
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (style.content !== '""' || style.backgroundImage !== 'none' || style.transform !== 'none' ||
          style.filter !== 'none' || style.maskImage !== 'none' || !(parseFloat(style.borderTopWidth) > 0)) continue;
      const backing = chromiumSrgb(style.backgroundColor);
      const source = backing && authoredSolidBackdrop(element);
      if (!source) continue;
      const paint = authoredFrameBorder(element, style, backdrop, compositeColor(backing, source));
      if (paint) paints.push([pseudo, paint]);
    }
    return paints;
  }

  function subduedFieldBorder(element, style, original, surface) {
    if (emphasizeSeparators || !element.matches(`${textInput},input[type="password"],input[type="email"],input[type="url"],input[type="tel"],input[type="number"]`) ||
        original?.[3] !== 1 || luminance(original) < .75 || !surface || luminance(surface) > .12) return '';
    return paintedBorderSides(style).map(side => {
      const ink = chromiumSrgb(style[`border${side}Color`]);
      if (!ink || style[`border${side}Style`] !== 'solid' || parseFloat(style[`border${side}Width`]) > 2 ||
          luminance(ink) < .45 || Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 24) return '';
      return `border-${side.toLowerCase()}-color: ${rgba([...ink.slice(0, 3), ink[3] * .34])} !important;`;
    }).join('');
  }

  function tabBorderPaints(element, backdrops) {
    if (!element.matches('[role="tab"],[role="tablist"]')) return [];
    const backdrop = chromiumTextBackdrop(element, backdrops);
    if (!backdrop) return [];
    const baseLight = luminance(backdrop);
    if (baseLight > .18) return [];
    return ['', '::before', '::after'].flatMap(pseudo => {
      const style = getComputedStyle(element, pseudo || null);
      if (pseudo && style.content !== '""') return [];
      const declarations = [];
      for (const side of paintedBorderSides(style)) {
        const border = style[`border${side}Color`];
        const color = chromiumSrgb(border);
        if (!color?.[3] || Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 24) continue;
        const inkLight = luminance(compositeColor(color, backdrop));
        // A border using currentColor can brighten when the tab text is recolored.
        const ink = inkLight >= baseLight + .12 ? [...color.slice(0, 3), color[3] * .2] :
          border === style.color ? readableColor(color, backdrop, 1.5) ?? color : null;
        if (ink) declarations.push(`border-${side.toLowerCase()}-color: ${rgba(ink)} !important;`);
      }
      return declarations.length ? [[pseudo, declarations.join('')]] : [];
    });
  }

  function originalTransitionColors(element, style) {
    const colors = {};
    if (style.transitionDuration === '0s' && style.transitionDelay === '0s') return colors;
    // Removing the previous palette can start a transition toward the authored color.
    // Classify its destination before the browser paints any intermediate frames.
    for (const animation of element.getAnimations()) {
      if (!(animation instanceof CSSTransition)) continue;
      const target = animation.effect?.getKeyframes().at(-1);
      if (target) Object.assign(colors, target);
    }
    return colors;
  }

  function hasStickyBackgroundTransition(element, style) {
    if (style.transitionDuration === '0s' && style.transitionDelay === '0s') return false;
    if (!style.transitionProperty.split(', ').some(property =>
      ['all', 'background', 'background-color'].includes(property))) return false;
    if (style.position === 'sticky') return true;
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && depth < 3; depth++, ancestor = ancestor.parentElement) {
      if (getComputedStyle(ancestor).position === 'sticky') return true;
    }
    return false;
  }

  function chromiumColors(element, backdrops, switchingRenderer) {
    if (element instanceof SVGSVGElement) {
      if (isDecorativeBackground(element, getComputedStyle(element))) {
        return { declarations: 'filter: brightness(.18) !important;', transition: null, pseudoStyles: [] };
      }
      return svgIconPaint(element, node => chromiumTextBackdrop(node, backdrops.solid), true);
    }
    if (!(element instanceof HTMLElement) || element.matches(excluded)) return null;
    const style = getComputedStyle(element);
    const svgBackground = paleSvgBackground(style.backgroundImage);
    if (!svgBackground && style.backgroundImage.startsWith('url(') && isDecorativeBackground(element, style)) {
      return { declarations: 'filter: brightness(.18) !important;', transition: null, pseudoStyles: [] };
    }
    const stickyTransition = hasStickyBackgroundTransition(element, style);
    const raised = trackRaisedLink(element, style);
    const original = switchingRenderer || stickyTransition || raised ? originalTransitionColors(element, style) : style;
    const foreground = chromiumSrgb(original.color ?? style.color);
    const background = chromiumSrgb(original.backgroundColor ?? style.backgroundColor);
    const blend = ['multiply', 'darken', 'color-burn'].includes(style.mixBlendMode);
    const preservePhoto = blend && (element.matches('img') ||
      (!element.textContent.trim() && element.querySelector('img')));
    const hasText = Array.prototype.some.call(element.childNodes, textNode) ||
      (element instanceof HTMLInputElement && element.matches(actionButton) && element.value.trim());
    const imageLabel = hasText && imageLabelPaint(element, style, 4.5);
    let color = foreground?.[3] ? chromiumColor(foreground, 'foreground') : null;
    const horizontalSeparator = element.matches('[role="separator"][aria-orientation="horizontal"]') &&
      !element.textContent.replace(/&nbsp;/gi, '').trim();
    if (horizontalSeparator) {
      // Generated separator lines can use currentColor even when the element has no visible text.
      color = foreground;
    }
    if (imageLabel || (color && hasImageBackdrop(element, style, backdrops.images))) {
      // Keep the author's text color over backgrounds whose image pixels stay unchanged.
      color = foreground;
    }
    const blendsBackgroundImage = style.backgroundImage !== 'none' &&
      style.backgroundBlendMode.split(', ').includes('multiply');
    const headingBackground = isHeadingBackground(element) || isShallowDivider(element);
    const select = element instanceof HTMLSelectElement;
    const carousel = carouselDirection(element);
    const glyph = ((hasText || select || carousel || wrappedBackgroundGlyphLabel(element, style)) &&
      elementBackgroundGlyph(element, style)) || externalSvgGlyph(element, style);
    const glyphBackdrop = glyph && chromiumTextBackdrop(glyph.external ? element.parentElement : element, backdrops.solid);
    // The compact arrow in a select needs extra contrast at small sizes.
    const gradient = contrastingSvgBackground(glyph, glyphBackdrop, glyph?.external ? 10 : 7,
      glyph?.external || select || Boolean(carousel)) ??
      svgBackground?.image ?? chromiumGradient(style, headingBackground);
    const shadow = chromiumBackdropShadow(original.boxShadow ?? style.boxShadow);
    let surface = blendsBackgroundImage && !gradient ? null : chromiumSurfaceColor(element, style, background);
    const backdropFor = node => chromiumTextBackdrop(node, backdrops.solid);
    const artwork = artworkRepair(element, style, background, surface);
    surface = artwork.backing ?? surface;
    const artworkFilter = artwork.filter ??
      (element instanceof HTMLImageElement ? linkedGlyphFilter(element, style, backdropFor) : undefined);
    if (element === document.documentElement && background?.[3] === 0 && style.backgroundImage === 'none') {
      const body = document.body && getComputedStyle(document.body);
      if (!body || (chromiumSrgb(body.backgroundColor)?.[3] === 0 && body.backgroundImage === 'none')) {
        // Supply a dark canvas when neither element paints the viewport.
        surface = [18, 18, 18, 1];
      }
    }
    let textFill;
    let isolateLabel = false;
    let undimLabel = false;
    const editable = (select || element.matches(textInput)) && !element.matches(':disabled, [aria-disabled="true"]');
    if ((hasText || editable) && foreground?.[3] && !imageLabel &&
        !element.closest(':disabled, [aria-disabled="true"]')) {
      const backdrop = chromiumTextBackdrop(element, backdrops.solid);
      const fill = chromiumSrgb(style.webkitTextFillColor);
      if (backdrop && fill?.[3] > .2) {
        const explicitFill = style.webkitTextFillColor !== style.color;
        const inlineImportant = element.style.getPropertyPriority('color') === 'important';
        const backdropLight = luminance(backdrop);
        // Some buttons render their text in a sibling of a transparent native input.
        const brightAction = backdropLight > .35 && (element.closest(actionButton) ||
          element.parentElement?.querySelector(`:scope > ${buttonInput}`) ||
          (backdropLight >= .5 && element.closest(interactive)));
        const keepAccent = !brightAction && !explicitFill && !inlineImportant && !element.closest(`${heading},${actionButton}`) &&
          backdropLight > .35 && Math.max(...backdrop.slice(0, 3)) - Math.min(...backdrop.slice(0, 3)) >= 45 &&
          contrastRatio(luminance(compositeColor(foreground, backdrop)), backdropLight) >= 3;
        if (keepAccent) color = foreground;
        const ink = explicitFill ? fill : inlineImportant ? foreground : color ?? foreground;
        // Colored controls can keep their light labels, but linked section headings
        // must use the same contrast rule as headings without links.
        const lightInkOnColor = !brightAction && luminance(ink) > .8 && Math.max(...backdrop.slice(0, 3)) -
          Math.min(...backdrop.slice(0, 3)) >= 45 && !element.closest(heading) && element.closest(interactive);
        // Some section titles are styled as headings without heading markup.
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight);
        const largeHeading = element.closest(heading) ? size >= 16 && weight >= 600 :
          size >= 56 / 3 && weight >= 700 && element.textContent.trim().length <= 120;
        const readable = largeHeading ? perceptualHeadingColor(ink, backdrop) :
          lightInkOnColor ? null : readableColor(ink, backdrop, brightAction ? 7 : 4.5);
        if (readable) {
          if (explicitFill || inlineImportant) textFill = readable;
          else color = readable;
        }
        const accent = authoredAccentInk(element, backdrop, 4.5);
        if (accent && !inlineImportant && !explicitFill) color = accent;
      }
    }
    const brightness = /^brightness\(([\d.]+)\)$/.exec(style.filter);
    const dim = Boolean(brightness && Number(brightness[1]) < .8 && element.textContent.length <= 80);
    // Product metadata can include a long accessible title in addition to the visible labels.
    if ((blend || dim) && element.textContent.trim() &&
        !element.querySelector('img,svg,video,canvas') && !element.closest(':disabled, [aria-disabled="true"]') &&
        chromiumTextBackdrop(element, backdrops.solid)) {
      isolateLabel = blend;
      undimLabel = dim;
    }
    const separators = chromiumSeparators(element, style, backdrops, shadow ?? style.boxShadow);
    const emptyControl = element.matches(interactive) && element.getAttribute('aria-label') &&
      !element.childElementCount && !element.textContent.trim();
    const icon = controlSprite(element, style);
    // An expandable control can already use a light sprite. Blind inversion would darken it.
    const expander = !icon && expanderPaint(element, style, backdropFor);
    const iconBackdrop = icon && chromiumTextBackdrop(element.parentElement, backdrops.solid);
    const lightIcon = iconBackdrop && luminance(iconBackdrop) < .18 ? icon : null;
    const pseudoStyles = emptyControl ? (carousel && glyphBackdrop ? [] : controlGlyphPaint(element, style, backdropFor)) :
      headingBackground ? headingPseudoGradients(element) : labelPseudoSurfaces(element, background, surface);
    if (labeledGlyphHost(element, style) && (hasText || element.firstElementChild)) {
      pseudoStyles.push(...labeledControlGlyphs(element, backdropFor));
    }
    const linkEdge = emphasizeSeparators && raised &&
      raisedSurfaceEdge(style, backdropFor(element), backdropFor(element.parentElement ?? element.getRootNode().host),
        shadow ?? style.boxShadow);
    if (linkEdge) pseudoStyles.push([':not(:focus-visible)', linkEdge]);
    pseudoStyles.push(...iconControlEdges(element, style, backdropFor(element)));
    pseudoStyles.push(...listItemFramePaint(element, backdropFor));
    pseudoStyles.push(...decorativeSolidPaint(element, style));
    pseudoStyles.push(...tabBorderPaints(element, backdrops.solid));
    const separatorBackdrop = horizontalSeparator && !emphasizeSeparators &&
      chromiumTextBackdrop(element.parentElement, backdrops.solid);
    if (separatorBackdrop && luminance(separatorBackdrop) < .18) {
      separators.push(...horizontalSeparatorPaint(style, separatorBackdrop));
      for (const pseudo of ['::before', '::after']) {
        const line = getComputedStyle(element, pseudo);
        if (line.content !== '""') continue;
        const paint = horizontalSeparatorPaint(line, separatorBackdrop);
        if (line.backgroundImage === 'none' && line.clipPath === 'none' && parseFloat(line.height) > 1 &&
            chromiumSrgb(line.backgroundColor)?.[3] > 0 &&
            !parseFloat(line.borderTopWidth) && !parseFloat(line.borderBottomWidth)) {
          paint.push('clip-path: inset(calc(50% - .5px) 0) !important;');
        }
        if (!paint.length) continue;
        const existing = pseudoStyles.find(([selector]) => selector === pseudo);
        if (existing) existing[1] += paint.join('');
        else pseudoStyles.push([pseudo, paint.join('')]);
      }
    }
    const chipBorder = subduedChipBorder(element, style, surface ?? background);
    if (chipBorder) pseudoStyles.push([':not(:focus-visible)', chipBorder]);
    const boxBorder = authoredFrameBorder(element, style, backdropFor(element));
    if (boxBorder) pseudoStyles.push([':not(:focus-visible)', boxBorder]);
    const fieldBorder = subduedFieldBorder(element, style, background, surface);
    if (fieldBorder) pseudoStyles.push([':not(:focus,:user-invalid,:disabled,[aria-invalid="true"])', fieldBorder]);
    const coloredEdge = coloredControlBorder(element, style, backdropFor);
    if (coloredEdge) pseudoStyles.push([':not(:focus-visible)', coloredEdge]);
    for (const pseudo of decorativePseudos(element, style)) {
      if (!pseudoStyles.some(([selector]) => selector === pseudo)) {
        pseudoStyles.push([pseudo, 'filter: brightness(.18) !important;']);
      }
    }
    pseudoStyles.push(...placeholderPaint(element, backdropFor));
    pseudoStyles.push(...selectPopupPaint(element, style, backdropFor));
    const fallbackControlIcon = pseudoStyles.some(([, declarations]) => declarations.includes('translate(-50%'));
    if (!color && !surface && !artworkFilter && !preservePhoto && !gradient && !shadow && !textFill && !isolateLabel &&
        !undimLabel && !lightIcon && !expander && !separators.length && !pseudoStyles.length &&
        !stickyTransition && !imageLabel) return null;
    const declarations = [
      color ? `color: ${rgba(color)} !important;` : '',
      textFill ? `-webkit-text-fill-color: ${rgba(textFill)} !important;` : '',
      surface ? `background-color: ${rgba(surface)} !important;` : '',
      artworkFilter ? `filter: ${artworkFilter} !important;` : '',
      gradient ? `background-image: ${gradient} !important;` : '',
      shadow ? `box-shadow: ${shadow} !important;` : '',
      preservePhoto || isolateLabel ? 'mix-blend-mode: normal !important;' : '',
      lightIcon === 'sprite' ? 'filter: brightness(0) invert(1) !important;' : undimLabel ? 'filter: none !important;' : '',
      expander || '',
      lightIcon === 'mask' ? 'background-color: white !important;' : '',
      fallbackControlIcon && style.position === 'static' ? 'position: relative !important;' : '',
      fallbackControlIcon && /^(?:url|image-set)\(/.test(style.backgroundImage) ? 'background-image: none !important;' : '',
      ...separators,
      imageLabel
    ].filter(Boolean);
    const properties = new Set(['color', ...declarations.map(value => value.split(':', 1)[0])]);
    if (stickyTransition || raised) properties.add('background-color');
    if (chipBorder || fieldBorder) {
      for (const side of ['top', 'right', 'bottom', 'left']) properties.add(`border-${side}-color`);
    }
    const transition = paintTransition(element, style, [...properties]);
    return { declarations: declarations.join(''), transition, pseudoStyles };
  }

  function svgControlContext(element) {
    const host = element.getRootNode().host;
    const parent = element.parentElement;
    let control = element.closest(`${interactive},a[tabindex][aria-haspopup]`);
    const hiddenIcon = element.closest('[aria-hidden="true"]');
    let labeledIcon = false;
    if (!control && !hiddenIcon && element instanceof SVGSVGElement) {
      const box = element.getBoundingClientRect();
      const view = element.viewBox.baseVal;
      const compact = box.width > 0 && box.height > 0 && Math.max(box.width, box.height) <= 48 &&
        Math.min(box.width, box.height) / Math.max(box.width, box.height) >= .5 &&
        view.width > 0 && view.height > 0 && Math.max(view.width, view.height) <= 64;
      if (compact) {
        for (let node = parent, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
          const style = getComputedStyle(node);
          if (style.cursor === 'pointer' && node.clientWidth <= 80 && node.clientHeight <= 80) {
            control = node;
            break;
          }
          if (node.matches(`${heading},dt,label`) &&
              Array.prototype.some.call(node.childNodes, textNode)) {
            labeledIcon = true;
            break;
          }
          if (node.matches('a,button,article,section,figure,picture')) break;
        }
      }
    }
    const labeledHost = host?.parentElement && getComputedStyle(host).cursor === 'pointer' &&
      Array.prototype.some.call(host.parentElement.childNodes, node =>
        node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!(control || labeledIcon || hiddenIcon || host?.closest(interactive) || labeledHost) ||
        element.closest(':disabled,[aria-disabled="true"]') || host?.closest(':disabled,[aria-disabled="true"]')) return null;
    return { parent, host, control };
  }

  function svgIconPaint(element, getBackdrop, simulated = false) {
    if (!svgControlContext(element)) return null;
    const original = chromiumSrgb(getComputedStyle(element).backgroundColor);
    const neutral = original && Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) <= 16;
    const surface = original?.[3] && (simulated ? chromiumColor(original, 'background') :
      neutral && luminance(original) > .35 ?
        [...palettes[preset].surface.slice(1).match(/../g).map(channel => parseInt(channel, 16)), 1] : null);
    const parent = element.parentElement ?? element.getRootNode().host;
    const below = getBackdrop(parent);
    const ownBackdrop = original?.[3] ? (original[3] === 1 ? surface || original :
      below && compositeColor(surface || original, below)) : null;
    const paint = svgGlyphPaint(element, getBackdrop, simulated, ownBackdrop);
    if (!surface) return paint;
    return { declarations: `background-color: ${rgba(surface)} !important;` + (paint?.declarations || ''),
      transition: paint?.transition ?? null, pseudoStyles: paint?.pseudoStyles ?? [] };
  }

  function svgGlyphPaint(element, getBackdrop, simulated, ownBackdrop) {
    const context = svgControlContext(element);
    if (!context) return null;
    for (const nested of element.querySelectorAll('svg')) {
      if (svgLayerBackdrop(nested)) return null;
    }
    const { parent, host, control } = context;
    const localBackdrop = svgLayerBackdrop(element) ?? ownBackdrop;
    const minimum = localBackdrop ? 4.5 : 7;
    const paints = [];
    const ink = monochromeIconColor(element, paints);
    if (!ink) {
      const backdrop = localBackdrop ?? (control && getBackdrop(parent ?? host));
      if (!backdrop || luminance(backdrop) >= .18 || !isTwoToneIcon(element)) return null;
      return { declarations: 'filter: invert(1) !important;', transition: null, pseudoStyles: [] };
    }
    const label = parent && parent === control && Array.prototype.some.call(parent.childNodes, node =>
      node.nodeType === Node.TEXT_NODE && node.textContent.trim()) && authoredBackdropStyle(parent);
    const labelColor = label && chromiumSrgb(label.color);
    const matchesLabel = !localBackdrop && labelColor && label.webkitTextFillColor === label.color &&
      ink.every((channel, index) => channel === labelColor[index]);
    let paint = 'currentColor';
    if (!matchesLabel) {
      const backdrop = localBackdrop ?? getBackdrop(parent ?? host);
      if (!backdrop) return null;
      if (!simulated && Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 12) {
        const base = luminance(backdrop);
        if (contrastRatio(luminance(compositeColor(ink, backdrop)), base) >= minimum) return null;
        return { declarations: `filter: brightness(0)${base < .18 ? ' invert(1)' : ''} !important;`,
          transition: null, pseudoStyles: [] };
      }
      const transformed = simulated && luminance(backdrop) < .18 && chromiumColor(ink, 'foreground');
      const color = readableColor(transformed || ink, backdrop, minimum) ?? transformed;
      if (!color || color.every((channel, index) => channel === ink[index])) return null;
      paint = rgba(color);
    }
    const pseudoStyles = paints.map(([shape, properties]) => {
      const path = [];
      for (let node = shape; node !== element; node = node.parentElement) {
        const index = Array.prototype.indexOf.call(node.parentElement.children, node) + 1;
        path.unshift(` > :nth-child(${index})`);
      }
      return [path.join(''), properties.map(property => `${property}: ${paint} !important;`).join('')];
    });
    return { declarations: matchesLabel ? 'color: inherit !important;' : '', transition: null, pseudoStyles };
  }

  function svgLayerBackdrop(element) {
    if (!element.ownerSVGElement) return null;
    const matrix = element.getScreenCTM();
    const box = element.getBBox();
    if (!matrix || !box.width || !box.height) return null;
    const corners = [
      [box.x, box.y], [box.x + box.width, box.y],
      [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
    for (let root = element.ownerSVGElement; root; root = root.ownerSVGElement) {
      let backdrop = null;
      for (const shape of root.children) {
        if (shape.contains(element)) break;
        if (!['circle', 'rect'].includes(shape.localName)) continue;
        const style = getComputedStyle(shape);
        const ink = chromiumSrgb(style.fill);
        if (!ink || ink[3] !== 1 || Number(style.opacity) !== 1 || Number(style.fillOpacity) !== 1 ||
            style.display === 'none' || style.visibility !== 'visible' || style.filter !== 'none' ||
            style.maskImage !== 'none' || style.clipPath !== 'none') continue;
        const transform = shape.getScreenCTM();
        if (!transform || Math.abs(transform.a * transform.d - transform.b * transform.c) < 1e-10) continue;
        const inverse = transform.inverse();
        const points = corners.map(point => point.matrixTransform(inverse));
        const covers = shape.localName === 'circle' ? points.every(point =>
          Math.hypot(point.x - shape.cx.baseVal.value, point.y - shape.cy.baseVal.value) <= shape.r.baseVal.value) :
          points.every(point => point.x >= shape.x.baseVal.value + shape.rx.baseVal.value &&
            point.x <= shape.x.baseVal.value + shape.width.baseVal.value - shape.rx.baseVal.value &&
            point.y >= shape.y.baseVal.value + shape.ry.baseVal.value &&
            point.y <= shape.y.baseVal.value + shape.height.baseVal.value - shape.ry.baseVal.value);
        if (covers) backdrop = ink;
      }
      if (backdrop) return backdrop;
    }
    return null;
  }

  function controlGlyphPaint(element, controlStyle, getBackdrop) {
    if (element.matches(':disabled,[aria-disabled="true"]')) return [];
    const background = chromiumSrgb(controlStyle.backgroundColor);
    const backdrop = getBackdrop(element) ?? (background?.[3] === 1 ? background : null);
    const direction = carouselDirection(element);
    if (direction) {
      const ink = backdrop && luminance(backdrop) >= .18 ? '#080a0e' : 'white';
      return [['::after', carouselArrow(direction, ink)]];
    }
    if (!backdrop || luminance(backdrop) >= .18) return [];
    const fixes = [];
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (style.content === 'none' || style.content === 'normal') continue;
      const declarations = [];
      const lighten = (property, value) => {
        const color = chromiumSrgb(value);
        if (!color?.[3]) return;
        const ink = luminance(compositeColor(color, backdrop));
        if (contrastRatio(ink, luminance(backdrop)) < 3) declarations.push(`${property}: white !important;`);
      };
      const mask = style.maskImage || style.webkitMaskImage;
      if (mask && mask !== 'none') lighten('background-color', style.backgroundColor);
      if (style.backgroundImage !== 'none' && style.filter === 'none') {
        declarations.push('filter: brightness(0) invert(1) !important;');
      }
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (parseFloat(style[`border${side}Width`]) > 0) {
          lighten(`border-${side.toLowerCase()}-color`, style[`border${side}Color`]);
        }
      }
      if (/^"[-]"$/.test(style.content)) {
        const original = chromiumSrgb(style.color);
        let host = chromiumSrgb(controlStyle.color);
        if (host && preset === 'chromium') host = chromiumColor(host, 'foreground') ?? host;
        // Keep a readable font glyph guarded even while an ancestor changes
        // state. Conditional repairs otherwise disappear when sampling sees
        // inherited theme ink, exposing a later dark authored scroll state.
        const followsHost = style.color === controlStyle.color || (original &&
          Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) <= 24);
        const ink = followsHost && host?.[3] &&
          contrastRatio(luminance(compositeColor(host, backdrop)), luminance(backdrop)) >= 4.5 ? host :
          contrastingGlyphInk(original, backdrop, 4.5, true) ?? original;
        if (original?.[3] && ink) declarations.push(`color: ${rgba(ink)} !important;`);
      } else if (style.content !== '""') lighten('color', style.color);
      if (declarations.length) fixes.push([pseudo, declarations.join('')]);
    }
    return fixes;
  }

  function placeholderPaint(element, getBackdrop, minimum = 4.5) {
    if (!element.matches('input[placeholder],textarea[placeholder]') ||
        element.matches(':disabled,[aria-disabled="true"]')) return [];
    const backdrop = getBackdrop(element);
    const placeholder = getComputedStyle(element, '::placeholder');
    const ink = chromiumSrgb(placeholder.webkitTextFillColor);
    if (!backdrop || !ink?.[3]) return [];
    const opacity = Number(placeholder.opacity);
    const search = element.matches('input[type="search"]') || element.closest('[role="search"],search');
    const readable = readableColor([...ink.slice(0, 3), ink[3] * opacity], backdrop, search ? 10 : minimum);
    return readable ? [['::placeholder',
      `color: ${rgba(readable)} !important; -webkit-text-fill-color: ${rgba(readable)} !important; opacity: 1 !important;`]] : [];
  }

  function selectPopupPaint(element, style, getBackdrop) {
    if (!(element instanceof HTMLSelectElement) || element.multiple || element.size > 1 ||
        element.matches(':disabled,[aria-disabled="true"]') || element.options.length > 256) return [];
    const backdrop = getBackdrop(element);
    if (!backdrop || luminance(backdrop) >= .18) return [];
    const source = authoredBackdropStyle(element);
    // Popup options do not paint on the select's transparent page backdrop.
    // Only supply a shared backing for otherwise unstyled menus; custom option
    // colors and listboxes remain in the normal element-by-element paint path.
    for (const option of element.querySelectorAll('option,optgroup')) {
      const paint = authoredBackdropStyle(option);
      if (paint.backgroundImage !== 'none' || chromiumSrgb(paint.backgroundColor)?.[3] !== 0 ||
          (paint.color !== source.color && paint.color !== style.color) ||
          paint.webkitTextFillColor !== paint.color) return [];
    }
    return [
      ['', 'color-scheme: dark !important;'],
      [' :is(option,optgroup)', `background-color: ${rgba(backdrop)} !important;`],
      [' :is(option,optgroup):not(:disabled)', 'color: inherit !important; -webkit-text-fill-color: inherit !important;']
    ];
  }

  function expanderPaint(element, style, getBackdrop) {
    if (!isExpanderGlyph(element)) return '';
    const backdrop = getBackdrop(element.parentElement) ?? getBackdrop(document.documentElement);
    return backdrop && luminance(backdrop) < .18 ?
      `filter: ${style.filter === 'none' ? '' : style.filter + ' '}invert(1) !important;` : '';
  }

  function labeledControlGlyphs(element, getBackdrop) {
    if (element.matches(':disabled,[aria-disabled="true"]')) return [];
    const paint = [];
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (/^"[-]"$/.test(style.content)) {
        const ink = contrastingGlyphInk(chromiumSrgb(style.color), getBackdrop(element), 4.5, true);
        if (ink) paint.push([pseudo, `color: ${rgba(ink)} !important;`]);
        continue;
      }
      const width = parseFloat(style.width), height = parseFloat(style.height);
      if (style.content !== '""' || !(width > 0 && height > 0 && Math.max(width, height) <= 48)) continue;
      const sides = paintedBorderSides(style);
      if (style.backgroundImage === 'none' && chromiumSrgb(style.backgroundColor)?.[3] === 0 &&
          Math.max(width, height) <= 16 && style.transform !== 'none' && sides.length === 2 &&
          sides.every(side => style[`border${side}Style`] === 'solid' && parseFloat(style[`border${side}Width`]) <= 3)) {
        const declarations = sides.map(side => {
          const ink = contrastingGlyphInk(chromiumSrgb(style[`border${side}Color`]), getBackdrop(element), 7, true);
          return ink ? `border-${side.toLowerCase()}-color: ${rgba(ink)} !important;` : '';
        }).join('');
        if (declarations) paint.push([pseudo, declarations]);
      }
      const glyph = backgroundSvgGlyph(style, true);
      const backdrop = glyph && getBackdrop(element);
      const image = contrastingSvgBackground(glyph, backdrop, 7);
      if (image) paint.push([pseudo, `background-image: ${image} !important;`]);
    }
    const source = authoredBackdropStyle(element);
    const glyph = elementBackgroundGlyph(element, source);
    if (glyph && labeledPointerControl(element, source) && element.clientWidth <= 48 && element.clientHeight <= 48) {
      const backdrop = getBackdrop(element);
      const declarations = paintedBorderSides(source).map(side => {
        if (source[`border${side}Style`] !== 'solid' || parseFloat(source[`border${side}Width`]) > 2) return '';
        const ink = contrastingGlyphInk(chromiumSrgb(source[`border${side}Color`]), backdrop, 4.5, true);
        return ink ? `border-${side.toLowerCase()}-color: ${rgba(ink)} !important;` : '';
      }).join('');
      if (declarations) paint.push([':not(:focus-visible)', declarations]);
    }
    return paint;
  }

  function paintTransition(element, style, properties) {
    let original = (elementColorRules.get(element)?.transition ?? paletteTransitions.get(element))?.original;
    if (!original) {
      const authored = style.transitionProperty.split(', ');
      if (!authored.includes('all') && !properties.some(property =>
        authored.includes(property) || (property.startsWith('background-') && authored.includes('background')) ||
        (/^border-(top|right|bottom|left)-color$/.test(property) &&
          ['border', 'border-color', property.slice(0, -6)].some(shorthand => authored.includes(shorthand))))) return null;
      if ([style.transitionDuration, style.transitionDelay].every(list =>
        list.split(',').every(value => Number.parseFloat(value) === 0))) return null;
      original = style.transition;
      if (!original) return null;
    }
    // The last matching transition wins, including when the author's list uses "all".
    const overrides = properties.map(property => `${property} 0s`);
    return { original, guard: [original, ...overrides].join(', ') };
  }

  function clearColorRule(element) {
    const entry = elementColorRules.get(element);
    if (!entry) return;
    elementColorRules.delete(element);
    if (--entry.users === 0) {
      colorRules.delete(entry.key);
      entry.rule.style.cssText = '';
      for (const rule of entry.pseudoRules.values()) rule.style.cssText = '';
      if (entry.transitionRule) entry.transitionRule.style.cssText = '';
      unusedColorRules.push(entry);
    }
    marked.delete(element);
    element.removeAttribute(marker);
    element.removeAttribute(transitionMarker);
  }

  function applyChromiumColors(updates) {
    for (const [element, paint] of updates) {
      const key = paint && `${paint.declarations}\n${paint.transition?.guard ?? ''}\n${JSON.stringify(paint.pseudoStyles)}`;
      if (elementColorRules.get(element)?.key === key) continue;
      clearColorRule(element);
      if (!paint) continue;
      let entry = colorRules.get(key);
      if (!entry) {
        entry = unusedColorRules.pop();
        if (!entry) {
          const index = sheet.cssRules.length;
          const token = `chromium-${index}`;
          const selector = `[${marker}="${token}"]:not(#native-dark-mode-priority#native-dark-mode-priority)`;
          sheet.insertRule(`${selector} {}`, index);
          entry = { token, selector, rule: sheet.cssRules[index], pseudoRules: new Map(), users: 0 };
        }
        entry.rule.style.cssText = paint.declarations;
        for (const [pseudo, declarations] of paint.pseudoStyles) {
          if (!entry.pseudoRules.has(pseudo)) {
            const index = sheet.cssRules.length;
            sheet.insertRule(`${entry.selector}${pseudo} {}`, index);
            entry.pseudoRules.set(pseudo, sheet.cssRules[index]);
          }
          entry.pseudoRules.get(pseudo).style.cssText = declarations;
        }
        entry.key = key;
        entry.transition = paint.transition;
        if (paint.transition) {
          if (!entry.transitionRule) {
            const index = transitionSheet.cssRules.length;
            transitionSheet.insertRule(
              `[${transitionMarker}="${entry.token}"]:not(#native-dark-mode-priority#native-dark-mode-priority) {}`, index);
            entry.transitionRule = transitionSheet.cssRules[index];
          }
          entry.transitionRule.style.setProperty('transition', paint.transition.guard, 'important');
        }
        colorRules.set(key, entry);
      }
      entry.users++;
      elementColorRules.set(element, entry);
      marked.add(element);
      element.setAttribute(marker, entry.token);
      if (paint.transition) element.setAttribute(transitionMarker, entry.token);
    }
  }

  const observationOptions = { subtree: true, childList: true, characterData: true,
    attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'data-theme', 'href',
      'aria-current', 'aria-selected', 'aria-label', 'aria-disabled', 'aria-hidden', 'aria-expanded'] };
  const chromiumObservationOptions = { subtree: true, childList: true, characterData: true,
    attributes: true, attributeOldValue: true };

  function schedule(root) {
    if (root?.isConnected && (root.getRootNode() !== document || !pending.has(document.documentElement))) {
      if (root === document.documentElement) {
        for (const queued of pending) {
          if (queued.getRootNode() === document) pending.delete(queued);
        }
      }
      pending.add(root);
    }
    if (idleBatch === undefined && horizontalScrollTimer === undefined) {
      idleBatch = requestIdleCallback(paintBatch, { timeout: 100 });
    }
  }

  function inspectLocal(elements, switchingRenderer = false) {
    const batch = new Set(elements);
    for (const element of elements) {
      if (!element.matches('li > button') || !/^\d+$/.test(element.textContent.trim())) continue;
      const list = element.parentElement.parentElement;
      if (!list?.matches('ul,ol,[role="list"]') || list.childElementCount > 24) continue;
      // Read the page's selection paint for the whole group before restoring any overrides.
      for (const button of list.querySelectorAll(':scope > li > button')) batch.add(button);
    }
    elements = [...batch];
    const previous = [];
    const headings = [];
    for (const element of elements) {
      const paint = element.getAttribute(marker);
      if (paint !== null) {
        previous.push([element, paint]);
        element.removeAttribute(marker);
      }
      if (preset !== 'chromium' && element.matches(heading)) {
        headings.push(element);
        element.setAttribute(sampleMarker, '');
      }
    }
    const backdrops = { images: new Map(), solid: new Map() };
    try {
      return elements.map(element => [element, inspect(element, backdrops, switchingRenderer)]);
    } finally {
      for (const [element, paint] of previous) element.setAttribute(marker, paint);
      for (const element of headings) element.removeAttribute(sampleMarker);
    }
  }

  function paintVisibleSurfaces(onlyUnpainted = false, includeLookahead = preset !== 'chromium', switchingRenderer = false,
    changedRoots) {
    const updates = [];
    const local = new Set();
    const backdrops = { images: new Map(), solid: new Map() };
    const roots = changedRoots ?? new Set([document]);
    const lookahead = includeLookahead ? innerHeight * (preset === 'chromium' ? 1.25 : .75) : 0;
    const horizontalLookahead = includeLookahead && preset === 'chromium' ? innerWidth * .5 : 0;
    try {
      for (const root of roots) {
        if (changedRoots && (!root.isConnected || roots.has(root.parentElement))) continue;
        for (const element of changedRoots ? [root, ...root.querySelectorAll('*')] : root.querySelectorAll('*')) {
          if (onlyUnpainted && sampledElements.has(element)) continue;
          if (!(element instanceof HTMLElement || element instanceof SVGSVGElement) ||
              element.matches(excluded)) continue;
          const rect = element.getBoundingClientRect();
          const inViewport = rect.width && rect.height && rect.bottom > -lookahead && rect.right > -horizontalLookahead &&
            rect.top < innerHeight + lookahead && rect.left < innerWidth + horizontalLookahead;
          const canvas = preset === 'chromium' && (element === document.documentElement || element === document.body);
          if (inViewport || canvas) {
            if (changedRoots || onlyUnpainted) local.add(element);
            else {
              if (updates.length === 0) sheet.disabled = true;
              updates.push([element, inspect(element, backdrops, switchingRenderer)]);
            }
          }
        }
        if (!changedRoots) {
          for (const shadow of shadowRoots) {
            if (shadow.host.isConnected) roots.add(shadow);
          }
        }
      }
    } finally {
      sheet.disabled = false;
    }
    applyRoles(local.size ? inspectLocal([...local], switchingRenderer) : updates);
  }

  function scheduleVisibleSurfaces(event) {
    const target = event?.type === 'scroll' && event.target;
    if (target instanceof Element) {
      const offset = target.scrollLeft;
      const previous = scrollOffsets.get(target) ?? 0;
      scrollOffsets.set(target, offset);
      if (offset !== previous) {
        // Already painted content moves with its scroller. Batch new paint work after it settles.
        clearTimeout(horizontalScrollTimer);
        horizontalScrollTimer = setTimeout(() => {
          horizontalScrollTimer = undefined;
          scheduleViewport(true);
          if (elements || pending.size) schedule();
        }, 80);
        return;
      }
    }
    scheduleViewport(true);
  }

  function refreshHoverPaint(event) {
    const path = event.composedPath();
    const crossed = element => !(event.relatedTarget instanceof Node && element.contains(event.relatedTarget));
    const control = path.find(node => node instanceof HTMLElement && node.matches(interactive));
    if (control && crossed(control) && (raisedLinks.has(control) || control.closest('nav,[role="navigation"]') ||
        control.querySelector('svg') || compactTextControl(control))) {
      hoverTargets.add(control);
    }
    for (const node of path) {
      if (!(node instanceof HTMLElement) || node === control || !node.childElementCount || !crossed(node)) continue;
      const overflow = getComputedStyle(node).overflowX;
      // A carousel can paint its clipping surface only while the pointer is inside it.
      if (['hidden', 'clip'].includes(overflow) && node.scrollWidth > node.clientWidth) hoverTargets.add(node);
    }
    if (!hoverTargets.size || hoverFrame !== undefined) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = undefined;
      // :hover can change the authored background without changing any DOM attributes.
      const targets = [...hoverTargets].filter(element => element.isConnected);
      hoverTargets.clear();
      // A button's state can change its glyph ink and its backing independently.
      for (const control of [...targets]) {
        if (!control.matches(interactive) || !control.querySelector('svg')) continue;
        const descendants = control.querySelectorAll('*');
        if (descendants.length <= 64) targets.push(...descendants);
      }
      applyRoles(inspectLocal(targets, true));
    });
  }

  function paintBatch(idleDeadline) {
    idleBatch = undefined;
    if (horizontalScrollTimer !== undefined) return;
    if (!idleDeadline.didTimeout && idleDeadline.timeRemaining() < 1) {
      schedule();
      return;
    }
    const started = performance.now();
    // A deadline checked only before collecting 64 nodes can still monopolize
    // an animation frame. Sample small groups and recheck between style reads.
    do {
      const batch = new Set();
      while (batch.size < 4) {
        if (!elements) {
          const root = pending.values().next().value;
          if (!root) break;
          pending.delete(root);
          if (!root.isConnected) continue;
          if (pending.has(root.parentElement) || pending.has(root.parentElement?.parentElement)) continue;
          // A static list lets the rest of the subtree continue if the page removes a node.
          elements = root.querySelectorAll('*').values();
          if (root.nodeType === Node.ELEMENT_NODE && root !== document.documentElement && root !== document.body) batch.add(root);
        } else {
          const { value: element, done } = elements.next();
          if (done) elements = undefined;
          else if (element.isConnected && element !== document.body && !element.matches(excluded)) batch.add(element);
        }
      }
      applyRoles(inspectLocal([...batch]));
    } while ((elements || pending.size) && performance.now() - started < 6 &&
      !idleDeadline.didTimeout && idleDeadline.timeRemaining() >= 2);
    if (elements || pending.size) schedule();
  }

  function palettePaintRole(declarations, pseudoStyles = [], rules) {
    const key = JSON.stringify([declarations, pseudoStyles]);
    let token = palettePaintRules.get(key);
    if (!token) {
      token = `paint-${palettePaintRules.size}`;
      const selector = `[${marker}~="${token}"]:not(#native-dark-mode-priority#native-dark-mode-priority)`;
      if (declarations) rules.push(`${selector} { ${declarations} }`);
      for (const [suffix, paint] of pseudoStyles) {
        rules.push(`${selector}${suffix} { ${paint} }`);
      }
      palettePaintRules.set(key, token);
    }
    return token;
  }

  function applyRoles(updates) {
    if (preset === 'chromium') {
      applyChromiumColors(updates);
      return;
    }
    const rules = [];
    for (const update of updates) {
      const [element] = update;
      let roles = update[1];
      if (!roles) {
        if (marked.delete(element)) {
          element.removeAttribute(marker);
          element.removeAttribute(transitionMarker);
          paletteTransitions.delete(element);
        }
        continue;
      }
      const fade = paletteFades.get(element);
      if (fade) roles += ` ${palettePaintRole(`background-image: ${fade} !important;`, [], rules)}`;
      const repair = paletteRepairs.get(element);
      if (repair) roles += ` ${palettePaintRole(...repair, rules)}`;
      update[1] = roles;
      if (element.getAttribute(marker) !== roles) element.setAttribute(marker, roles);
      marked.add(element);
      const transition = paletteTransitions.get(element);
      if (!transition) continue;
      let token = paletteTransitionRules.get(transition.guard);
      if (token === undefined) {
        token = String(paletteTransitionRules.size);
        transitionSheet.insertRule(`[${transitionMarker}="${token}"]:not(#native-dark-mode-priority#native-dark-mode-priority) {}`,
          transitionSheet.cssRules.length);
        transitionSheet.cssRules[transitionSheet.cssRules.length - 1].style.setProperty('transition', transition.guard, 'important');
        paletteTransitionRules.set(transition.guard, token);
      }
      if (element.getAttribute(transitionMarker) !== token) element.setAttribute(transitionMarker, token);
    }
    for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length);
    repairTextContrast(updates);
  }

  function srgb(value) {
    const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)] : null;
  }

  function chromiumSrgb(value) {
    const legacy = srgb(value);
    if (legacy) return legacy;
    const match = /^color\(srgb ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)(?: \/ ([\d.e+-]+))?\)$/.exec(value);
    if (!match) return null;
    const [, r, g, b, alpha = 1] = match;
    const channels = [r, g, b, alpha].map(Number);
    if (!channels.every(channel => channel >= 0 && channel <= 1)) return null;
    return [channels[0] * 255, channels[1] * 255, channels[2] * 255, channels[3]];
  }

  function luminance(color) {
    const linear = color.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }

  function isExpanderGlyph(element) {
    if (!element.matches('i:empty:not([role="img"])')) return false;
    const control = element.parentElement;
    if (!control?.matches(`:is(${interactive})[aria-expanded]:not(:disabled,[aria-disabled="true"])`) ||
        !control.textContent.trim()) return false;
    const { width, height } = element.getBoundingClientRect();
    return width > 0 && height > 0 && width <= 24 && height <= 24;
  }

  function controlSprite(element, style) {
    if (!element.matches('i,span,div,a,button')) return null;
    if (!element.matches('i') && (element.childElementCount || element.textContent.trim())) return null;
    const mask = style.maskImage || style.webkitMaskImage;
    const masked = mask && mask !== 'none';
    // Some image links use an inline background instead of an img element.
    const imageLink = element.matches('a[href]:not([href=""],[href^="#"])') &&
      element.style.backgroundImage && (!element.hasAttribute('aria-label') || /^(cover|contain)$/.test(style.backgroundSize));
    const flag = element.matches('[role="img"]') && /(?:^|[\s_-])flag(?:$|[\s_-])/i.test(element.className);
    const sprite = /^(?:url|image-set)\(/.test(style.backgroundImage) &&
      !imageLink && !flag &&
      (style.backgroundRepeat === 'no-repeat' || style.backgroundPosition !== '0% 0%') &&
      chromiumSrgb(style.backgroundColor)?.[3] === 0 &&
      !element.closest('[id*="logo" i], [class*="logo" i], [id*="avatar" i], [class*="avatar" i]');
    if (!masked && !sprite) return null;
    const control = element.closest(interactive);
    if ((!control && style.cursor !== 'pointer') || element.closest(':disabled,[aria-disabled="true"]')) return null;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height || width > 48 || height > 48) return null;
    return masked ? 'mask' : 'sprite';
  }

  function monochromeIconColor(element, paints) {
    if (getComputedStyle(element).filter !== 'none' || element.querySelector('use,foreignObject')) return null;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height || width > 48 || height > 48) return null;
    for (const image of element.querySelectorAll('image')) {
      // SVG images load from href (including legacy xlink:href), not src.
      if (image instanceof SVGImageElement && !image.href.animVal.trim()) continue;
      const style = getComputedStyle(image);
      if (style.display !== 'none' && style.visibility === 'visible') return null;
    }
    let ink;
    for (const shape of element.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')) {
      // Definition geometry clips the glyph; its fill is not visible artwork.
      if (shape.closest('defs,clipPath,mask')) continue;
      const style = getComputedStyle(shape);
      const properties = [];
      for (const property of ['fill', 'stroke']) {
        const paint = style[property];
        if (paint === 'none') continue;
        const color = srgb(paint);
        if (!color || (ink && color.some((channel, index) => channel !== ink[index]))) return null;
        ink = color;
        if (paints) properties.push(property);
      }
      if (properties.length) paints.push([shape, properties]);
    }
    return ink;
  }

  function isTwoToneIcon(element) {
    if (getComputedStyle(element).filter !== 'none' || element.querySelector('image,use,foreignObject,text')) return false;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height || width > 48 || height > 48) return false;
    const tones = new Set();
    for (const shape of element.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')) {
      if (shape.closest('defs,clipPath,mask')) continue;
      const style = getComputedStyle(shape);
      for (const paint of [style.fill, style.stroke]) {
        if (paint === 'none') continue;
        const color = srgb(paint);
        if (!color || color[3] !== 1 || Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 12) return false;
        const light = luminance(color);
        if (light > .1 && light < .8) return false;
        tones.add(light >= .8);
      }
    }
    return tones.size === 2;
  }

  function repairTextContrast(updates) {
    const rules = [];
    const backgrounds = new Map();
    function backdrop(element) {
      return textBackdrop(element, backgrounds);
    }

    const fixes = [];
    const minimum = preset === 'contrast' ? 7 : 4.5;
    for (const update of updates) {
      const [element, roles] = update;
      if (!roles?.includes(' light-card-label')) continue;
      const background = backdrop(element);
      if (!background) continue;
      const darker = readableColor(background, [255, 255, 255, 1], minimum);
      let token = '';
      if (darker) {
        const paint = rgba(darker);
        if (!paletteLabelRules.has(paint)) {
          const id = `card-label-${paletteLabelRules.size}`;
          rules.push(`[${marker}~="${id}"]:not(#native-dark-mode-priority#native-dark-mode-priority) {
            background-color: ${paint} !important;
          }`);
          paletteLabelRules.set(paint, id);
        }
        token = ` ${paletteLabelRules.get(paint)}`;
      }
      update[1] = `${roles} white-card-label${token}`;
      fixes.push([element, update[1]]);
    }
    for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length);
    for (const [element, roles] of fixes) element.setAttribute(marker, roles);
    rules.length = fixes.length = 0;
    backgrounds.clear();
    for (const [element, roles] of updates) {
      if (roles === 'control-icon') {
        const paint = svgIconPaint(element, backdrop);
        if (paint) fixes.push([element, `${roles} ${palettePaintRole(paint.declarations, paint.pseudoStyles, rules)}`]);
        continue;
      }
      if (!roles) continue;
      let repaired = roles;
      const style = getComputedStyle(element);
      const hasText = Array.prototype.some.call(element.childNodes, textNode);
      const select = element instanceof HTMLSelectElement;
      const direction = carouselDirection(element);
      let icon = null;
      if (!direction && element.matches('i,span,div,a,button') &&
          (element.matches('i') || (!element.childElementCount && !element.textContent.trim()))) {
        icon = controlSprite(element, style);
        const background = icon && backdrop(element.parentElement);
        if (background && luminance(background) < .18) {
          repaired += icon === 'mask' ? ' icon-mask-light' : ' icon-light';
        }
      }
      const glyph = ((direction || select || hasText || wrappedBackgroundGlyphLabel(element, style)) &&
        elementBackgroundGlyph(element, style)) || externalSvgGlyph(element, style);
      if (glyph) {
        const image = contrastingSvgBackground(glyph, backdrop(glyph.external ? element.parentElement : element),
          glyph.external ? 10 : 7, Boolean(glyph.external || direction || select));
        if (image) repaired += ` ${palettePaintRole(`background-image: ${image} !important;`, [], rules)}`;
      } else if (direction) {
        const backdropColor = backdrop(element) ?? backdrop(element.parentElement);
        if (!backdropColor || luminance(backdropColor) < .18) {
          repaired += ` carousel-${direction}`;
          if (style.position === 'static') repaired += ' carousel-position';
          if (/^(?:url|image-set)\(/.test(style.backgroundImage)) repaired += ' carousel-sprite';
        }
      }
      const pseudoStyles = labeledGlyphHost(element, style) && (hasText || element.firstElementChild) ?
        labeledControlGlyphs(element, backdrop) : [];
      if (!direction && element.matches(interactive) && element.hasAttribute('aria-label') &&
          !element.childElementCount && !element.textContent.trim()) {
        pseudoStyles.push(...controlGlyphPaint(element, style, backdrop));
      }
      pseudoStyles.push(...placeholderPaint(element, backdrop, minimum));
      pseudoStyles.push(...selectPopupPaint(element, style, backdrop));
      pseudoStyles.push(...iconControlEdges(element, style, backdrop(element)));
      pseudoStyles.push(...listItemFramePaint(element, backdrop));
      const coloredEdge = coloredControlBorder(element, style, backdrop);
      if (coloredEdge) pseudoStyles.push([':not(:focus-visible)', coloredEdge]);
      if (roles.includes(' raised-link')) {
        const parent = element.parentElement ?? element.getRootNode().host;
        const edge = raisedSurfaceEdge(style, backdrop(element), backdrop(parent), style.boxShadow);
        if (edge) pseudoStyles.push([':not(:focus-visible)', edge]);
      }
      const filter = element instanceof HTMLImageElement ? linkedGlyphFilter(element, style, backdrop) : '';
      const expander = !icon && expanderPaint(element, style, backdrop);
      if (filter || expander || pseudoStyles.length) {
        repaired += ` ${palettePaintRole((filter ? `filter: ${filter} !important;` : '') + (expander || ''), pseudoStyles, rules)}`;
      }
      if (roles.includes(' breadcrumb') && !backdrop(element)) {
        repaired += ' breadcrumb-backdrop';
      }
      if (roles.includes(' card')) {
        const color = backdrop(element);
        const parent = backdrop(element.assignedSlot ?? element.parentElement ?? element.getRootNode().host);
        if (color && parent) {
          if (contrastRatio(luminance(color), luminance(parent)) < 1.5) {
            if (roles.includes(' card-outline')) repaired += ' card-edge';
            repaired += roles.includes(' raised') ? ' card-recessed' : ' card-raised';
          }
        }
      }
      if (repaired !== roles) fixes.push([element, repaired]);
      if (roles.includes(' image-label') || !(hasText || select)) continue;
      if (element.closest('[disabled], [aria-disabled="true"]')) continue;
      const color = srgb(getComputedStyle(element).webkitTextFillColor);
      const background = backdrop(element);
      if (!color?.[3]) continue;
      const accent = authoredAccentInk(element, background, minimum);
      if (accent) {
        fixes.push([element, `${repaired} ${palettePaintRole(`color: ${rgba(accent)} !important; -webkit-text-fill-color: ${rgba(accent)} !important;`, [], rules)}`]);
        continue;
      }
      if (!background) {
        // An image can vary behind each letter. Give real headings a solid backing.
        if (element.closest('h1, h2, h3, h4, h5, h6, [role="heading"]') &&
            getComputedStyle(element).backgroundImage === 'none') {
          fixes.push([element, `${repaired} heading-backdrop readable-light`]);
        }
        continue;
      }
      const foreground = compositeColor(color, background);
      const base = luminance(background);
      if (contrastRatio(luminance(foreground), base) >= minimum) continue;
      fixes.push([element, `${repaired} readable-${base + .05 > Math.sqrt(.05 * 1.05) ? 'dark' : 'light'}`]);
    }
    for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length);
    for (const [element, roles] of fixes) element.setAttribute(marker, roles);
  }

  function stylesLoaded(event) {
    if (event.target instanceof HTMLImageElement) {
      artworkContrast.delete(event.target);
      const wrapper = event.target.parentElement;
      if (preset === 'chromium' && wrapper?.childElementCount === 1 && sampledElements.has(wrapper)) schedule(wrapper);
      else if (wrapper?.matches(`${heading},a[href]`) && sampledElements.has(event.target)) schedule(event.target);
      const labels = overlayLabels.get(event.target);
      for (const label of labels ?? []) {
        if (label.isConnected) scheduleDirtySurface(label);
        else labels.delete(label);
      }
      return;
    }
    if (!event.target.matches?.('link[rel~="stylesheet"]')) return;
    if (preset === 'chromium') refreshChromium();
    else {
      scheduleViewport();
      scheduleDocument();
    }
  }

  function scheduleDocument() {
    schedule(document.documentElement);
  }

  function scheduleDirtySurface(root) {
    dirtySurfaces.add(root);
    sampledElements.delete(root);
    requestViewportFrame();
  }

  function scheduleViewport(onlyUnpainted = false, preloadAfter = false) {
    viewportRequested = true;
    viewportNeedsResample ||= !onlyUnpainted;
    viewportLookahead ||= onlyUnpainted || preset !== 'chromium';
    viewportPreloadAfter ||= preloadAfter;
    requestViewportFrame();
  }

  function requestViewportFrame() {
    if (viewportFrame !== undefined || horizontalScrollTimer !== undefined) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = undefined;
      if (horizontalScrollTimer !== undefined) return;
      // Apply the viewport together before paint. Offscreen elements stay in the time-sliced scan.
      const onlyUnpainted = !viewportNeedsResample;
      const includeLookahead = viewportLookahead;
      const preload = viewportPreloadAfter;
      const repaintViewport = viewportRequested;
      viewportRequested = viewportNeedsResample = viewportLookahead = viewportPreloadAfter = false;
      if (dirtySurfaces.size) {
        const roots = new Set(dirtySurfaces);
        dirtySurfaces.clear();
        if (!repaintViewport || onlyUnpainted) paintVisibleSurfaces(false, false, false, roots);
      }
      if (repaintViewport) paintVisibleSurfaces(onlyUnpainted, includeLookahead);
      if (preload) scheduleViewport(true);
    });
  }

  function refreshChromium() {
    if (chromiumRefreshTimer === undefined) {
      chromiumRefreshTimer = setTimeout(() => {
        chromiumRefreshTimer = undefined;
        scheduleViewport();
        scheduleDocument();
      }, 80);
    }
  }

  function movementStyle(value) {
    // Carousel libraries update position on every animation frame.
    return (value ?? '').replace(/(^|;)\s*(?:transform|translate|left|top)\s*:[^;]*(?=;|$)/gi, '$1')
      .replace(/(?:;\s*)+$/g, '').trim();
  }

  function updateSeparatorPreference(value) {
    const next = Object.hasOwn(separatorLevels, value) ? value : false;
    if (emphasizeSeparators === next) return;
    emphasizeSeparators = next;
    if (preset !== 'chromium') {
      sheet.replaceSync(paletteCSS(palettes[preset]));
      palettePaintRules.clear();
      paletteLabelRules.clear();
      sampledElements = new WeakSet();
      paintVisibleSurfaces();
      scheduleDocument();
      return;
    }
    scheduleViewport();
    refreshChromium();
  }

  function setPreset(next, immediate = false, separators = false) {
    if (next !== 'chromium' && !Object.hasOwn(palettes, next)) next = undefined;
    const switchingRenderer = sheet && next && next !== preset && [next, preset].includes('chromium');
    if (switchingRenderer) setPreset();
    if (sheet && next && !document.adoptedStyleSheets.includes(sheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }
    if (transitionSheet && next && !document.adoptedStyleSheets.includes(transitionSheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, transitionSheet];
    }
    if (preset === next) {
      if (next) updateSeparatorPreference(separators);
      return;
    }
    preset = next;
    emphasizeSeparators = Boolean(next) && Object.hasOwn(separatorLevels, separators) && separators;
    if (!next) {
      observer.disconnect();
      document.removeEventListener('load', stylesLoaded, true);
      document.removeEventListener('DOMContentLoaded', scheduleVisibleSurfaces);
      document.removeEventListener('scroll', scheduleVisibleSurfaces, true);
      document.removeEventListener('pointerover', refreshHoverPaint, true);
      document.removeEventListener('pointerout', refreshHoverPaint, true);
      window.removeEventListener('resize', refreshChromium);
      cancelIdleCallback(idleBatch);
      clearTimeout(chromiumRefreshTimer);
      clearTimeout(horizontalScrollTimer);
      cancelAnimationFrame(viewportFrame);
      cancelAnimationFrame(hoverFrame);
      hoverFrame = undefined;
      hoverTargets.clear();
      dirtySurfaces.clear();
      viewportFrame = chromiumRefreshTimer = horizontalScrollTimer = undefined;
      viewportRequested = viewportNeedsResample = viewportLookahead = viewportPreloadAfter = false;
      idleBatch = elements = undefined;
      pending.clear();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(style => style !== sheet && style !== transitionSheet);
      for (const root of shadowRoots) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(style => style !== sheet && style !== transitionSheet);
      }
      shadowRoots.clear();
      for (const element of marked) {
        element.removeAttribute(marker);
        element.removeAttribute(transitionMarker);
        paletteTransitions.delete(element);
      }
      marked.clear();
      sampledElements = new WeakSet();
      chromiumColorCache.clear();
      paletteTransitionRules.clear();
      palettePaintRules.clear();
      paletteLabelRules.clear();
      elementColorRules.clear();
      colorRules.clear();
      unusedColorRules.length = 0;
      sheet = transitionSheet = undefined;
      return;
    }
    if (sheet) {
      sheet.replaceSync(paletteCSS(palettes[next]));
      palettePaintRules.clear();
      paletteLabelRules.clear();
      sampledElements = new WeakSet();
      paintVisibleSurfaces(false, true, true);
      scheduleDocument();
      return;
    }
    sheet = new CSSStyleSheet();
    sheet.replaceSync(next === 'chromium' ? `:root { ${chromiumProbe}: yes !important; color-scheme: dark; }` : paletteCSS(palettes[next]));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    // Keep transition overrides active while the paint sheet is disabled for sampling.
    transitionSheet = new CSSStyleSheet();
    transitionSheet.replaceSync(`:root { ${transitionProbe}: yes; }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, transitionSheet];
    observer = new MutationObserver(records => {
      if (preset === 'chromium') {
        let removed = false;
        for (const record of records) {
          const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
          if (record.type === 'attributes') {
            const attribute = record.attributeName;
            if (attribute === marker || attribute === transitionMarker || attribute === sampleMarker) continue;
            const value = target.getAttributeNS(record.attributeNamespace, attribute);
            if (record.oldValue === value ||
                (attribute === 'style' && movementStyle(record.oldValue) === movementStyle(value))) continue;
            if (!['class', 'style', 'hidden', 'id', 'dir', 'disabled', 'open', 'href'].includes(attribute) &&
                !attribute.startsWith('aria-') && !/^data-(?:theme|state|open|active|disabled|selected|expanded|current)$/.test(attribute)) continue;
            if (target === document.documentElement || target === document.body || target.matches('style,link[rel~="stylesheet"]')) {
              refreshChromium();
              continue;
            }
            if (['class', 'style', 'hidden', 'data-theme', 'open', 'aria-hidden', 'aria-expanded'].includes(attribute) && sampledElements.delete(target)) {
              scheduleDirtySurface(target);
            }
            schedule(target);
            continue;
          }
          if (target?.closest('style') || target === document.head) {
            refreshChromium();
          } else if (record.type === 'characterData') {
            schedule(target);
          } else {
            for (const node of record.addedNodes) {
              if (node instanceof HTMLStyleElement || node.matches?.('link[rel~="stylesheet"]')) refreshChromium();
              if (node.nodeType !== Node.ELEMENT_NODE) continue;
              schedule(node);
              scheduleDirtySurface(node);
            }
            if (target !== document.body && target?.childElementCount <= 12) schedule(target);
          }
          if (record.removedNodes.length) removed = true;
        }
        if (!removed) return;
        for (const element of marked) {
          if (!element.isConnected) clearColorRule(element);
        }
        let removedShadow = false;
        for (const root of shadowRoots) {
          if (root.host.isConnected) continue;
          root.adoptedStyleSheets = root.adoptedStyleSheets.filter(style => style !== sheet && style !== transitionSheet);
          shadowRoots.delete(root);
          removedShadow = true;
        }
        if (removedShadow) {
          observer.disconnect();
          observer.observe(document, chromiumObservationOptions);
          for (const root of shadowRoots) observer.observe(root, chromiumObservationOptions);
        }
        return;
      }
      for (const record of records) {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target?.closest('style')) {
          const root = target.getRootNode();
          schedule(root === document ? document.documentElement : root);
        }
        else if (record.type === 'attributes') {
          const value = target.getAttribute(record.attributeName);
          if (record.oldValue !== value &&
              !(record.attributeName === 'style' && movementStyle(record.oldValue) === movementStyle(value))) {
            schedule(target);
            if (sampledElements.has(target)) scheduleDirtySurface(target);
          }
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            schedule(node);
            scheduleDirtySurface(node);
          }
        }
        for (const node of record.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) continue;
          for (const element of [node, ...node.querySelectorAll(`[${marker}]`)]) {
            if (marked.delete(element)) {
              element.removeAttribute(marker);
              element.removeAttribute(transitionMarker);
              paletteTransitions.delete(element);
            }
          }
        }
      }
    });
    observer.observe(document, next === 'chromium' ? chromiumObservationOptions : observationOptions);
    document.addEventListener('load', stylesLoaded, true);
    document.addEventListener('scroll', scheduleVisibleSurfaces, { capture: true, passive: true });
    document.addEventListener('pointerover', refreshHoverPaint, { capture: true, passive: true });
    document.addEventListener('pointerout', refreshHoverPaint, { capture: true, passive: true });
    if (next === 'chromium') {
      window.addEventListener('resize', refreshChromium);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleVisibleSurfaces, { once: true });
      }
      if (switchingRenderer || immediate) {
        // Replace the outgoing palette before the browser can paint the original page.
        paintVisibleSurfaces(false, false, true);
        scheduleViewport(true);
        scheduleDocument();
      } else {
        scheduleViewport(false, true);
        refreshChromium();
      }
    } else {
      paintVisibleSurfaces(false, true, Boolean(switchingRenderer || immediate));
      schedule(document.documentElement);
    }
  }

  function requestPreset() {
    const request = ++revision;
    void chrome.runtime.sendMessage({ type: 'website-preset' }).then(response => {
      if (request === revision) setPreset(response?.preset, false, response?.emphasizeSeparators);
    }).catch(() => {});
  }

  globalThis.nativeDarkModeWebsiteThemeListenerV4 = (message, sender, reply) => {
    if (sender.id !== chrome.runtime.id ||
        !['apply-website-preset-v3', 'apply-website-preset-v4'].includes(message.type)) return;
    revision++;
    const previous = preset;
    const previousSeparators = emphasizeSeparators;
    setPreset(message.preset, message.immediate === true, message.emphasizeSeparators);
    const root = document.documentElement;
    const style = root && getComputedStyle(root);
    const applied = !preset || Boolean(style && (preset === 'chromium'
      ? style.getPropertyValue(chromiumProbe).trim() === 'yes'
      : style.backgroundColor === sheet.cssRules[0].style.backgroundColor));
    if (!applied) setPreset(previous, false, previousSeparators);
    reply(applied);
  };
  chrome.runtime.onMessage.addListener(globalThis.nativeDarkModeWebsiteThemeListenerV4);
  window.addEventListener('pageshow', event => { if (event.persisted) requestPreset(); });
  requestPreset();
})();
