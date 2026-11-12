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
  const paletteProbe = '--native-dark-mode-palette-active';
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
  let inspectingElement;
  const colorRules = new Map();
  const unusedColorRules = [];
  let sampledElements = new WeakSet();
  const artworkContrast = new WeakMap();
  const staticArtwork = new Map();
  const linkedArtworkBackings = new WeakMap();
  const neutralImageProbes = new WeakMap();
  const authoredArtworkLayers = new WeakMap();
  const fieldBackgrounds = new Map();
  const camouflagedInputs = new WeakMap();
  const placeholderSources = new WeakMap();
  const contentSpriteSources = new Map();
  const contentSpriteCrops = new Map();
  const readSpriteResource = boundedTaskPool(2);
  const decodeSpriteCrop = boundedTaskPool(4);
  const spriteCohorts = new Map();

  function boundedTaskPool(limit) {
    const waiting = []; let active = 0;
    function pump() {
      while (active < limit && waiting.length) {
        const {task,resolve,reject} = waiting.shift(); active++;
        Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;pump()});
      }
    }
    return task => new Promise((resolve,reject)=>{waiting.push({task,resolve,reject});pump()});
  }

  function spriteCohort(source) {
    if (!spriteCohorts.has(source)) spriteCohorts.set(source,{pending:0,ready:new Set(),timer:undefined,frame:undefined});
    return spriteCohorts.get(source);
  }

  function publishSpriteCohort(group, bounded = false) {
    if (group.pending && !bounded) return;
    if (group.frame !== undefined) return;
    group.frame=requestAnimationFrame(()=>{
      group.frame=undefined;clearTimeout(group.timer);group.timer=undefined;
      for (const entry of group.ready) {
        entry.done=true;
        for (const user of entry.users) if(preset&&user.isConnected)scheduleDirtySurface(user);
        entry.users.clear();
      }
      group.ready.clear();
    });
  }
  const labeledSvgArtwork = new Map();
  let artworkReadQueue = Promise.resolve();
  const overlayImages = new Map();
  const cssOverlayImages = new Map();
  const overlayRequests = new WeakMap();
  const overlayLabels = new WeakMap();
  let overlayAuthoredInk = new WeakMap();
  const overlayInkLabels = new Set();
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
  let statePaintQueued = false;
  let transparentFrameCanvas = false;
  let horizontalScrollTimer;
  const scrollOffsets = new WeakMap();
  const dirtySurfaces = new Set();
  const scrollingSurfaces = new Set();
  const hoverTargets = new Set();
  let hoverFrame;
  let elements;
  let revision = 0;
  let emphasizeSeparators = false;
  const separatorLevels = {
    'very-low': { minimum: 1.65, opacity: .3, edgeWidth: 1 },
    low: { minimum: 2.5, opacity: .46, edgeWidth: 1 },
    true: { minimum: 3.7, opacity: .64, edgeWidth: 1 },
    high: { minimum: 6.4, opacity: .9, edgeWidth: 1.5 },
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
      `:root:root { ${paletteProbe}: ${colors.base}; color-scheme: dark !important; background-color: ${colors.base} !important; color: ${colors.text} !important; ${backdrop(colors.base)} !important; }`,
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
      paint('breadcrumb-backdrop', `background-color: ${colors.base} !important; ${backdrop(colors.base)}`),
      paint('canvas-image', 'background-blend-mode: multiply'),
      paint('decorative-background', 'filter: brightness(.18)'),
      ...['before', 'after'].map(pseudo =>
        `${selector(`decorative-${pseudo}`)}::${pseudo} { filter: brightness(.18) !important; }`),
      paint('card-raised', `background-color: ${colors.raised} !important; ${backdrop(colors.raised)}`),
      paint('card-recessed', `background-color: ${colors.base} !important; ${backdrop(colors.base)}`),
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
    const imageLabel = (Array.prototype.some.call(element.childNodes, textNode) &&
      imageLabelPaint(element, style, preset === 'contrast' ? 7 : 4.5)) || flowImageLinkPaint(element, style);
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
    const cardPaint = separatedCardPaint(element, style, solid ?? chromiumSrgb(backgroundColor),
      darkened ?? colors.surface.slice(1).match(/../g).map(channel => parseInt(channel, 16)).concat(1));
    if (cardPaint) artworkPaint += `background-color: ${rgba(cardPaint.surface)} !important;` +
      (cardPaint.shadow ? `box-shadow: ${cardPaint.shadow} !important;` : '') +
      (cardPaint.filter ? `filter: ${cardPaint.filter} !important;` : '');
    const sourceBackdrop = !darkened && authoredSolidBackdrop(element);
    const frameBackdrop = cardPaint?.surface ?? darkened ?? (sourceBackdrop && luminance(sourceBackdrop) > .6 &&
      Math.max(...sourceBackdrop.slice(0, 3)) - Math.min(...sourceBackdrop.slice(0, 3)) <= 16 ?
      colors.surface.slice(1).match(/../g).map(channel => parseInt(channel, 16)).concat(1) : null);
    const boxBorder = authoredFrameBorder(element, style, frameBackdrop);
    if (boxBorder) pseudoPaint.push([':not(:focus-visible)', boxBorder]);
    const compositeFrame = compositeFieldFrame(element,style,boxBorder);
    if (compositeFrame) pseudoPaint.push([':not(:focus-within)::after',compositeFrame]);
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
    if (!cardPaint?.filter && solid?.[3] >= .75 && !coloredControl &&
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
    // Border transitions otherwise leak the previous themed ink into the next
    // authored snapshot while the marker is temporarily absent for sampling.
    properties.push(...borderSides.map(side => `border-${side.toLowerCase()}-color`));
    if (cardPaint?.filter) properties.push('filter', 'box-shadow');
    if (paletteFades.has(element)) properties.push('background-image');
    const transition = paintTransition(element, style, properties);
    if (transition) paletteTransitions.set(element, transition);
    return roles.join(' ');
  }

  function inspect(element, backdrops, switchingRenderer = false) {
    if (window !== window.top && document.body && [document.documentElement,document.body].includes(element)) {
      const disabled=sheet.disabled;
      try {
        // Palette canvas defaults are global rules, not element markers.
        // Read both real source layers before interpreting frame transparency.
        sheet.disabled=true;
        transparentFrameCanvas=[document.documentElement,document.body].every(node=>{
          const source=getComputedStyle(node);
          return chromiumSrgb(source.backgroundColor)?.[3]===0&&source.backgroundImage==='none';
        });
      } finally { sheet.disabled=disabled; }
    }
    // UA form paint is intentionally delegated to the dark browser scheme.
    // Exposing normal source link colors must not turn a native field's UA
    // backing into an authored white fill. Explicit authored schemes and
    // appearance:none controls continue through their ordinary source path.
    let nativeControl = false;
    if (preset === 'chromium' && element.matches('input,select,textarea')) {
      const nativeStyle = getComputedStyle(element);
      nativeControl = nativeStyle.appearance !== 'none' && nativeStyle.colorScheme === 'normal';
      if (nativeControl) element.setAttribute(sampleMarker, 'native-control');
    }
    // Vector image paint is a decision for this sample's backing/context, not
    // a permanent property of the decoded source resource.
    const artwork = artworkContrast.get(element);
    if (artwork) delete artwork.svgPaint;
    if (element instanceof HTMLElement || element instanceof SVGSVGElement) {
      const style = getComputedStyle(element);
      if (element.matches('input[placeholder],textarea[placeholder]')) {
        placeholderSources.set(element,{opacity:getComputedStyle(element,'::placeholder').opacity});
      }
      rememberArtworkLayers(element, style);
      const destination = originalTransitionColors(element, style);
      authoredPaint.set(element, {
        color: destination.color ?? style.color, webkitTextFillColor: destination.webkitTextFillColor ?? style.webkitTextFillColor,
        backgroundColor: destination.backgroundColor ?? style.backgroundColor, backgroundImage: style.backgroundImage,
        backgroundBlendMode: style.backgroundBlendMode, backgroundRepeat: style.backgroundRepeat, maskImage: style.maskImage,
        backgroundSize: style.backgroundSize, cursor: style.cursor,
        // Backdrop projection must classify a cached parent exactly as when it
        // was inspected directly, including raised/compact surface policy.
        display: style.display, position: style.position, right: style.right, boxShadow: destination.boxShadow ?? style.boxShadow, borderTopLeftRadius: style.borderTopLeftRadius,
        paddingTop: style.paddingTop, paddingLeft: style.paddingLeft, mixBlendMode: style.mixBlendMode,
        opacity: style.opacity, filter: destination.filter ?? style.filter,
        overflowX: style.overflowX, overflowY: style.overflowY,
        borderStyle: style.borderStyle, borderImageSource: style.borderImageSource,
        transform: style.transform, clipPath: style.clipPath,
        outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
        textDecorationLine: style.textDecorationLine, textDecorationColor: destination.textDecorationColor ?? style.textDecorationColor,
        textDecorationStyle: style.textDecorationStyle, textDecorationThickness: style.textDecorationThickness,
        textUnderlineOffset: style.textUnderlineOffset,
        ...(style.backgroundImage !== 'none' ? Object.fromEntries([
          'backgroundPositionX', 'backgroundPositionY', 'backgroundOrigin', 'backgroundClip',
          'filter', 'transform', 'opacity', 'mixBlendMode'
        ].map(property => [property, style[property]])) : {}),
        ...(style.content.startsWith('url(') ? Object.fromEntries([
          'content','position','left','top','width','height'
        ].map(property=>[property,style[property]])) : {}),
        ...(chromiumSrgb(style.backgroundColor)?.[3] || paintedBorderSides(style).length || labeledPointerControl(element, style) &&
          (style.backgroundImage !== 'none' || borderEdges.some(side => parseFloat(style[`border${side}Width`]) > 0)) ?
          Object.fromEntries(borderEdges.flatMap(side => ['Color', 'Style', 'Width'].map(property =>
            [`border${side}${property}`, property === 'Color' ? destination[`border${side}Color`] ?? style[`border${side}Color`] : style[`border${side}${property}`]]))) : {})
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
    const previous = inspectingElement;
    inspectingElement = element;
    try {
      return preset === 'chromium' ? chromiumColors(element, backdrops, switchingRenderer) :
        rolesFor(element, switchingRenderer);
    } finally {
      inspectingElement = previous;
      if (nativeControl) element.removeAttribute(sampleMarker);
    }
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
    if (!(width >= 360 && height >= 32) || /<(?!\/?(?:svg|path|defs|linearGradient|radialGradient|stop)\b)/i.test(svg)) return null;
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
  const compactBackgrounds = new Map();
  const compactBackgroundTask = boundedTaskPool(4);
  let compactBackgroundPending = 0;
  const compactBackgroundWaiters = new Set();
  function finishCompactBackground() {
    compactBackgroundPending--;
    for (const user of compactBackgroundWaiters) if (preset && user.isConnected) scheduleDirtySurface(user);
    compactBackgroundWaiters.clear();
  }
  const svgPaint = /\b(fill|stroke)\s*=\s*(['"])([^'"]+)\2/gi;

  function backgroundSvgGlyph(style, boundedBox = false, maximumInks = 1, allowRepeat = false) {
    const image = style.backgroundImage;
    if ((style.backgroundRepeat !== 'no-repeat' &&
          !(allowRepeat && ['repeat', 'repeat-x', 'repeat-y'].includes(style.backgroundRepeat))) ||
        (!(boundedBox && ['contain', 'cover'].includes(style.backgroundSize)) &&
          (!/^(?:auto|\d+(?:\.\d+)?px)(?: (?:auto|\d+(?:\.\d+)?px))?$/.test(style.backgroundSize) ||
            style.backgroundSize.split(' ').some(size => parseFloat(size) > 48)))) return null;
    const match = /^url\("data:image\/svg\+xml,((?:\\.|[^"\\])+)"\)$/i.exec(image);
    if (!match || match[1].length > 4096) return null;
    const key = `${image}|${maximumInks}`;
    if (svgGlyphs.has(key)) return svgGlyphs.get(key);
    let svg;
    try { svg = decodeURIComponent(match[1].replace(/\\(["\\])/g, '$1')); } catch { return null; }
    const root = /^<svg\b[^>]*>/i.exec(svg)?.[0];
    const viewBox = /\bviewBox=['"]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*['"]/i.exec(root);
    const hasDimensions = /\b(?:width|height)\s*=/.test(root ?? '');
    const inferViewport = !hasDimensions && (/^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px)?$/.test(style.backgroundSize) ||
      boundedBox && ['contain', 'cover'].includes(style.backgroundSize));
    // A small viewBox-only glyph has a usable coordinate viewport. Preserve
    // its nonzero origin and path, rather than replacing it with a CSS arrow.
    const width = Number(/\bwidth=['"](\d+)['"]/i.exec(root)?.[1] ?? (inferViewport && viewBox?.[3]));
    const height = Number(/\bheight=['"](\d+)['"]/i.exec(root)?.[1] ?? (inferViewport && viewBox?.[4]));
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
      const multi = maximumInks > 1 && new Set(paints).size <= maximumInks && inks.every(color => color?.[3] === 1);
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
    if (glyph) return glyph;
    // A short label can accompany a small simple drawing or a repeated glyph
    // tile. Recolor each verified SVG ink; never filter the whole container.
    if (!element.matches('[role="img"]') && element.textContent.trim().length <= 160 &&
        (Array.prototype.some.call(element.childNodes, textNode) || wrappedBackgroundGlyphLabel(element, style))) {
      const labeled = backgroundSvgGlyph(style, false, element.closest(interactive) ? 2 : 4, true);
      if (labeled) return { ...labeled, paletteGlyph: true, repeated: style.backgroundRepeat !== 'no-repeat' };
    }
    if (!labeledPointerControl(element, style)) return null;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && Math.max(box.width, box.height) <= 48 ?
      backgroundSvgGlyph(style, true, 2) : null;
  }

  function wrappedBackgroundGlyphLabel(element, style) {
    if (!style.backgroundImage.startsWith('url("data:image/svg+xml,')) return false;
    if (element.childElementCount > 1 && element.childElementCount <= 3 && backgroundSvgGlyph(style)) {
      const labels = Array.from(element.children).filter(child => child.matches('p,span,label,div') &&
        child.textContent.trim().length <= 160 && Array.prototype.some.call(child.childNodes, textNode));
      if (labels.length === 1) return true;
    }
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

  function selectProxyFrame(element, includeDisabled = false) {
    if (!element.matches('div,span') || !element.querySelector(':scope > a[tabindex],:scope > [role="combobox"]')) return false;
    const select = element.parentElement?.querySelector(':scope > select');
    if (!select || (!includeDisabled && (select.disabled || element.closest('[aria-disabled="true"]'))) ||
        getComputedStyle(select).display !== 'none') return false;
    return element.clientWidth > 0 && element.clientWidth <= 720 && element.clientHeight >= 20 && element.clientHeight <= 80;
  }

  function fieldLabelBackdrop(element, style) {
    if (!element.matches(`${textInput},input:is([type="password"],[type="email"],[type="url"],[type="tel"],[type="number"])`) ||
        !style.backgroundImage.startsWith('url(') || style.backgroundRepeat !== 'no-repeat' ||
        style.filter !== 'none' || style.opacity !== '1' || style.maskImage !== 'none' ||
        style.transform !== 'none' || style.mixBlendMode !== 'normal' || style.backgroundBlendMode !== 'normal' ||
        !/^(?:9[5-9](?:\.\d+)?|100)%$/.test(style.backgroundPositionX)) return false;
    const size = style.backgroundSize.split(' ').map(value=>/^\d+(?:\.\d+)?px$/.test(value)?parseFloat(value):NaN);
    if (size.length !== 2 || size.some(value=>!(value>0&&value<=48))) return false;
    // A tiny edge-aligned field adornment is not a full input backdrop. Its
    // known footprint lets the label use the measured solid fill, independently
    // of CORS access to the image. This does not authorize image recoloring.
    return element.clientWidth >= 160 && element.clientWidth <= 1024 &&
      element.clientHeight >= 20 && element.clientHeight <= 80 && size[1] <= element.clientHeight &&
      size[0]*size[1] <= element.clientWidth*element.clientHeight*.1;
  }

  function fieldBackgroundGlyph(element, style) {
    const field = selectProxyFrame(element,true) || element.matches(`${textInput},input:is([type="password"],[type="email"],[type="url"],[type="tel"],[type="number"])`);
    const smallSize = /^(?:\d+(?:\.\d+)?px)(?: \d+(?:\.\d+)?px)?$/.test(style.backgroundSize) &&
      style.backgroundSize.split(' ').every(v=>parseFloat(v)>0&&parseFloat(v)<=48);
    if (!style.backgroundImage.startsWith('url(') || !field || element.matches(':disabled,[aria-disabled="true"]') ||
        style.backgroundRepeat !== 'no-repeat' || style.filter !== 'none' ||
        (!(Number(style.opacity)>=.35&&Number(style.opacity)<=1)) ||
        style.mixBlendMode !== 'normal' || style.backgroundBlendMode !== 'normal' || style.maskImage !== 'none' ||
        style.transform !== 'none' || !/^(?:9[5-9](?:\.\d+)?|100)%$/.test(style.backgroundPositionX) ||
        !(['auto','auto auto'].includes(style.backgroundSize)||smallSize)) return null;
    let entry = fieldBackgrounds.get(style.backgroundImage);
    if (!entry) {
      if (fieldBackgrounds.size >= 64) return null;
      const match = /^url\("([^"\\]+)"\)$/.exec(style.backgroundImage);
      if (!match) return null;
      const source = new URL(match[1],location.href).href;
      if (!/^(?:https?:|data:image\/png)/i.test(source)) return null;
      entry = {done:false,ink:null,users:new Set()};fieldBackgrounds.set(style.backgroundImage,entry);
      artworkReadQueue = artworkReadQueue.then(async()=>{
        const resource=await readImageResource(source,new URL(source).origin===location.origin?'same-origin':'cors',32768);
        if(!resource){entry.unreadable=true;return}
        if(resource.type!=='image/png'||resource.data.length<24||resource.data.length>32768)return;
        const view=new DataView(resource.data.buffer,resource.data.byteOffset,resource.data.byteLength);
        const width=view.getUint32(16),height=view.getUint32(20);
        if(!width||!height||width>48||height>48||!await globalThis.ImageDecoder?.isTypeSupported(resource.type))return;
        let decoder,bitmap;
        try{
          decoder=new ImageDecoder({data:resource.data,type:resource.type,preferAnimation:true});
          await decoder.tracks.ready;await decoder.completed;
          if(decoder.tracks.selectedTrack?.frameCount!==1)return;
          bitmap=await createImageBitmap(new Blob([resource.data],{type:resource.type}));
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
          const pixels=context.getImageData(0,0,width,height).data,ink=solidSilhouetteInk(pixels,4);
          if(!ink)return;
          // Include partially antialiased paint in the palette proof, rather
          // than mistaking a multicolor crop's opaque portion for one ink.
          for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=32&&ink.slice(0,3).some((c,j)=>Math.abs(c-pixels[i+j])>8))return;
          Object.assign(entry,{ink,width,height,data:'data:image/png;base64,'+btoa(String.fromCharCode(...resource.data))});
        }finally{bitmap?.close();decoder?.close()}
      }).catch(()=>{}).finally(()=>{entry.done=true;for(const user of entry.users)if(preset&&user.isConnected)scheduleDirtySurface(user);entry.users.clear()});
    }
    if(!entry.done)entry.users.add(element);
    return entry.ink?entry:null;
  }

  function fieldBackgroundPaint(element, style, getBackdrop) {
    const glyph=fieldBackgroundGlyph(element,style),backdrop=glyph&&getBackdrop(element);
    if(!glyph||!backdrop)return '';
    const ink=contrastingGlyphInk(glyph.ink,backdrop,7,true);
    if(!ink)return '';
    // Recolor the resource only. The static PNG's dimensions and alpha remain
    // intact; filtering its text-bearing host would also filter every label.
    const [r,g,b]=ink.slice(0,3).map(c=>c/255);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${glyph.width}" height="${glyph.height}"><filter id="ink" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter><image width="${glyph.width}" height="${glyph.height}" href="${glyph.data}" filter="url(#ink)"/></svg>`;
    const image=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    if(fieldBackgrounds.size<128)fieldBackgrounds.set(image,glyph);
    return `background-image: ${image} !important;`;
  }

  function selectProxyParts(frame) {
    const control=frame.querySelector(':scope > a[tabindex]:not([href]),:scope > [role="combobox"]');
    const slot=control?.querySelector(':scope > :is(div,span):last-child');
    const label=control&&[...control.querySelectorAll(':scope > span')].find(node=>node!==slot&&node.textContent.trim());
    if(!slot||!label||slot.textContent.trim()||slot.childElementCount>1||slot.getAttribute('aria-label')||slot.matches('[role="img"]')||
        slot.firstElementChild&&!slot.firstElementChild.matches('b:empty,i:empty,span:empty,small:empty'))return null;
    return {control,slot,label};
  }

  function solidControlBackdrop(element, source, getBackdrop) {
    const measured=getBackdrop(element);
    if(measured)return measured;
    const fill=chromiumSrgb(source.backgroundColor);
    // The control's outer frame and replacement indicator sit on its solid
    // fill; unreadable inset image pixels do not describe that backing.
    return fill?.[3]===1?(palettes[preset]?chromiumSrgb(getComputedStyle(element).backgroundColor):chromiumSurfaceColor(element,source,fill)):null;
  }

  function semanticSelectArrow(element, getBackdrop) {
    if(!selectProxyFrame(element,true))return [];
    const source=authoredBackdropStyle(element),entry=fieldBackgrounds.get(source.backgroundImage);
    const parts=selectProxyParts(element),anchor=parts?.control,slot=parts?.slot,label=parts?.label;
    const backdrop=solidControlBackdrop(element,source,getBackdrop);
    if(!entry?.done||!entry.unreadable||!slot||!label||!backdrop||luminance(backdrop)>.18||
        source.backgroundRepeat!=='no-repeat'||source.backgroundSize!=='auto'||source.backgroundPositionX!=='100%'||
        !(slot.clientWidth>0&&slot.clientWidth<=48)||slot.clientHeight<20||slot.clientHeight>80||
        label.getBoundingClientRect().right>slot.getBoundingClientRect().left||
        getComputedStyle(slot,'::after').content!=='none')return [];
    const paint=authoredBackdropStyle(slot);
    if(paint.position!=='absolute'||paint.right!=='0px'||paint.backgroundImage!=='none'||chromiumSrgb(paint.backgroundColor)?.[3]!==0||
        paint.filter!=='none'||paint.transform!=='none'||paintedBorderSides(paint).length)return [];
    // An explicitly requested semantic fallback for an inaccessible dropdown
    // indicator: draw only a small chevron, never restore a light rectangle or
    // pretend that unknown PNG pixels were verified/recolored.
    const expanded=element.getAttribute('aria-expanded')==='true'||anchor.getAttribute('aria-expanded')==='true';
    return [['','background-image: none !important;'],[' > :is(a[tabindex]:not([href]),[role="combobox"]) > :is(div,span):last-child::after',
      `content: "" !important; position: absolute !important; inset: 50% auto auto 50% !important;
       width: 7px !important; height: 7px !important; box-sizing: border-box !important;
       background: none !important; border: solid white !important; border-width: 0 2px 2px 0 !important;
       transform: translate(-50%,-65%) rotate(${expanded?225:45}deg) !important; pointer-events: none !important;`]];
  }

  function proxyLabelPaint(element, style, getBackdrop) {
    style = authoredBackdropStyle(element);
    if (!element.matches('span') || element.childElementCount || !element.textContent.trim() ||
        element.textContent.trim().length > 160) return '';
    const anchor = element.parentElement, frame = anchor?.parentElement;
    if (!anchor?.matches('a[tabindex]:not([href]),[role="combobox"]') || !frame || !selectProxyFrame(frame,true)) return '';
    const select = frame.parentElement.querySelector(':scope > select');
    const disabled = select.disabled || Boolean(frame.closest('[aria-disabled="true"]'));
    const hint = !select.selectedOptions.length || !select.selectedOptions[0].textContent.trim();
    const layer = authoredBackdropStyle(frame), parts=selectProxyParts(frame), slot=parts?.slot;
    if (!slot || parts.label!==element ||
        layer.backgroundRepeat !== 'no-repeat' || layer.backgroundSize !== 'auto' ||
        !layer.backgroundImage.startsWith('url(') || layer.backgroundPositionX !== '100%' ||
        layer.filter !== 'none' || (!disabled && layer.opacity !== '1') || layer.mixBlendMode !== 'normal') return '';
    const reserved = slot.getBoundingClientRect(), label = element.getBoundingClientRect();
    // This structure reserves a separate right-hand glyph slot. Adapt only
    // its non-overlapping label; no claim about unreadable image pixels is
    // needed, and no replacement arrow is invented when CORS is denied.
    if (slot.clientWidth <= 0 || slot.clientWidth > 48 || label.right > reserved.left ||
        label.height <= 0 || label.height > reserved.height) return '';
    const source = chromiumSrgb(layer.backgroundColor), ink = chromiumSrgb(style.color);
    if (!source || source[3] !== 1 || luminance(source) < .75 || !ink || ink[3] !== 1 ||
        Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3)) > 24) return '';
    const backing = palettes[preset] ? chromiumSrgb(getComputedStyle(frame).backgroundColor) :
      chromiumSurfaceColor(frame,layer,source) ?? source;
    if (!backing || backing[3] !== 1 || luminance(backing) > .18) return '';
    let repaired;
    if (disabled) {
      let opacity=1;
      for(let node=element;node&&node!==frame.parentElement;node=node.parentElement){
        const paint=authoredBackdropStyle(node);if(paint.filter!=='none')return '';opacity*=Number(paint.opacity);
      }
      const outside=getBackdrop(frame.parentElement);
      if(!(opacity>=.35&&opacity<=1)||!outside)return '';
      const visible=compositeColor([...backing.slice(0,3),opacity],outside);
      let gray=opacity<.8?240:192;
      while(gray<255&&contrastRatio(luminance(compositeColor([gray,gray,gray,opacity],outside)),luminance(visible))<4.5)gray=Math.min(255,gray+4);
      repaired=[gray,gray,gray,1];
    } else if (hint) {
      const muted=[160,160,160,1];repaired=readableColor(muted,backing,6)??muted;
    } else repaired = contrastingGlyphInk(ink,backing,4.5,true);
    return repaired ? `color: ${rgba(repaired)} !important; -webkit-text-fill-color: ${rgba(repaired)} !important;` : '';
  }

  function camouflagedInputPaint(element, style) {
    style = authoredBackdropStyle(element);
    if (!element.matches('input:not([type]),input[type="text"]') || element.matches(':focus,:disabled') ||
        !element.value.trim() || element.value.length > 512 || style.opacity !== '1' || style.filter !== 'none' ||
        style.webkitTextFillColor !== style.color || chromiumSrgb(style.backgroundColor)?.[3] !== 0) return '';
    const backing = authoredSolidBackdrop(element), ink = chromiumSrgb(style.color);
    if (!backing || luminance(backing) < .6 || !ink || ink[3] !== 1 ||
        contrastRatio(luminance(ink),luminance(backing)) > 1.15) return '';
    const input = element.getBoundingClientRect();
    for(let root=element.parentElement,depth=0;root&&depth<3;depth++,root=root.parentElement){
      if(root.clientWidth>1024||root.clientHeight>80||root.querySelectorAll('*').length>32)break;
      for(const label of root.querySelectorAll('div,span,label')){
        if(label.contains(element)||label.textContent.trim()!==element.value.trim())continue;
        const s=getComputedStyle(label),r=label.getBoundingClientRect(),source=authoredBackdropStyle(label);
        if(s.position!=='absolute'||s.pointerEvents!=='none'||s.visibility!=='visible'||s.opacity!=='1'||
            Math.abs(r.left-input.left)>2||Math.abs(r.top-input.top)>2||r.width<input.width*.8||
            r.width>input.width*1.2||r.height<input.height*.8||r.height>input.height*1.5)continue;
        const foreground=chromiumSrgb(source.color);
        if(foreground?.[3]!==1||contrastRatio(luminance(foreground),luminance(backing))<4.5)continue;
        // Some editors camouflage their resting input in the original canvas
        // color beneath a visible duplicate label. Preserve one visible copy;
        // focus restores normal editing rather than changing fonts or strokes.
        camouflagedInputs.set(element,root);
        return '-webkit-text-fill-color: transparent !important;';
      }
    }
    return '';
  }

  function glyphLabelTextPaint(element, style, backdrop, ink) {
    if (!backdrop || luminance(backdrop) > .18 || !ink || ink[3] !== 1 ||
        Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3)) > 12 ||
        parseFloat(style.fontSize) > 20 || element.textContent.trim().length > 160 ||
        !Array.prototype.some.call(element.childNodes,textNode) ||
        element.closest(':disabled,[aria-disabled="true"]')) return '';
    const parent = element.parentElement;
    const glyph = elementBackgroundGlyph(element,authoredBackdropStyle(element)) ||
      (parent && elementBackgroundGlyph(parent,authoredBackdropStyle(parent)));
    const readable = glyph && readableColor(ink,backdrop,8.5);
    return readable ? `color: ${rgba(readable)} !important; -webkit-text-fill-color: ${rgba(readable)} !important;` : '';
  }

  function contrastingGlyphInk(original, backdrop, minimum, preferNative = false) {
    if (!original || !backdrop) return null;
    if (minimum > 7 && contrastRatio(luminance(compositeColor(original, backdrop)), luminance(backdrop)) >= 7) return null;
    if (luminance(backdrop) < .18 && Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) <= 24 &&
        contrastRatio(luminance(compositeColor(original, backdrop)), luminance(backdrop)) < 7) return [255, 255, 255, 1];
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
      // Adapt each palette ink independently, retaining readable source paint.
      const ink = glyph.paletteGlyph ? paletteGlyphInk(original, backdrop) :
        contrastingGlyphInk(original, backdrop, minimum, preferNative);
      if (!ink) return whole;
      changed = true;
      return `${property}=${quote}rgb(${ink.slice(0, 3).join(',')})${quote}`;
    });
    if (!changed) return null;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function paletteGlyphInk(original, backdrop) {
    const colored = Math.max(...original.slice(0, 3)) - Math.min(...original.slice(0, 3)) > 24;
    const minimum = colored ? 4.5 : 7;
    if (!readableColor(original, backdrop, minimum)) return null;
    const transformed = luminance(backdrop) < .18 && chromiumColor(original, 'foreground');
    return readableColor(transformed || original, backdrop, minimum) ?? transformed;
  }

  async function sampleStaticBackground(source, width, height, size, position, repeat, inspectPixels) {
    const resource = await readImageResource(source, new URL(source).origin === location.origin ? 'same-origin' : 'cors');
    if (!resource) return null;
    let decoder, objectUrl;
    try {
      const data = resource.data, view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let sourceWidth, sourceHeight;
      if (resource.type === 'image/svg+xml') {
        if (resource.data.length > 32768 || !isStaticSvgArtwork(resource.data)) return null;
        const svg = new DOMParser().parseFromString(new TextDecoder().decode(data), 'image/svg+xml').documentElement;
        const dimension = (value, fallback) => !value || /%$/.test(value) ? fallback :
          /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : NaN;
        sourceWidth = dimension(svg.getAttribute('width'), 300); sourceHeight = dimension(svg.getAttribute('height'), 150);
      } else {
        // Inspect cheap dimensions before decoding. Other raster formats remain
        // unknown instead of allocating an unbounded decoded bitmap.
        if (resource.type === 'image/png' && data.length >= 24 && data[0] === 137 && data[1] === 80) {
          sourceWidth = view.getUint32(16); sourceHeight = view.getUint32(20);
        } else if (resource.type === 'image/gif' && data.length >= 10 && new TextDecoder().decode(data.subarray(0, 3)) === 'GIF') {
          sourceWidth = view.getUint16(6, true); sourceHeight = view.getUint16(8, true);
        } else return null;
      }
      if (!(sourceWidth > 0 && sourceHeight > 0) || sourceWidth > 4096 || sourceHeight > 4096 || sourceWidth * sourceHeight > 1048576) return null;
      if (resource.type !== 'image/svg+xml') {
        if (!await globalThis.ImageDecoder?.isTypeSupported(resource.type)) return null;
        decoder = new ImageDecoder({ data: resource.data, type: resource.type, preferAnimation: true });
        await decoder.tracks.ready; await decoder.completed;
        if (decoder.tracks.selectedTrack?.frameCount !== 1) return null;
      }
      const image = new Image();
      objectUrl = URL.createObjectURL(new Blob([resource.data], { type: resource.type }));
      image.src = objectUrl;
      let timer;
      try { await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(reject, 2000); })]); }
      finally { clearTimeout(timer); }
      const iw = image.naturalWidth, ih = image.naturalHeight;
      if (!iw || !ih || iw * ih > 1048576) return null;
      const length = (value, basis) => /^-?[\d.]+px$/.test(value) ? parseFloat(value) :
        /^-?[\d.]+%$/.test(value) ? parseFloat(value) * basis / 100 : null;
      let dw = iw, dh = ih;
      if (['contain', 'cover'].includes(size)) {
        const factor = Math[size === 'contain' ? 'min' : 'max'](width / iw, height / ih); dw *= factor; dh *= factor;
      } else {
        const [sx, sy = 'auto'] = size.split(' ');
        if (sx !== 'auto') dw = length(sx, width);
        if (sy !== 'auto') dh = length(sy, height);
        if (sx === 'auto' && sy !== 'auto') dw = dh * iw / ih;
        if (sy === 'auto' && sx !== 'auto') dh = dw * ih / iw;
      }
      if (!(dw > 0 && dh > 0)) return null;
      const [px, py] = position;
      const x = length(px, width - dw), y = length(py, height - dh);
      if (x === null || y === null) return null;
      // A default repeat declaration is harmless if no repeated tile enters this crop.
      if (repeat !== 'no-repeat' && (x > 0 || y > 0 || x + dw < width || y + dh < height)) return null;
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, x, y, dw, dh);
      // Tiny antialiased arrows may contain fewer than sixteen near-opaque
      // pixels. Scale only this bounded crop's evidence floor; retain the
      // single-ink and transparency checks and the artwork default elsewhere.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return inspectPixels ? inspectPixels(pixels, canvas.width, canvas.height) :
        solidSilhouetteInk(pixels, Math.min(16, Math.max(8, Math.ceil(canvas.width * canvas.height * .06))), 16);
    } catch { return null; }
    finally { decoder?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }

  function compactBackgroundFilter(element, style, backdrop, pseudo = '') {
    // Most page elements have no compact resource. Reject them before walking
    // activation wrappers or querying a large ancestor's form descendants.
    const width = pseudo ? parseFloat(style.width) : element.clientWidth;
    const height = pseudo ? parseFloat(style.height) : element.clientHeight;
    const match = /^url\("([^"\\]+)"\)$/.exec(style.backgroundImage);
    if (!match || !(width > 0 && height > 0 && width <= 48 && height <= 48)) return '';
    if (!backdrop || luminance(backdrop) >= .18 || style.filter !== 'none' || style.opacity !== '1' ||
        style.mixBlendMode !== 'normal' || chromiumSrgb(style.backgroundColor)?.[3] !== 0 ||
        style.maskImage !== 'none' || !(element.closest(interactive) || overlayActivationFrame(element)) || element.closest(':disabled,[aria-disabled="true"]') ||
        element.matches('[role="img"]') || element.closest('[id*="logo" i],[class*="logo" i],[id*="avatar" i],[class*="avatar" i]')) return '';
    if (!pseudo && (Array.prototype.some.call(element.childNodes, textNode) ||
        Array.from(element.children).some(child => {
          const paint = getComputedStyle(child);
          // Accessible labels can live inside a sprite without contributing
          // visible pixels. Do not reject that crop, or tint visible content.
          return paint.display !== 'none' && paint.visibility !== 'hidden' &&
            !/^circle\(0(?:px|%)?\)$/.test(paint.clipPath) &&
            paint.clip !== 'rect(0px, 0px, 0px, 0px)';
        }))) return '';
    if (style.backgroundOrigin !== 'padding-box') return '';
    const source = new URL(match[1], location.href).href;
    if (!/^(?:https?:|data:image\/)/i.test(source)) return '';
    const position = [style.backgroundPositionX, style.backgroundPositionY];
    const key = JSON.stringify([source, width, height, style.backgroundSize, position, style.backgroundRepeat]);
    let entry = compactBackgrounds.get(key);
    if (!entry) {
      if (compactBackgrounds.size >= 128) return '';
      if (compactBackgroundPending >= 8) {
        // A busy first viewport must retry eligible controls when capacity
        // frees up, rather than depending on a later hover/theme change.
        if (compactBackgroundWaiters.size < 128) compactBackgroundWaiters.add(element);
        return '';
      }
      entry = { done: false, ink: null, users: new Set() }; compactBackgrounds.set(key, entry); compactBackgroundPending++;
      void compactBackgroundTask(() => sampleStaticBackground(source, width, height,
        style.backgroundSize, position, style.backgroundRepeat)).then(ink => {
        entry.ink = ink; entry.done = true;
        for (const user of entry.users) if (preset && user.isConnected && ink) scheduleDirtySurface(user);
        entry.users.clear();
      }).catch(() => { entry.done = true; entry.users.clear(); }).finally(finishCompactBackground);
    }
    if (!entry.done) { entry.users.add(element); return ''; }
    return glyphContrastFilter(entry.ink,backdrop);
  }

  function glyphContrastFilter(ink, backdrop) {
    if (!ink || !readableColor(ink, backdrop, 7)) return '';
    if (Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 24) {
      return 'brightness(0) invert(1)';
    }
    const target = contrastingGlyphInk(ink, backdrop, 7, true);
    const lift = Math.max(0, ...ink.slice(0, 3).map((channel, i) => (target[i] - channel) / (255 - channel || 1)));
    return `invert(1) brightness(${1 - Math.min(1, lift)}) invert(1)`;
  }

  async function contentSpriteDocument(source) {
    if (!contentSpriteSources.has(source)) {
      if (contentSpriteSources.size >= 8) return null;
      const task=readSpriteResource(async()=>{
        const resource=await readImageResource(source,new URL(source).origin===location.origin?'same-origin':'cors',1048576);
        if(resource?.type!=='image/svg+xml')return null;
        const text=new TextDecoder().decode(resource.data);
        if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))return null;
        const document=new DOMParser().parseFromString(text,'image/svg+xml'),svg=document.documentElement;
        const width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height'));
        const view=(svg.getAttribute('viewBox')??'').trim().split(/[ ,]+/).map(Number);
        const nodes=[svg,...svg.querySelectorAll('*')];
        if(svg.localName!=='svg'||svg.namespaceURI!=='http://www.w3.org/2000/svg'||nodes.length>8192||
            !(width>0&&height>0&&width<=16384&&height<=16384&&width*height<=4194304)||
            view.length!==4||view.some(n=>!Number.isFinite(n))||view[2]<=0||view[3]<=0||
            (svg.getAttribute('preserveAspectRatio')!=='none'&&Math.abs(width/height-view[2]/view[3])>.000001))return null;
        const tags=/^(svg|g|path|circle|ellipse|line|polygon|polyline|rect|defs|clipPath|linearGradient|radialGradient|stop|title|desc|use|mask|filter|feGaussianBlur|feFlood|feBlend|feOffset|feColorMatrix|feComposite|feMerge|feMergeNode)$/;
        if(nodes.some(node=>!tags.test(node.localName)||[...node.attributes].some(a=>/^on/i.test(a.localName)||
            (a.localName==='href'&&!/^#[\w:.-]+$/.test(a.value))||
            (/url\s*\(/i.test(a.value)&&!/^url\(#[\w:.-]+\)$/.test(a.value))||
            (a.localName==='style'&&!/^mask-type:\s*(?:alpha|luminance)\s*;?$/.test(a.value)))))return null;
        if([...svg.querySelectorAll('feGaussianBlur')].some(n=>(n.getAttribute('stdDeviation')??'0').split(/[ ,]+/).some(v=>!Number.isFinite(Number(v))||Number(v)<0||Number(v)>16)))return null;
        for(const filter of svg.querySelectorAll('filter'))for(const name of ['width','height']){
          const value=filter.getAttribute(name)??'120%';
          if(!/^\d+(?:\.\d+)?%?$/.test(value)||parseFloat(value)>(value.endsWith('%')?200:256))return null;
        }
        return {svg,view};
      }).catch(()=>null);
      contentSpriteSources.set(source,task);
    }
    return contentSpriteSources.get(source);
  }

  function contentSpriteFilter(element, hostStyle, getBackdrop) {
    const sprite=element.childElementCount===1&&element.firstElementChild;
    if(!(sprite instanceof HTMLElement))return '';
    const style=authoredBackdropStyle(sprite),host=authoredBackdropStyle(element);
    const match=/^url\("([^"\\]+)"\)$/.exec(style.content??'');
    if(!match||sprite.childElementCount||element.textContent.trim()||style.position!=='absolute'||
        style.transform!=='none'||style.filter!=='none'||style.opacity!=='1'||style.mixBlendMode!=='normal'||
        host.position!=='relative'||host.filter!=='none'||host.opacity!=='1'||host.transform!=='none'||host.maskImage!=='none'||
        host.mixBlendMode!=='normal'||chromiumSrgb(host.backgroundColor)?.[3]!==0||
        style.backgroundImage!=='none'||chromiumSrgb(style.backgroundColor)?.[3]!==0||
        !element.closest(`${interactive},[role="checkbox"],[role="combobox"],[role="listbox"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="radio"]`)||
        element.closest('[role="img"],[class*="logo" i],[class*="avatar" i]'))return '';
    const parent=element;
    const clip=getComputedStyle(parent),width=parent.clientWidth,height=parent.clientHeight;
    const left=/^-?\d+(?:\.\d+)?px$/.test(style.left)?parseFloat(style.left):NaN;
    const top=/^-?\d+(?:\.\d+)?px$/.test(style.top)?parseFloat(style.top):NaN;
    if(!['hidden','clip'].includes(clip.overflowX)||!['hidden','clip'].includes(clip.overflowY)||
        !(width>0&&height>0&&width<=48&&height<=48)||left>0||top>0||!Number.isFinite(left+top)||
        -left+width>sprite.clientWidth||-top+height>sprite.clientHeight||
        ['Top','Right','Bottom','Left'].some(side=>parseFloat(clip[`padding${side}`])!==0)||
        paintedBorderSides(clip).length)return '';
    const backdrop=getBackdrop(parent);
    if(!backdrop||luminance(backdrop)>=.18)return '';
    const source=new URL(match[1],location.href).href;
    if(!/^(?:https?:|data:image\/svg\+xml)/i.test(source))return '';
    const dimensions=[sprite.clientWidth,sprite.clientHeight],key=JSON.stringify([source,width,height,left,top,dimensions]);
    let entry=contentSpriteCrops.get(key);
    if(!entry){
      if(contentSpriteCrops.size>=128)return '';
      entry={done:false,ink:null,users:new Set()};contentSpriteCrops.set(key,entry);
      const group=spriteCohort(source);group.pending++;
      const resource=contentSpriteDocument(source);
      resource.then(image=>image&&decodeSpriteCrop(async()=>{
        const svg=image.svg.cloneNode(true),[x,y,w,h]=image.view;
        svg.setAttribute('width',width);svg.setAttribute('height',height);
        svg.setAttribute('viewBox',`${x-left*w/dimensions[0]} ${y-top*h/dimensions[1]} ${width*w/dimensions[0]} ${height*h/dimensions[1]}`);
        svg.setAttribute('preserveAspectRatio','none');
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
        let timeout;
        try{
          const probe=new Image();probe.src=url;
          await Promise.race([probe.decode(),new Promise((_,reject)=>{timeout=setTimeout(reject,2000)})]);
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(probe,0,0);
          const pixels=context.getImageData(0,0,width,height).data;
          const weighted=pixels.reduce((sum,value,index)=>sum+(index%4===3?value/255:0),0);
          let ink=weighted>=Math.max(4,width*height*.005)?solidSilhouetteInk(pixels,Math.max(2,Math.ceil(width*height*.005))):null;
          if(!ink&&weighted>=Math.max(4,width*height*.005)){
            let strongest=3;for(let n=7;n<pixels.length;n+=4)if(pixels[n]>pixels[strongest])strongest=n;
            // Thin antialiased strokes can have no near-opaque pixel. Their
            // visible palette still has to be uniform, including partial ink.
            if(pixels[strongest]>=128)ink=[...pixels.slice(strongest-3,strongest),1];
          }
          if(ink){
            for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=32&&ink.slice(0,3).some((c,j)=>Math.abs(c-pixels[i+j])>8))return;
            entry.ink=ink;
          }
        }finally{clearTimeout(timeout);URL.revokeObjectURL(url)}
      })).catch(()=>{}).finally(()=>{
        group.pending--;group.ready.add(entry);
        // Publish a resource's completed crops together instead of repainting
        // each icon as it decodes. A slow crop cannot hold ready work indefinitely.
        if(group.timer===undefined)group.timer=setTimeout(()=>publishSpriteCohort(group,true),200);
        publishSpriteCohort(group);
      });
      // Four tiny viewports decode concurrently; at most two source reads run.
      // Keep static/CORS proof and crop budgets, without blocking on unrelated artwork.
    }
    if(!entry.done&&entry.users.size<64)entry.users.add(element);
    if(!entry.done)return '';
    const disabled=element.closest(':disabled,[aria-disabled="true"]');
    if(!disabled)return glyphContrastFilter(entry.ink,backdrop);
    if(!entry.ink||Math.max(...entry.ink.slice(0,3))-Math.min(...entry.ink.slice(0,3))>24)return '';
    let opacity=1;
    for(let node=element,depth=0;node&&depth<16;node=node.parentElement,depth++){
      const layer=authoredBackdropStyle(node);
      if(layer.filter!=='none'||layer.mixBlendMode!=='normal')return '';
      opacity*=Number(layer.opacity);
    }
    if(opacity<.35||opacity>1||contrastRatio(luminance(compositeColor([...entry.ink.slice(0,3),opacity],backdrop)),luminance(backdrop))>=4.5)return '';
    let gray=192;
    while(gray<255&&contrastRatio(luminance(compositeColor([gray,gray,gray,opacity],backdrop)),luminance(backdrop))<4.5)gray=Math.min(255,gray+4);
    // Retain native/ARIA disabled state and authored group opacity. Neutral
    // disabled glyphs stay dimmer than enabled white glyphs on the same backing.
    return `brightness(0) invert(${gray/255})`;
  }

  function clippedMaskInk(element, getBackdrop) {
    const source=authoredBackdropStyle(element),parent=element.parentElement;
    if(!source.maskImage?.startsWith('url(')||source.content?.startsWith('url(')||!parent||element.childElementCount||element.textContent.trim()||
        !element.closest(`${interactive},[role="combobox"],[role="listbox"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]`)||element.closest(':disabled,[aria-disabled="true"]'))return '';
    const clip=getComputedStyle(parent),style=getComputedStyle(element),r=parent.getBoundingClientRect();
    const ink=chromiumSrgb(source.backgroundColor),backdrop=getBackdrop(parent);
    if(!ink||ink[3]!==1||source.backgroundImage!=='none'||source.filter!=='none'||source.opacity!=='1'||source.transform!=='none'||
        source.position!=='absolute'||!['hidden','clip'].includes(clip.overflowX)||!['hidden','clip'].includes(clip.overflowY)||
        clip.position!=='relative'||r.width<=0||r.height<=0||r.width>48||r.height>48||
        element.clientWidth*element.clientHeight>4194304||!backdrop||luminance(backdrop)>.18||
        !/^url\("[^"\\]+"\)$/.test(style.maskImage))return '';
    const repaired=contrastingGlyphInk(ink,backdrop,7,true);
    return repaired?`background-color: ${rgba(repaired)} !important;`:'';
  }

  function toolbarColorIndicator(element) {
    if(!element.closest('[role="toolbar"]')||!element.closest(actionButton)||
        !element.style.getPropertyValue('border-bottom-color')||element.childElementCount!==1||element.textContent.trim())return '';
    const source=authoredBackdropStyle(element),box=element.getBoundingClientRect(),clip=element.firstElementChild;
    const glyph=clip.childElementCount===1&&clip.firstElementChild,paint=glyph&&authoredBackdropStyle(glyph);
    if(box.width<=0||box.width>48||box.height<=0||box.height>64||source.backgroundImage!=='none'||
        source.borderImageSource!=='none'||paintedBorderSides(source).join(',')!=='Bottom'||
        !(parseFloat(source.borderBottomWidth)>0&&parseFloat(source.borderBottomWidth)<=4)||
        !paint||!(paint.content?.startsWith('url(')||paint.maskImage?.startsWith('url(')))return '';
    // Inline color beneath a glyph represents the chosen formatting color.
    // Repair the glyph independently, retaining this source value.
    return `border-bottom-color: ${source.borderBottomColor} !important;`;
  }

  function toolbarControlText(element, getBackdrop) {
    if(!element.closest('[role="toolbar"]')||element.closest(':disabled,[aria-disabled="true"]')||
        !(element.matches('input:not([type]),input[type="text"]')||!element.childElementCount&&element.textContent.trim()&&element.textContent.trim().length<=100))return '';
    const control=element.closest('[role="combobox"],[role="listbox"]');
    if(!control||control.clientWidth>320||control.clientHeight>80)return '';
    const source=authoredBackdropStyle(element),ink=chromiumSrgb(source.webkitTextFillColor),backdrop=getBackdrop(element);
    if(!ink||ink[3]<.25||Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24||!backdrop||luminance(backdrop)>.18)return '';
    const visible=compositeColor(ink,backdrop),repair=readableColor(visible,backdrop,12);
    return repair?`color: ${rgba(repair)} !important; -webkit-text-fill-color: ${rgba(repair)} !important;`:'';
  }

  function compactControlLabel(element, getBackdrop) {
    if (element.childElementCount || !element.textContent.trim() || element.textContent.trim().length > 100 ||
        element.closest(':disabled,[aria-disabled="true"]')) return '';
    const control = element.closest(actionButton);
    if (!control || control.clientWidth > 320 || control.clientHeight > 80) return '';
    const source = authoredBackdropStyle(element), ink = chromiumSrgb(source.webkitTextFillColor), backdrop = getBackdrop(element);
    if (!ink || ink[3] < .25 || Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3)) > 24 || !backdrop || luminance(backdrop) > .18) return '';
    const size=parseFloat(source.fontSize??getComputedStyle(element).fontSize);
    const minimum=size<=14?14:size<=16?12:8.5;
    const repair = readableColor(compositeColor(ink,backdrop),backdrop,minimum);
    return repair ? `color: ${rgba(repair)} !important; -webkit-text-fill-color: ${rgba(repair)} !important;` : '';
  }

  function embeddedControlWordmarkPaint(element, getBackdrop) {
    if(!element.matches('div,span')||element.childElementCount||element.textContent.trim()||
        element.clientWidth<48||element.clientWidth>320||element.clientHeight<8||element.clientHeight>48||
        element.clientWidth<element.clientHeight*2||element.closest(':disabled,[aria-disabled="true"]'))return '';
    const control=element.closest('button,[role="button"],a[href]'),source=authoredBackdropStyle(element);
    if(!control||!(control.getAttribute('aria-label')||control.textContent.trim())||control.clientWidth>480||control.clientHeight>96||
        source.backgroundSize!=='contain'||source.backgroundRepeat!=='no-repeat'||source.backgroundOrigin!=='padding-box'||
        source.opacity!=='1'||source.filter!=='none'||source.transform!=='none'||source.mixBlendMode!=='normal'||
        source.maskImage!=='none'||chromiumSrgb(source.backgroundColor)?.[3]!==0)return '';
    for(let node=element;node;node=node.parentElement){
      const layer=authoredBackdropStyle(node);
      if(layer.opacity!=='1'||layer.filter!=='none'||layer.mixBlendMode!=='normal')return '';
      if(node===control)break;
    }
    const match=/^url\("data:image\/svg\+xml(?:;charset=[^,]+)?,((?:\\.|[^"\\])+)"\)$/i.exec(source.backgroundImage);
    const backdrop=match&&getBackdrop(control);
    if(!match||match[1].length>49152||!backdrop||luminance(backdrop)>.18)return '';
    const key=JSON.stringify(['embedded-wordmark',source.backgroundImage,backdrop]);
    let entry=compactBackgrounds.get(key);
    if(!entry){
      if(compactBackgrounds.size>=128)return '';
      if(compactBackgroundPending>=8){if(compactBackgroundWaiters.size<128)compactBackgroundWaiters.add(element);return '';}
      entry={done:false,image:null,users:new Set()};compactBackgrounds.set(key,entry);compactBackgroundPending++;
      void compactBackgroundTask(async()=>{
        const text=decodeURIComponent(match[1].replace(/\\(["\\])/g,'$1')),data=new TextEncoder().encode(text);
        if(data.length>32768||/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)||!isStaticSvgArtwork(data))return;
        const svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement,nodes=[svg,...svg.querySelectorAll('*')];
        const width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height'));
        if(!(width>0&&width<=320&&height>0&&height<=48)||nodes.length>128||nodes.some(n=>
          !/^(svg|g|path|circle|ellipse|line|polygon|polyline|rect|defs|linearGradient|radialGradient|stop|title|desc)$/.test(n.localName)))return;
        const shapes=[...svg.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')],candidates=[];
        for(const [index,shape]of shapes.entries()){
          if(shape.closest('defs')||shape.localName==='rect')continue;
          for(const property of ['fill','stroke']){
            const value=shape.getAttribute(property);
            if(!value||!(/^(?:#[\da-f]{3,8}|rgba?\([^)]+\)|black|white|gray)$/i.test(value)))continue;
            const ink=gradientColor(value,true);
            if(!ink||Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24)continue;
            const repaired=contrastingGlyphInk(ink,backdrop,7,true);
            if(repaired)candidates.push({index,property,ink:rgba(repaired)});
          }
        }
        if(!candidates.length)return;
        const without=svg.cloneNode(true),mask=svg.cloneNode(true);
        const withoutShapes=[...without.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')];
        const maskShapes=[...mask.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')];
        for(const shape of maskShapes)if(!shape.closest('defs')){shape.setAttribute('fill','none');shape.setAttribute('stroke','none');}
        for(const candidate of candidates){withoutShapes[candidate.index].setAttribute(candidate.property,'none');maskShapes[candidate.index].setAttribute(candidate.property,'white');}
        const pixels=async image=>{
          const probe=new Image();probe.src=`data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(image))}`;
          let timer;
          try{
            await Promise.race([probe.decode(),new Promise((_,reject)=>{timer=setTimeout(reject,2000)})]);
            const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
            const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(probe,0,0,width,height);
            return context.getImageData(0,0,width,height).data;
          }finally{clearTimeout(timer)}
        };
        const [below,ink]=await Promise.all([pixels(without),pixels(mask)]);
        let coverage=0;
        for(let n=3;n<ink.length;n+=4){
          coverage+=ink[n]/255;
          // Removing the neutral foreground must expose transparency. A
          // pupil/letter over another painted shape is not canvas-backed ink.
          if(ink[n]>=32&&below[n]>8)return;
        }
        if(coverage<8||coverage>width*height*.75)return;
        for(const candidate of candidates)shapes[candidate.index].setAttribute(candidate.property,candidate.ink);
        entry.image=`url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}")`;
      }).catch(()=>{}).finally(()=>{
        entry.done=true;for(const user of entry.users)if(preset&&user.isConnected)scheduleDirtySurface(user);entry.users.clear();finishCompactBackground();
      });
    }
    if(!entry.done){entry.users.add(element);return '';}
    return entry.image?`background-image: ${entry.image} !important;`:'';
  }

  function embeddedCanvasPaint(element) {
    if (![document.documentElement,document.body].includes(element) || window === window.top || !document.body) return '';
    if (!transparentFrameCanvas) return '';
    // Transparent widgets are painted over their embedding page. A replacement
    // canvas makes a new rectangular patch, even when every child is correct.
    // Retain the shared dark scheme: a scheme mismatch with the embedding page
    // makes Chromium provide an opaque compatibility canvas of its own.
    return 'background-color: transparent !important; color-scheme: dark !important;';
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
      if (!width || !['solid', 'inset', 'outset'].includes(style[`border${side}Style`])) continue;
      const property = `border-${side.toLowerCase()}`;
      const source = chromiumSrgb(style[`border${side}Color`]);
      const neutral = source && Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)) <= 24;
      const color = soften(style[`border${side}Color`]) ??
        (neutral && rgba(readableColor(source, backdrop, 1.65) ?? source));
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

  function hasImageBackdrop(element, style, backdrops, solid = new Map()) {
    if (backdrops.has(element)) return backdrops.get(element);
    let hasImage = style.backgroundImage !== 'none' && !elementBackgroundGlyph(element, style) && !fieldBackgroundGlyph(element,style) && !fieldLabelBackdrop(element,style) && !paleSvgBackground(style.backgroundImage) &&
      !chromiumGradient(style, isHeadingBackground(element));
    // A translucent CSS gradient is measurable paint when its solid backing
    // is known. Keeping source ink as if these were unchanged picture pixels
    // leaves dark labels on the newly dark composited result.
    if (hasImage && style.backgroundImage.includes('gradient(')) {
      const measured = chromiumTextBackdrop(element, solid);
      if (measured && luminance(measured) < .18) hasImage = false;
    }
    if (!hasImage && chromiumSrgb(style.backgroundColor)?.[3] !== 1) {
      const parent = element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
      if (parent) hasImage = backdrops.get(parent) ?? hasImageBackdrop(parent, authoredBackdropStyle(parent), backdrops, solid);
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

  function overlayColors(element, image, placement) {
    const rect = placement?.rect ?? image.getBoundingClientRect();
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
    const imageStyle = placement?.style ?? getComputedStyle(image);
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
    let words = 0, visits = 0;
    for (const node of placement?.labels?.flatMap(label => [...label.childNodes]) ?? element.childNodes) {
      if (!textNode(node)) continue;
      // Word rectangles exclude inter-word gaps and unused line area. They are
      // an approximation of glyph coverage, not an exact font raster mask.
      for (const word of node.textContent.matchAll(/\S+/gu)) {
        if (++words > 48) return null;
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
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
              if (++visits > 16384) return null;
              const index = (y * sample.width + x) * 4;
              if (sample.pixels[index + 3] !== 255) return null;
              const [r, g, b] = sample.pixels.subarray(index, index + 3);
              const key = (r << 16) + (g << 8) + b;
              const entry = colors.get(key);
              if (entry) entry.weight++;
              else colors.set(key, { color: [r, g, b, 1], weight: 1 });
            }
          }
        }
      }
    }
    return colors.size ? { colors: [...colors.values()].map(v => v.color),
      weights: [...colors.values()].map(v => v.weight), method: 'weighted-word-bounds' } : null;
  }

  function imageLabelPaint(element, style, minimum) {
    const image = overlayImage(element, style);
    if (!image) return flowImageLabelPaint(element, style, minimum);
    if (!overlayLabels.has(image)) overlayLabels.set(image, new Set());
    overlayLabels.get(image).add(element);
    return sampledImageLabelPaint(element, style, overlayColors(element, image), minimum, true);
  }

  function forgetOverlayInk(root) {
    if(!root)return;
    for(const label of overlayInkLabels)if(!label.isConnected||label===root||root.contains(label)){
      overlayAuthoredInk.delete(label);overlayInkLabels.delete(label);
    }
  }

  function originalImageLabelInk(element, style) {
    if(overlayAuthoredInk.has(element)&&!sheet.disabled)return overlayAuthoredInk.get(element);
    let ink;
    const disabled=sheet.disabled;
    try{
      // Measure source inheritance, not a parent's already applied palette.
      // This synchronous probe is cached; async image completion reuses it.
      sheet.disabled=true;
      const source=disabled?style:getComputedStyle(element);
      ink=chromiumSrgb(originalTransitionColors(element,source).webkitTextFillColor??source.webkitTextFillColor);
    }finally{sheet.disabled=disabled}
    if(ink){
      if(overlayInkLabels.size>=512){const oldest=overlayInkLabels.values().next().value;overlayInkLabels.delete(oldest);overlayAuthoredInk.delete(oldest)}
      overlayInkLabels.add(element);overlayAuthoredInk.set(element,ink);
    }
    return ink;
  }

  function sampledImageLabelPaint(element, style, sampled, minimum, allowBacking) {
    const authored = originalImageLabelInk(element,style);
    if (!authored?.[3] || style.backgroundClip === 'text') return '';
    const dark = [18, 18, 18, 1], light = [255, 255, 255, 1];
    const colors = sampled?.colors ?? [dark, light];
    const contrast = (ink, backing, alpha) => {
      let worst = Infinity;
      for (const pixel of colors) {
        const bg = alpha ? compositeColor([...backing.slice(0, 3), alpha], pixel) : pixel;
        worst = Math.min(worst, contrastRatio(luminance(compositeColor(ink, bg)), luminance(bg)));
      }
      return worst;
    };
    const decision = globalThis.nativeDarkModeImageTextContrast?.(sampled, {
      authored, fontSize: parseFloat(style.fontSize), fontWeight: parseFloat(style.fontWeight)
    });
    let ink = decision?.ink ?? (contrast(authored) >= minimum ? authored : contrast(dark) > contrast(light) ? dark : light);
    // Before manufacturing a rectangle, try a foreground that meets the
    // fallback ratio over the entire verified region. Small text over a flat
    // colored picture often has such an ink even if the perceptual policy
    // preferred the source polarity. Mixed/unknown pixels retain the backing.
    let adequateForeground = false;
    if (allowBacking && sampled && contrast(ink) < minimum && parseFloat(style.fontSize) < 24) {
      const candidate = contrast(dark) > contrast(light) ? dark : light;
      // A fully verified image region uses a shared 4.5 foreground floor;
      // the stronger palette's ordinary-text target must not force a plate
      // where a readable picture caption can stand on its own.
      if (contrast(candidate) >= 4.5) { ink = candidate; adequateForeground = true; }
    }
    const backing = luminance(ink) < .5 ? light : dark;
    const declarations = `color: ${rgba(ink)} !important; -webkit-text-fill-color: ${rgba(ink)} !important;`;
    // Foreground selection must not manufacture a stroke around letters or
    // underlines. Preserve authored shadow/decoration when no backing is used.
    const retainedLargeInk = parseFloat(style.fontSize)>=24 && decision && !decision.uncertain &&
      decision.coverage>=.9 && (decision.ink.every((channel,index)=>Math.abs(channel-authored[index])<.001) ||
      luminance(authored)>.75&&luminance(decision.ink)>.75&&Math.max(...authored.slice(0,3))-Math.min(...authored.slice(0,3))<=24);
    // Do not add a rectangular backing after the shared font-aware policy
    // confidently accepted the original large text on its unchanged image.
    // Small text, uncertain regions and unsupported samples retain fallback.
    if (!allowBacking || retainedLargeInk || adequateForeground) return declarations;
    let alpha = 0;
    while (contrast(ink, backing, alpha) < minimum && alpha < 1) alpha = Math.min(1, alpha + .1);
    return declarations +
      (alpha ? `background-color: ${rgba([...backing.slice(0, 3), Math.round(alpha * 10) / 10])} !important;` : '');
  }

  function flowImageLabelPaint(element, style, minimum) {
    const card = element.closest('a[href]');
    if (!card || element === card || element.textContent.trim().length > 180 ||
        !Array.prototype.some.call(element.childNodes, textNode) || style.backgroundImage !== 'none') return '';
    for (let node = element, depth = 0; node && depth < 7; node = node.parentElement, depth++) {
      const layer = authoredBackdropStyle(node);
      if (layer.backgroundImage !== 'none') {
        if (!/^url\(/.test(layer.backgroundImage) || paleSvgBackground(layer.backgroundImage) ||
            elementBackgroundGlyph(node, layer)) return '';
        const decoration = flowImageLinkDecoration(card);
        const independentLine = decoration && decoration.textDecorationColor !== decoration.color;
        let decorationPaint = decoration ?
          `text-decoration-line: underline !important; text-decoration-color: ${independentLine ? decoration.textDecorationColor : 'currentColor'} !important;` +
          `text-decoration-style: ${decoration.textDecorationStyle} !important;` +
          `text-decoration-thickness: ${decoration.textDecorationThickness} !important;` +
          `text-underline-offset: ${decoration.textUnderlineOffset} !important;` : '';
        const image = cssBackgroundImage(element, node, layer);
        if (!image) return decorationPaint;
        const box = node.getBoundingClientRect(), sx = box.width / node.offsetWidth, sy = box.height / node.offsetHeight;
        const left = box.left + parseFloat(layer.borderLeftWidth) * sx, top = box.top + parseFloat(layer.borderTopWidth) * sy;
        const width = node.clientWidth * sx, height = node.clientHeight * sy;
        const imageStyle = { objectFit: layer.backgroundSize === 'contain' ? 'contain' : 'cover',
          objectPosition: `${layer.backgroundPositionX} ${layer.backgroundPositionY}`, transform: 'none', filter: 'none',
          mixBlendMode: 'normal', opacity: '1' };
        for (const side of borderEdges) imageStyle[`padding${side}`] = imageStyle[`border${side}Width`] = '0px';
        const placement = { rect: { left, top, right: left + width, bottom: top + height, width, height }, style: imageStyle };
        const colors = overlayColors(element, image, placement);
        if (independentLine && node === card) {
          // A propagated colored underline is one authored decoration. Compare
          // its original and chroma-retaining light adaptation over all labels,
          // keeping one color across the link instead of alternating by line.
          const authored = chromiumSrgb(decoration.textDecorationColor);
          const adapted = authored?.[3] && chromiumColor(authored, 'foreground');
          const sampled = adapted && overlayColors(element, image, { ...placement, labels: [...card.children] });
          const decision = sampled && globalThis.nativeDarkModeImageTextContrast?.(sampled, { decoration: true, authored, adapted });
          if (decision) decorationPaint += `text-decoration-color: ${rgba(decision.ink)} !important;`;
        }
        return (colors ? sampledImageLabelPaint(element, style, colors, minimum, false) : '') + decorationPaint;
      }
      if (chromiumSrgb(layer.backgroundColor)?.[3] > .2 || node === card) break;
    }
    return '';
  }

  function flowImageLinkLabels(link, style = authoredBackdropStyle(link)) {
    return link instanceof HTMLAnchorElement && link.hasAttribute('href') && /^url\(/.test(style.backgroundImage) &&
      !paleSvgBackground(style.backgroundImage) && !elementBackgroundGlyph(link, style) &&
      !Array.prototype.some.call(link.childNodes, textNode) && link.childElementCount > 0 && link.childElementCount <= 4 &&
      Array.from(link.children).every(child => child instanceof HTMLElement && !child.childElementCount &&
        child.textContent.trim() && child.textContent.trim().length <= 180);
  }

  function flowImageLinkDecoration(link, style = authoredBackdropStyle(link)) {
    if (!flowImageLinkLabels(link, style) || style.textDecorationLine !== 'underline' ||
        Array.from(link.children).some(child => authoredBackdropStyle(child).textDecorationLine !== 'none')) return null;
    return style;
  }

  function flowImageLinkPaint(element, style) {
    // Move propagated decoration onto the flat labels, where background
    // samples and default versus independent decoration colors are known.
    return flowImageLinkDecoration(element, style) ? 'text-decoration-color: transparent !important;' : '';
  }

  function cssBackgroundImage(label, host, style) {
    if (!['cover', 'contain'].includes(style.backgroundSize) ||
        (style.backgroundRepeat !== 'no-repeat' && !(style.backgroundSize === 'cover' && style.backgroundRepeat === 'repeat')) ||
        style.backgroundOrigin !== 'padding-box' || style.filter !== 'none' || style.transform !== 'none' ||
        style.opacity !== '1' || style.backgroundBlendMode !== 'normal' ||
        !/^\d+(?:\.\d+)?%$/.test(style.backgroundPositionX) || !/^\d+(?:\.\d+)?%$/.test(style.backgroundPositionY)) return null;
    const match = /^url\("([^"\\]+)"\)$/.exec(style.backgroundImage);
    if (!match) return null;
    const source = new URL(match[1], location.href).href;
    let entry = cssOverlayImages.get(source);
    if (!entry) {
      const rect = host.getBoundingClientRect();
      if (cssOverlayImages.size >= 16 || rect.bottom < -128 || rect.top > innerHeight + 128) return null;
      entry = { image: null, done: false, users: new Set() }; cssOverlayImages.set(source, entry);
      const task = artworkReadQueue.then(async () => {
        const resource = await readImageResource(source, new URL(source).origin === location.origin ? 'same-origin' : 'cors');
        if (resource?.type !== 'image/png' || resource.data.length < 24) return;
        const view = new DataView(resource.data.buffer, resource.data.byteOffset, resource.data.byteLength);
        const width = view.getUint32(16), height = view.getUint32(20);
        if (!width || !height || width > 4096 || height > 4096 || width * height > 1048576 ||
            !await globalThis.ImageDecoder?.isTypeSupported(resource.type)) return;
        let decoder, url, timer;
        try {
          decoder = new ImageDecoder({ data: resource.data, type: resource.type, preferAnimation: true });
          await decoder.tracks.ready; await decoder.completed;
          if (decoder.tracks.selectedTrack?.frameCount !== 1) return;
          const image = new Image(); url = URL.createObjectURL(new Blob([resource.data], { type: resource.type })); image.src = url;
          await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(reject, 2000); })]);
          entry.image = image;
        } finally { clearTimeout(timer); decoder?.close(); if (url) URL.revokeObjectURL(url); }
      }).catch(() => {}).finally(() => {
        entry.done = true;
        for (const user of entry.users) if (preset && user.isConnected) scheduleDirtySurface(user);
        entry.users.clear();
      });
      artworkReadQueue = task;
    }
    if (!entry.done) entry.users.add(label);
    return entry.image;
  }

  function authoredBackdropStyle(element) {
    // Local sampling removes only the target's paint. Its ancestors may still be themed.
    if ((element === inspectingElement || !sheet.disabled && element.hasAttribute(marker)) && authoredPaint.has(element)) return authoredPaint.get(element);
    return getComputedStyle(element);
  }

  function textBackdrop(element, cache, simulated = false) {
    if (!element) return null;
    if (cache.has(element)) return cache.get(element);
    const style = simulated ? authoredBackdropStyle(element) : getComputedStyle(element);
    let backdrop = simulated ? paleSvgBackground(style.backgroundImage)?.backdrop : null;
    if (!backdrop && style.backgroundImage.includes('gradient(')) {
      const color = chromiumSrgb(style.backgroundColor);
      const layer = simulated ? chromiumSurfaceColor(element, style, color) ?? color : color;
      const parent = element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
      const below = layer?.[3] === 1 ? layer : textBackdrop(parent, cache, simulated);
      const backing = below && layer ? compositeColor(layer, below) : below;
      backdrop = measurableGradientBackdrop(style, isHeadingBackground(element), backing, simulated);
    }
    if (style.backgroundImage === 'none' || elementBackgroundGlyph(element, style) || fieldBackgroundGlyph(element,style) || fieldLabelBackdrop(element,style)) {
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
      if (style.backgroundImage !== 'none' && !elementBackgroundGlyph(node, style) && !fieldBackgroundGlyph(node,style)) return null;
      const color = chromiumSrgb(style.backgroundColor);
      if (!color) return null;
      layers.push(color);
      if (color[3] === 1) return layers.reduceRight((backdrop, layer) => compositeColor(layer, backdrop), color);
      node = node.assignedSlot ?? node.parentElement ?? node.getRootNode().host;
    }
    return null;
  }

  function darkGradientUnderlay(element) {
    for(let node=element.parentElement,depth=0;node&&depth<10;node=node.parentElement,depth++) {
      const source=authoredBackdropStyle(node),image=source.backgroundImage;
      if(image.includes('gradient(')) {
        const gradients=image.match(/(?:linear|radial|conic)-gradient\([^;]+/g);
        const stops=gradients&&[...gradients.join('').matchAll(/rgba?\([^)]+\)/g)].map(m=>chromiumSrgb(m[0]));
        return source.backgroundBlendMode.split(', ').every(mode=>mode==='normal')&&stops?.length>=2&&stops.every(c=>c&&c[3]===1&&luminance(c)<.08);
      }
      if(image!=='none'||chromiumSrgb(source.backgroundColor)?.[3]===1)return false;
    }
    return false;
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
    const separated = separatedCardPaint(element, style, color, surface);
    if (separated) return separated.surface;
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

  function measurableGradientBackdrop(style, headingBackground, backing = null, simulated = true) {
    const image = style.backgroundImage;
    if (!image.includes('gradient(') ||
        image.match(/[\w-]+(?=\()/g).some(name => !gradientFunction.test(name))) return null;
    if (image.length > 4096) return null;
    const painted = simulated ? chromiumGradient(style, headingBackground) ?? image : image;
    const stops = [...painted.matchAll(gradientStop)];
    if (!stops.length || stops.length > 32) return null;
    let lightest = null;
    let maximum = 0;
    let darkest = null;
    let minimum = Infinity;
    for (const [stop] of stops) {
      const ink = gradientColor(stop, true);
      if (!ink) return null;
      // Layered translucent gradients need spatial composition, not a flat
      // list of stops. Retain the conservative picture fallback for those.
      if (ink[3] !== 1 && (!backing || (image.match(/gradient\(/g)?.length !== 1))) return null;
      const color = ink[3] === 1 ? ink : compositeColor(ink, backing);
      const light = luminance(color);
      if (!darkest || light < minimum) { darkest = color; minimum = light; }
      if (!lightest || light > maximum) {
        lightest = color;
        maximum = light;
      }
    }
    // One polarity must work across the supported stop range. Mixed bright
    // and dark gradients still require spatial image evidence.
    return maximum <= .18 ? lightest : minimum >= .6 ? darkest : null;
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
    return artworkLosesContrast(pixels, width, height, original, darkened) ? pixels : null;
  }

  function artworkLosesContrast(pixels, width, height, original, darkened, minimum = 2) {
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
        if (contrastRatio(luminance(compositeColor(ink, darkened)), darkenedLight) < minimum &&
            contrastRatio(luminance(compositeColor(ink, original)), originalLight) >= 3) losses[tile]++;
      }
    }
    // Assess edges next to transparency locally. Bright badges elsewhere can hide
    // the loss of a dark wordmark in an image-wide average.
    return transparent >= width * height * .05 &&
      losses.some((count, tile) => count >= 12 && count >= totals[tile] * .6);
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
    const paintRule = new RegExp(`^\\.[\\w-]+\\s*\\{\\s*(?:(?:(?:fill|stroke)\\s*:\\s*${solidPaint}|(?:mask|clip-path)\\s*:\\s*url\\(#[\\w:.-]+\\)|(?:fill-rule|clip-rule)\\s*:\\s*(?:evenodd|nonzero))\\s*;?\\s*)+\\}`, 'i');
    for (const style of svg.querySelectorAll('style')) {
      let css = style.textContent.trim();
      while (css) {
        const rule = paintRule.exec(css);
        if (!rule) return false;
        css = css.slice(rule[0].length).trim();
      }
    }
    const nodes = Array.from(svg.querySelectorAll('*'));
    return nodes.length <= 512 && nodes.every(element =>
      /^(svg|g|path|circle|ellipse|line|polygon|polyline|rect|defs|clipPath|mask|linearGradient|radialGradient|stop|style|title|desc)$/.test(element.localName) &&
      Array.from(element.attributes).every(attribute => !/^on/i.test(attribute.localName) &&
        (attribute.localName !== 'href' || /^#[\w:.-]+$/.test(attribute.value)) &&
        (!/url\s*\(/i.test(attribute.value) || /^url\(#[\w:.-]+\)$/.test(attribute.value)) &&
        (attribute.localName !== 'style' || /^enable-background:\s*new[\d\s.+-]+;?$/i.test(attribute.value))));
  }

  function opacityOnlySvgArtwork(data) {
    if (data.length > 32768) return null;
    const svg = new DOMParser().parseFromString(new TextDecoder().decode(data), 'image/svg+xml');
    const animations = svg.querySelectorAll('animate');
    if (animations.length !== 1 || svg.querySelectorAll('*').length > 256) return null;
    const animation = animations[0];
    if (!['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect'].includes(animation.parentElement?.localName) ||
        animation.getAttribute('attributeName') !== 'opacity' ||
        [...animation.attributes].some(a => !['attributeName', 'values', 'dur', 'repeatCount', 'calcMode', 'begin'].includes(a.name)) ||
        !['linear', 'discrete'].includes(animation.getAttribute('calcMode') ?? 'linear') ||
        !/^(?:0|0s|0ms)$/.test(animation.getAttribute('begin') ?? '0') ||
        !/^\d+(?:\.\d+)?(?:ms|s)$/.test(animation.getAttribute('dur') ?? '') ||
        !(parseFloat(animation.getAttribute('dur')) > 0) ||
        !/^(?:indefinite|\d+(?:\.\d+)?)$/.test(animation.getAttribute('repeatCount') ?? '1')) return null;
    const values = (animation.getAttribute('values') ?? '').split(';').map(v => v.trim());
    if (values.length < 2 || values.length > 32 || values.some(v => !/^(?:0(?:\.\d+)?|\.\d+|1(?:\.0+)?)$/.test(v))) return null;
    const minimumOpacity = Math.min(...values.map(Number));
    // Intentionally disappearing artwork is not a continuously readable glyph.
    if (minimumOpacity < .5) return null;
    animation.remove();
    const staticData = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
    return isStaticSvgArtwork(staticData) ? { data: staticData, minimumOpacity } : null;
  }

  async function readImageResource(source, mode, maxBytes = 512 * 1024) {
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
        if (!isStaticSvgArtwork(data)) {
          const opacity = opacityOnlySvgArtwork(data);
          if (!opacity) return null;
          const ink = await resourceSilhouetteInk({ ...resource, data: opacity.data });
          return ink ? { kind: 'opacity-svg', ink, minimumOpacity: opacity.minimumOpacity } : null;
        }
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

  function staticArtworkResource(source) {
    if (!staticArtwork.has(source)) {
      if (staticArtwork.size >= 64) staticArtwork.delete(staticArtwork.keys().next().value);
      // Serialize resource verification/decoding rather than starting one read
      // per visible logo at once. Cache failed CORS/format checks as well.
      const result = artworkReadQueue.then(() => checkStaticArtwork(source));
      result.then(value => { result.verified = value; });
      staticArtwork.set(source, result);
      artworkReadQueue = result.catch(() => null);
    }
    return staticArtwork.get(source);
  }

  function checkArtworkTint(image, sample) {
    const source = image.currentSrc;
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width * height > 262144) return;
    const cached = staticArtworkResource(source);
    if (Object.hasOwn(cached, 'verified')) {
      applyArtworkTint(image, sample, cached.verified);
      return;
    }
    cached.then(resource => {
      if (!resource || !preset || !image.isConnected || image.currentSrc !== source ||
          artworkContrast.get(image) !== sample) return;
      applyArtworkTint(image, sample, resource);
      if (sample.tint) schedule(image);
    });
  }

  function applyArtworkTint(image, sample, resource) {
      if (!resource) return;
      const { naturalWidth: width, naturalHeight: height } = image;
      if (resource.kind === 'opacity-svg') {
        if (!sample.imageOnlyGlyph || !sample.backdrop) return;
        const lift = silhouetteColorLift(resource.ink, sample.backdrop, resource.minimumOpacity);
        if (!lift) return;
        sample.colorLift = lift; sample.tint = true; sample.opacityOnly = true;
        return;
      }
      if (sample.imageOnlyGlyph && !sample.colorLift && !sample.crossOriginSolid && !sample.neutralTint) return;
      if (sample.crossOriginSolid) {
        const ink = resource.ink;
        const lift = ink && silhouetteColorLift(ink, sample.backdrop);
        if (!lift) return;
        sample.colorLift = lift;
        sample.tint = true;
        return;
      }
      if (sample.solid ? !solidSilhouetteInk(artworkPixels(image, width, height)) :
          sample.colorLift ? resource.kind !== 'svg' : !neutralSilhouetteInk(artworkPixels(image, width, height))) return;
      sample.tint = true;
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
    if (parent?.matches('a[href]') && parent.childElementCount === 1 && !parent.textContent.trim() && element.alt &&
        element.clientWidth >= 96 && element.clientWidth <= 400 && element.clientHeight >= 20 && element.clientHeight <= 160 &&
        element.complete && element.naturalWidth * element.naturalHeight <= 262144 &&
        style.filter === 'none' && style.opacity === '1' && style.mixBlendMode === 'normal' &&
        chromiumSrgb(style.backgroundColor)?.[3] === 0) {
      const light = authoredSolidBackdrop(parent);
      const dark = preset === 'chromium' ? chromiumTextBackdrop(parent,new Map()) : textBackdrop(parent,new Map());
      if (light?.[3] === 1 && luminance(light) > .75 && dark && luminance(dark) < .12) {
        const key = `${element.currentSrc}|${light}|${dark}`;
        let sample = linkedArtworkBackings.get(element);
        if (sample?.key !== key) {
          const pixels = sampleArtwork(element,light,dark);
          sample = { key, backing: false }; linkedArtworkBackings.set(element,sample);
          // Uniform glyphs use their existing tint path. Mixed artwork keeps
          // source colors; a static-resource proof is required before backing it.
          if (pixels && !solidSilhouetteInk(pixels)) {
            const pending = staticArtworkResource(element.currentSrc);
            const decide = resource => {
              if (!resource || resource.kind === 'opacity-svg' || linkedArtworkBackings.get(element) !== sample) return;
              sample.backing = true;
              if (preset && element.isConnected) scheduleDirtySurface(element);
            };
            if (Object.hasOwn(pending,'verified')) decide(pending.verified); else pending.then(decide);
          }
        }
        if (sample.backing) return { backing: light };
      }
    }
    // Compact image rows with adjacent labels often carry mixed wordmarks.
    // Preserve a light backing only after the existing pixel loss test agrees.
    let row = parent?.parentElement;
    for (let depth=0;row&&depth<2&&!['flex','inline-flex'].includes(getComputedStyle(row).display);depth++) row=row.parentElement;
    if (row && row.children.length <= 12 && ['flex', 'inline-flex'].includes(getComputedStyle(row).display) &&
        row.querySelectorAll('img').length >= 2 && row.querySelectorAll('img').length <= 8 &&
        row.textContent.trim() && row.textContent.trim().length <= 120 &&
        !row.querySelector('button,input,video,canvas') && parent.querySelectorAll('img').length === 1 &&
        element.clientWidth >= 48 && element.clientWidth <= 320 && element.clientHeight >= 20 && element.clientHeight <= 64) {
      const light = authoredSolidBackdrop(row);
      const dark = palettes[preset] ? textBackdrop(row, new Map()) :
        light && (chromiumColor(light, 'background') ?? light);
      const backing = artworkBackingForImage(element, light, dark, false, 48);
      if (backing) return { backing };
    }
    // A home/header link can contain a logo followed by the site's name. Keep
    // a backing on the image alone; whitening the whole link would affect text.
    if (parent instanceof HTMLAnchorElement && parent.firstElementChild === element &&
        parent.childElementCount > 1 && parent.textContent.trim().length <= 120 &&
        (parent.closest('header,[role="banner"]') || parent.relList.contains('home') ||
          (parent.origin === location.origin && parent.pathname === '/'))) {
      const [light, dark] = surroundingArtworkColors(element);
      const backing = artworkBackingForImage(element, light, dark);
      if (backing) return { backing };
    }
    if (parent instanceof HTMLAnchorElement && element.style.getPropertyPriority('background-color') !== 'important') {
      const linkStyle = getComputedStyle(parent);
      // An inline link around a block image has no box behind the image.
      if (linkStyle.display === 'inline') {
        return { backing: wrappedArtworkBacking(parent, linkStyle, chromiumSrgb(linkStyle.backgroundColor), null) };
      }
    }
    let light, dark;
    if (parent?.matches(heading) && parent.firstElementChild === element && parent.textContent.trim().length <= 120) {
      [light, dark] = surroundingArtworkColors(element);
    } else {
      const figure = parent?.closest('figure');
      if (!figure?.querySelector('figcaption') || figure.querySelectorAll('img').length !== 1 ||
          element.clientWidth > 400 || element.clientHeight > 240 || element.naturalWidth * element.naturalHeight > 262144) return {};
      light = authoredSolidBackdrop(figure);
      const palette = palettes[preset];
      dark = palette ? palette.surface.slice(1).match(/../g).map(channel => parseInt(channel, 16)).concat(1) :
        light && (chromiumColor(light, 'background') ?? light);
    }
    const backing = artworkBackingForImage(element, light, dark, Boolean(parent.textContent.trim()));
    if (backing && artworkContrast.get(element)?.tint) {
      return { filter: `brightness(0) invert(1) brightness(${artworkTintLevel(dark)})` };
    }
    return { backing };
  }

  function artworkBackingForImage(image, original, darkened, allowTint = false, minimumWidth = 96) {
    if (!darkened || original?.[3] !== 1 || luminance(original) < .75 || luminance(darkened) > .12) return null;
    if (!image.complete || !image.naturalWidth || !image.naturalHeight ||
        image.style.getPropertyPriority('background-color') === 'important') return null;
    const imageStyle = getComputedStyle(image);
    if (!['inline', 'block'].includes(imageStyle.display) || imageStyle.backgroundImage !== 'none' ||
        chromiumSrgb(imageStyle.backgroundColor)?.[3] !== 0 || imageStyle.mixBlendMode !== 'normal' ||
        imageStyle.filter !== 'none' || imageStyle.opacity !== '1' ||
        ['absolute', 'fixed'].includes(imageStyle.position) || image.clientWidth < minimumWidth || image.clientHeight < 20) return null;
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

  function rememberArtworkLayers(element, style) {
    if (element.childElementCount || element.textContent.trim() || element.clientWidth < 96 ||
        element.clientWidth > 800 || element.clientHeight < 20 || element.clientHeight > 240) {
      authoredArtworkLayers.delete(element); return;
    }
    const properties = ['backgroundImage','backgroundColor','backgroundSize','backgroundRepeat','backgroundOrigin',
      'backgroundPositionX','backgroundPositionY','opacity','filter','mixBlendMode','transform','clipPath',
      'content','display','width','height','outlineStyle','outlineWidth','outlineColor',
      ...borderEdges.flatMap(side=>['Color','Style','Width'].map(property=>`border${side}${property}`))];
    const layers = ['', '::before', '::after'].map(pseudo=>{
      const paint=pseudo?getComputedStyle(element,pseudo):style;
      return [pseudo,Object.fromEntries(properties.map(property=>[property,paint[property]]))];
    });
    if (layers.some(([,paint])=>paint.backgroundImage!=='none')) authoredArtworkLayers.set(element,layers);
    else authoredArtworkLayers.delete(element);
  }

  function backgroundArtworkPaint(element, style, getBackdrop) {
    // Empty compact artwork can live outside a link too. Require known source
    // backing and measured local edge loss, rather than guessing from a name.
    // A sampled light backing preserves a mixed logo instead of tinting its inks.
    // Palette repair runs after applying roles. Reading its own previous
    // pseudoelement backing here would make the decision alternate on each
    // sample. Keep authored layer facts separate from the displayed backdrop.
    const layers = authoredArtworkLayers.get(element);
    if (!layers) return [];
    style = layers[0][1];
    const link = element.matches('a[href]') ? element : element.parentElement;
    const linked = link?.matches('a[href]');
    if ((linked && (link.textContent.trim() ||
        (link !== element && (link.childElementCount !== 1 || element.childElementCount)))) ||
        (!linked && !element.matches('div,span,[role="img"]')) || element.matches('[aria-hidden="true"]') ||
        element.childElementCount || element.textContent.trim() ||
        !(Number(style.opacity) >= .5) || style.filter !== 'none' || style.mixBlendMode !== 'normal' ||
        style.transform !== 'none' || style.clipPath !== 'none' ||
        element.closest(':disabled,[aria-disabled="true"]')) return [];
    if (element.clientWidth < 96 || element.clientWidth > 800 || element.clientHeight < 20 || element.clientHeight > 240) return [];
    if (layers.filter(([, paint]) => paint.backgroundImage !== 'none').length !== 1) return [];
    const ownImage = style.backgroundImage !== 'none';
    const base = ownImage ? element.parentElement : element;
    let original = authoredSolidBackdrop(base);
    const backdrop = getBackdrop(base);
    if (!original || original[3] !== 1 || !backdrop || luminance(backdrop) > .12) return [];
    // Transparent static wordmarks may already have poor source contrast on
    // dark backing. Verify that a light candidate actually restores local ink
    // edges, rather than treating a bad source appearance as acceptance.
    const sourceWasDark=luminance(original)<.18;
    if(sourceWasDark)original=[255,255,255,1];
    if(luminance(original)<.75)return [];
    const fixes = [];
    for (const [pseudo, paint] of layers) {
      const width = pseudo ? parseFloat(paint.width) : element.clientWidth;
      const height = pseudo ? parseFloat(paint.height) : element.clientHeight;
      if ((pseudo && paint.content !== '""') || paint.display === 'none' ||
          !(width >= 96 && width <= 800 && height >= 20 && height <= 240 && width >= height * 2) ||
          !['contain','cover'].includes(paint.backgroundSize) || !['no-repeat','repeat','repeat-x','repeat-y'].includes(paint.backgroundRepeat) ||
          paint.backgroundOrigin !== 'padding-box' || chromiumSrgb(paint.backgroundColor)?.[3] !== 0 ||
          paint.filter !== 'none' || paint.opacity !== '1' || paint.mixBlendMode !== 'normal' ||
          paint.transform !== 'none' || paint.clipPath !== 'none' || paintedBorderSides(paint).length ||
          hasPaintedOutline(paint)) continue;
      const match = /^url\("([^"\\]+)"\)$/.exec(paint.backgroundImage);
      if (!match) continue;
      const source = new URL(match[1], location.href).href;
      if (!/^(?:https?:|data:image\/)/i.test(source)) continue;
      // The static sampler evaluates the visible crop. A repeat declaration is
      // accepted only when no additional tile enters it; genuine patterns stay
      // outside this single-artwork backing rule. Downsample larger hosts so
      // the evidence stays capped at 16,384 pixels.
      const position = [paint.backgroundPositionX, paint.backgroundPositionY];
      if (!position.every(value => value === '0px' || /^(?:100|\d{1,2}(?:\.\d+)?)%$/.test(value))) continue;
      const key = JSON.stringify(['backing', source, width, height, paint.backgroundSize,paint.backgroundRepeat,position, original, backdrop,sourceWasDark]);
      let entry = compactBackgrounds.get(key);
      if (!entry) {
        if (compactBackgrounds.size >= 128) continue;
        if (compactBackgroundPending >= 8) {
          if (compactBackgroundWaiters.size < 32) compactBackgroundWaiters.add(element);
          continue;
        }
        entry = { done: false, backing: false, users: new Set() };
        compactBackgrounds.set(key, entry); compactBackgroundPending++;
        const scale=Math.min(1,Math.sqrt(16384/(width*height)));
        void compactBackgroundTask(() => sampleStaticBackground(source, Math.max(1,Math.floor(width*scale)), Math.max(1,Math.floor(height*scale)),
          paint.backgroundSize, position, paint.backgroundRepeat, (pixels, w, h) => artworkLosesContrast(pixels, w, h, original, backdrop,sourceWasDark?3:2)))
          .then(backing => {
            entry.backing = Boolean(backing); entry.done = true;
            for (const user of entry.users) if (preset && user.isConnected && backing) scheduleDirtySurface(user);
            entry.users.clear();
          }).catch(() => { entry.done = true; entry.users.clear(); }).finally(finishCompactBackground);
      }
      if (!entry.done) entry.users.add(element);
      else if (entry.backing) fixes.push([pseudo, `background-color: ${rgba(original)} !important;`]);
    }
    return fixes;
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

  function silhouetteColorLift(ink, backdrop, minimumOpacity = 1) {
    const brighter = readableColor(ink, backdrop, 7);
    if (!brighter) return 0;
    // The contrast floor alone leaves black functional silhouettes mid-gray.
    // Use white for neutral ink that needs repair; retain the existing graded
    // lift for chromatic ink, and leave already-readable neutral ink alone.
    if (Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) <= 16) return 1;
    const channel = ink.indexOf(Math.min(...ink.slice(0, 3)));
    let lift = (brighter[channel] - ink[channel]) / (255 - ink[channel]);
    if (minimumOpacity < 1) {
      const ratio = value => contrastRatio(luminance(compositeColor([
        ...ink.slice(0,3).map(c=>c+(255-c)*value),minimumOpacity],backdrop)),luminance(backdrop));
      // Keep the ordinary opaque target when it also supports the dimmest
      // verified state. Raise further only when that state's readability needs it.
      if (ratio(lift) < 4.5) {
        if (ratio(1) < 4.5) return 0;
        let low=lift,high=1;
        for(let i=0;i<8;i++){const middle=(low+high)/2;if(ratio(middle)>=4.5)high=middle;else low=middle;}
        lift=high;
      }
    }
    return lift;
  }

  function nestedCardImageGlyph(image) {
    // A card's icon can sit in an empty stretched wrapper, with its label in
    // another branch. Bound the walk; arbitrary article artwork is not a glyph.
    if (!(image.alt || image.title) || Math.max(image.clientWidth, image.clientHeight) > 64 ||
        Math.max(image.naturalWidth, image.naturalHeight) > 128) return false;
    let node = image.parentElement;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const source = authoredBackdropStyle(node);
      if (source.opacity !== '1' || source.filter !== 'none' || source.mixBlendMode !== 'normal' ||
          source.backgroundImage !== 'none') return false;
      if (node.matches('a[href]')) {
        const label = node.textContent.trim();
        return !node.matches('[aria-disabled="true"]') && label.length > 0 && label.length <= 160 &&
          ['block', 'flex', 'inline-flex', 'grid', 'inline-grid'].includes(source.display) &&
          node.clientWidth >= 96 && node.clientWidth <= 640 && node.clientHeight >= 64 && node.clientHeight <= 480 &&
          node.querySelectorAll('img').length === 1;
      }
      const fill = chromiumSrgb(source.backgroundColor);
      const lightWrapper = fill?.[3] === 1 && luminance(fill) > .75 &&
        Math.max(...fill.slice(0,3))-Math.min(...fill.slice(0,3)) <= 20;
      if (!node.matches('div,span') || (fill?.[3] !== 0 && !lightWrapper)) return false;
    }
    return false;
  }

  function linkedGlyphFilter(image, style, getBackdrop) {
    const link = image.parentElement;
    const imageOnly = link && !link.textContent.trim() && link.childElementCount === 1;
    const adjacentLink = link?.matches('p,span,div') && (image.alt || image.title) &&
      ((image.nextElementSibling?.matches('a[href]') && image.nextElementSibling.textContent.trim()) ||
        (link.querySelectorAll('img').length === 1 && link.textContent.trim().length <= 160 &&
          Array.prototype.some.call(link.childNodes, textNode))) && Math.max(image.clientWidth, image.clientHeight) <= 32;
    const iconButton = link?.matches('button,[role="button"]') && imageOnly &&
      !link.matches(':disabled,[aria-disabled="true"]') &&
      (link.getAttribute('aria-label') || link.title || image.alt) &&
      Math.max(image.clientWidth, image.clientHeight) <= 48 &&
      Math.max(image.naturalWidth, image.naturalHeight) <= 128;
    const badgeStyle = imageOnly && link.matches('div,span') && authoredBackdropStyle(link);
    const cardGlyph = badgeStyle && link.nextElementSibling?.matches(`${heading},p,span`) &&
      link.nextElementSibling.textContent.trim() &&
      link.nextElementSibling.textContent.trim().length <= 160 &&
      ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(badgeStyle.display) &&
      link.clientWidth >= 20 && link.clientHeight >= 20 && link.clientWidth <= 80 && link.clientHeight <= 80 &&
      parseFloat(badgeStyle.borderTopLeftRadius) >= Math.min(link.clientWidth, link.clientHeight) / 2 &&
      chromiumSrgb(badgeStyle.backgroundColor)?.[3] === 1 && badgeStyle.backgroundImage === 'none' &&
      Math.max(image.clientWidth, image.clientHeight) <= 48 && Math.max(image.naturalWidth, image.naturalHeight) <= 128;
    const nestedCardGlyph = imageOnly && link.matches('div,span') && nestedCardImageGlyph(image);
    const contextual = link instanceof HTMLAnchorElement && link.hasAttribute('href') || iconButton || cardGlyph || adjacentLink || nestedCardGlyph;
    // A small verified neutral silhouette does not need a link or alt label
    // to remain visible. Keep authored fading, disabled states and complex
    // artwork outside this fallback; static-resource verification still runs.
    let neutralCandidate = !contextual && image.clientWidth > 0 && image.clientHeight > 0 && image.complete && image.naturalWidth > 0 && Math.max(image.clientWidth,image.clientHeight,image.naturalWidth,image.naturalHeight) <= 128 &&
      !image.closest(':disabled,[aria-disabled="true"],[aria-hidden="true"]');
    let neutralDepth=0;
    for(let node=image;neutralCandidate&&node&&node!==document.body;node=node.parentElement){
      if(++neutralDepth>16){neutralCandidate=false;break;}
      const layer=authoredBackdropStyle(node);
      if(layer.opacity!=='1'||layer.filter!=='none'||layer.mixBlendMode!=='normal')neutralCandidate=false;
    }
    if(neutralCandidate){
      const key=`${image.currentSrc}|${image.naturalWidth}|${image.naturalHeight}`;
      let probe=neutralImageProbes.get(image);
      if(probe?.key!==key){probe={key,neutral:Boolean(neutralSilhouetteInk(artworkPixels(image,image.naturalWidth,image.naturalHeight)))};neutralImageProbes.set(image,probe);}
      neutralCandidate=probe.neutral;
    }
    if (!(neutralCandidate || contextual) ||
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
      const colorLift = solid ? silhouetteColorLift(solid, backdrop) :
        imageOnly ? 0 : ink ? 0 : relatedColorLift(pixels, backdrop);
      const crossOriginSolid = imageOnly && !pixels && new URL(image.currentSrc).origin !== location.origin;
      sample = { key, tint: false, colorLift, solid: Boolean(solid), crossOriginSolid, backdrop, imageOnlyGlyph: imageOnly,
        neutralTint: Boolean(ink && readableColor(ink, backdrop, 4.5)) };
      artworkContrast.set(image, sample);
      if (imageOnly || colorLift || crossOriginSolid || (ink && readableColor(ink, backdrop, 4.5))) checkArtworkTint(image, sample);
    }
    if (sample.tint) {
      // A uniform white lift desaturates colored ink. For a verified simple
      // embedded SVG, reuse the vector glyph conversion instead: only paint
      // changes, retaining alpha, geometry, resource identity and native hue.
      if (sample.solid && !sample.opacityOnly && image.currentSrc.startsWith('data:image/svg+xml,')) {
        const glyph = backgroundSvgGlyph({ backgroundImage: `url("${image.currentSrc}")`,
          backgroundRepeat: 'no-repeat', backgroundSize: 'auto' });
        const imagePaint = glyph && Math.max(...glyph.ink.slice(0, 3)) - Math.min(...glyph.ink.slice(0, 3)) > 24 &&
          contrastingSvgBackground(glyph, backdrop, 7, true);
        if (imagePaint) {
          sample.svgPaint = `content: ${imagePaint} !important;`;
          return 'none';
        }
      }
      return sample.colorLift ? `invert(1) brightness(${1 - sample.colorLift}) invert(1)` :
        'brightness(0) invert(1)';
    }
  }

  function smallLabeledSvgPaint(image, style, getBackdrop) {
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth ||
        image.clientWidth > 80 || image.clientHeight > 80 || image.naturalWidth > 320 || image.naturalHeight > 320 ||
        style.filter !== 'none' || style.opacity !== '1' || style.mixBlendMode !== 'normal') return '';
    const parent = image.parentElement;
    if (!parent || !parent.textContent.trim() || parent.textContent.trim().length > 160 ||
        parent.querySelectorAll('img').length !== 1 || !Array.prototype.some.call(parent.children, child =>
          child !== image && Array.prototype.some.call(child.childNodes, textNode))) return '';
    const backdrop = getBackdrop(image), original = authoredSolidBackdrop(parent);
    if (!backdrop || luminance(backdrop) >= .18 || original?.[3] !== 1 || luminance(original) < .6) return '';
    const source = image.currentSrc;
    let entry = labeledSvgArtwork.get(source);
    if (!entry) {
      if (labeledSvgArtwork.size >= 32 || !sampleArtwork(image, original, backdrop)) return '';
      entry = { svg: null, done: false, users: new Set() }; labeledSvgArtwork.set(source, entry);
      const task = artworkReadQueue.then(async () => {
        const resource = await readImageResource(source, new URL(source).origin === location.origin ? 'same-origin' : 'cors');
        if (resource?.type !== 'image/svg+xml' || resource.data.length > 4096) return;
        const svg = new TextDecoder().decode(resource.data).trim();
        if (!isStaticSvgArtwork(resource.data) || /<(?!\/?(?:svg|g|path|circle|ellipse|line|polygon|polyline|rect|title|desc)\b)|\b(?:style|class|href|opacity|fill-opacity|stroke-opacity)\s*=/i.test(svg)) return;
        const inks = [...svg.matchAll(svgPaint)].map(match => match[3]).filter(value => value !== 'none');
        if (new Set(inks).size < 2 || new Set(inks).size > 4 || inks.some(value =>
          !/^#[\da-f]{6}$/i.test(value) && !gradientColor(value, true))) return;
        entry.svg = svg;
      }).catch(() => {}).finally(() => {
        entry.done = true;
        for (const user of entry.users) if (preset && user.isConnected) scheduleDirtySurface(user);
        entry.users.clear();
      });
      artworkReadQueue = task;
    }
    if (!entry.done) { entry.users.add(image); return ''; }
    if (!entry.svg) return '';
    let changed = false;
    const svg = entry.svg.replace(svgPaint, (whole, property, quote, value) => {
      if (value === 'none') return whole;
      const original = /^#[\da-f]{6}$/i.test(value) ? [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)).concat(1) : gradientColor(value, true);
      const ink = paletteGlyphInk(original, backdrop);
      if (!ink) return whole;
      changed = true; return `${property}=${quote}rgb(${ink.slice(0, 3).join(',')})${quote}`;
    });
    return changed ? `content: url("data:image/svg+xml,${encodeURIComponent(svg)}") !important;` : '';
  }

  function solidSilhouetteInk(pixels, minimumOpaque = 16, maximumSpread = 8) {
    if (!pixels) return null;
    let ink, transparent = 0, opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) transparent++;
      if (pixels[index + 3] < 224) continue;
      const color = [pixels[index], pixels[index + 1], pixels[index + 2], 1];
      ink ??= color;
      if (color.some((channel, i) => Math.abs(channel - ink[i]) > maximumSpread)) return null;
      opaque++;
    }
    return opaque >= minimumOpaque && transparent >= pixels.length / 80 ? ink : null;
  }

  function artworkTintLevel(backdrop) {
    const neutral = [209, 209, 209, 1];
    return (readableColor(neutral, backdrop) ?? neutral)[0] / 255;
  }

  function readableColor(color, backdrop, minimum = 4.5, steps = 16) {
    const light = luminance(backdrop);
    const ratio = ink => contrastRatio(luminance(compositeColor(ink, backdrop)), light);
    if (ratio(color) >= minimum) return null;
    const target = light + .05 > Math.sqrt(.05 * 1.05) ? 0 : 255;
    minimum = Math.min(minimum, ratio([target, target, target, 1]));
    let low = 0;
    let high = steps;
    while (high - low > 1) {
      const step = (high + low) >> 1;
      const candidate = color.map((channel, index) => index === 3 ? 1 :
        Math.round(channel + (target - channel) * step / steps));
      if (ratio(candidate) >= minimum) high = step;
      else low = step;
    }
    return color.map((channel, index) => index === 3 ? 1 :
      Math.round(channel + (target - channel) * high / steps));
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
    const authoredDarkEdge = value => {
      sourceBackdrop ??= authoredSolidBackdrop(element);
      // A border designed for an already-dark surface is not a light-mode
      // frame to attenuate. Preserve its authored weight, including chroma.
      return sourceBackdrop && luminance(sourceBackdrop) < .18 ? chromiumSrgb(value) : null;
    };
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
        const color = strengthen(original, darkEdgeInk(original) ?? authoredDarkEdge(original));
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
      if (authoredDarkEdge(value)) return value;
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
    const accessibleGlyph = element.hasAttribute('aria-label') && element.getAttribute('aria-label').trim().length > 1 &&
      Array.from(element.textContent.trim()).length === 1;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (accessibleGlyph || !node.textContent.trim() || node.parentElement.closest('svg')) continue;
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
    if (!outside) return '';
    const { minimum, edgeWidth } = separatorLevels[emphasizeSeparators];
    const edge = readableColor(backdrop, backdrop, minimum);
    return `box-shadow: inset 0 0 0 ${edgeWidth}px ${rgba(edge)}` +
      (shadow === 'none' ? '' : `, ${shadow}`) + ' !important;';
  }

  function formPanelEdge(element, backdrop) {
    if (!emphasizeSeparators) return '';
    const source = authoredBackdropStyle(element);
    if (!formPanelShadow(element, source)) return '';
    return raisedSurfaceEdge(source, backdrop, backdrop, source.boxShadow);
  }

  function semanticNoteSurface(element) {
    return element.matches('blockquote,aside,[role="note"]') ||
      element.parentElement?.matches('blockquote,aside,[role="note"]');
  }

  function paddedControlPanel(element, style) {
    if (!element.matches('div,section,article,aside') || element.closest(interactive) ||
        style.backgroundImage !== 'none' || parseFloat(style.paddingTop) < 12 ||
        parseFloat(style.borderTopLeftRadius) < 4 || element.clientWidth < 160 || element.clientWidth > 960 ||
        element.clientHeight < 64 || element.clientHeight > 320 || !element.textContent.trim() ||
        element.textContent.trim().length > 600 ||
        element.querySelector('img,video,canvas')) return false;
    const fill = chromiumSrgb(style.backgroundColor);
    if (fill?.[3] !== 1 || Math.max(...fill.slice(0, 3)) - Math.min(...fill.slice(0, 3)) > 24) return false;
    const candidates = element.querySelectorAll('button,input:not([type="hidden"]),select,textarea,[role="button"]');
    if (candidates.length > 16) return false;
    const controls = [...candidates]
      .filter(control => control.clientWidth > 0 && control.clientHeight > 0 && getComputedStyle(control).visibility !== 'hidden');
    return controls.length > 0 && controls.length <= 8 && controls.every(control => {
      let node = control;
      for (let depth = 0; node && depth < 4; depth++) {
        node = node.parentElement;
        if (node === element) return true;
      }
      return false;
    });
  }

  function semanticSurfaceEdge(element, backdrop) {
    if (!emphasizeSeparators || !backdrop || luminance(backdrop) > .18) return '';
    const style = authoredBackdropStyle(element), fill = chromiumSrgb(style.backgroundColor);
    const action = compactTextControl(element) && ['flex', 'inline-flex'].includes(style.display) &&
      parseFloat(style.borderTopLeftRadius) >= 4;
    const note = semanticNoteSurface(element), panel = paddedControlPanel(element, style);
    // Palette cards already receive the preference-controlled card-outline.
    // Do not stack an inset stroke over that existing optional frame.
    if (panel && !note && !action && palettes[preset]) return '';
    if (!(note || action || panel) || !fill?.[3] || style.backgroundImage !== 'none' ||
        parseFloat(style.paddingTop) < 6 || Math.max(...fill.slice(0, 3)) - Math.min(...fill.slice(0, 3)) > 24) return '';
    return raisedSurfaceEdge(style, backdrop, backdrop, style.boxShadow);
  }

  function clippedPanelEdge(element, backdrop) {
    if (!emphasizeSeparators || !element.matches('div,section,header,aside') || element.closest(interactive)) return '';
    const source = authoredBackdropStyle(element), fill = chromiumSrgb(source.backgroundColor);
    if (fill?.[3] !== 1 || source.borderStyle !== 'none' ||
        source.borderImageSource !== 'none' || hasPaintedOutline(source) ||
        parseFloat(source.borderTopLeftRadius) < 8 ||
        !['hidden', 'clip'].includes(source.overflowX) || !['hidden', 'clip'].includes(source.overflowY) ||
        element.clientWidth < 160 || element.clientHeight < 64 || element.children.length > 32) return '';
    // An image does not erase the panel's opaque base or its outline. Use
    // that base for the frame policy, without claiming picture-pixel contrast.
    backdrop ??= palettes[preset] ? chromiumSrgb(getComputedStyle(element).backgroundColor) :
      chromiumSurfaceColor(element, source, fill) ?? fill;
    if (!backdrop || luminance(backdrop) > .18) return '';
    // A shallow heading distinguishes a clipped content panel from rounded
    // artwork, empty decoration and distant headings inside a whole page.
    const queue = [...element.children].map(node => [node, 1]);
    let found = false, visited = 0;
    while (queue.length && visited++ < 32) {
      const [node, depth] = queue.shift();
      if (node.matches(heading)) { found = true; break; }
      if (depth < 3) {
        if (visited + queue.length + node.children.length > 32) return '';
        queue.push(...[...node.children].map(child => [child, depth + 1]));
      }
    }
    if (!found) return '';
    const { minimum, edgeWidth } = separatorLevels[emphasizeSeparators];
    // Outline paints above child pictures; an inset shadow can be covered by
    // them. A negative offset keeps the frame inside the existing geometry.
    return `outline: ${edgeWidth}px solid ${rgba(readableColor(backdrop, backdrop, minimum))} !important;` +
      `outline-offset: -${edgeWidth}px !important;`;
  }

  function raisedLink(element, style) {
    return element.matches('a[href]:not([aria-disabled="true"])') &&
      ['block', 'flex', 'grid'].includes(style.display) && parseFloat(style.borderTopLeftRadius) >= 4 &&
      style.boxShadow !== 'none' && !style.boxShadow.includes('inset') && chromiumSrgb(style.backgroundColor)?.[3] === 1 &&
      element.clientWidth >= 120 && element.clientHeight >= 44;
  }

  function formPanelShadow(element, style) {
    if (!style.filter?.startsWith('drop-shadow(') || !element.matches('div,section,form') || !element.querySelector(heading) ||
        !(element.matches('form') || element.querySelectorAll('form').length === 1) ||
        parseFloat(style.borderTopLeftRadius) < 4 || parseFloat(style.paddingTop) < 16 ||
        element.clientWidth < 160 || element.clientHeight < 80) return null;
    const shadows = /drop-shadow\((rgba?\([^)]+\)) (-?[\d.]+px) (-?[\d.]+px) ([\d.]+px)\)/g;
    const matches = [...style.filter.matchAll(shadows)];
    if (!matches.length || matches.length > 4 || style.filter.replace(shadows, '').trim()) return null;
    if (matches.some(([, value]) => {
      const ink = chromiumSrgb(value);
      return !ink?.[3] || luminance(ink) >= .05 || Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) >= 16;
    })) return null;
    return style.filter.replace(shadows, (match, value) => match.replace(value,
      rgba([255, 255, 255, Math.min(.14, chromiumSrgb(value)[3] * .8)])));
  }

  function formPanelCanvasPaint(element, style, source) {
    // Bounded structural search: only a padded, light, opaque layout canvas
    // with one elevated form panel through transparent wrappers qualifies.
    // Do not scan whole documents or infer elevation from text height.
    if (!element.matches('div,section,main') || parseFloat(style.paddingTop) < 24 ||
        element.children.length > 4 || !element.children.length) return null;
    const queue = [...element.children].map(node => [node, 1]);
    let panel = null, visited = 0;
    while (queue.length && visited++ < 48) {
      const [node, depth] = queue.shift(), layer = authoredBackdropStyle(node);
      const fill = chromiumSrgb(layer.backgroundColor);
      if (fill?.[3]) {
        if (panel || fill[3] !== 1 || layer.backgroundImage !== 'none' ||
            node.style.getPropertyPriority('background-color') === 'important' ||
            contrastRatio(luminance(fill), luminance(source)) > 1.12 ||
            !formPanelShadow(node, layer)) return null;
        panel = { node, layer, fill };
      } else {
        if (layer.backgroundImage !== 'none' || depth >= 4 && node.children.length) return null;
        if (visited + queue.length + node.children.length > 48) return null;
        queue.push(...[...node.children].map(child => [child, depth + 1]));
      }
    }
    if (queue.length || !panel) return null;
    const palette = palettes[preset];
    const base = palette ? palette.surface.slice(1).match(/../g).map(c => parseInt(c, 16)).concat(1) :
      chromiumSurfaceColor(panel.node, panel.layer, panel.fill);
    if (!base || luminance(base) > .18) return null;
    let low = 0, high = 1;
    for (let step = 0; step < 12; step++) {
      const blend = (low + high) / 2;
      const ink = base.map((c, i) => i === 3 ? 1 : Math.round(c + (255 - c) * blend));
      if (contrastRatio(luminance(ink), luminance(base)) < 1.18) low = blend;
      else high = blend;
    }
    return { surface: base.map((c, i) => i === 3 ? 1 : Math.round(c + (255 - c) * high)),
      shadow: null, filter: style.filter };
  }

  function separatedControlSurface(element, style, source, surface, getOutside) {
    // Preserve a source-authored filled action's affordance when dark conversion
    // collapses its fill into the surrounding canvas. This is not a universal
    // control contrast requirement, nor a reason to frame ordinary text links.
    if (!compactTextControl(element) || !source || source[3] !== 1 || !surface || surface[3] !== 1 ||
        Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)) > 24 ||
        style.backgroundImage !== 'none' || style.opacity !== '1' || style.filter !== 'none' ||
        style.mixBlendMode !== 'normal' || element.style.getPropertyPriority('background-color') === 'important' ||
        !['flex', 'inline-flex', 'inline-block'].includes(style.display) ||
        element.clientHeight < 24 || parseFloat(style.paddingTop) < 6 || parseFloat(style.paddingLeft) < 8 ||
        parseFloat(style.borderTopLeftRadius) < 4 || hasPaintedOutline(style)) return null;
    // A distinct authored edge already communicates the boundary. Matching-fill
    // borders are not distinct edges; preserve those controls' fill affordance.
    if (paintedBorderSides(style).some(side => {
      const ink = chromiumSrgb(style[`border${side}Color`]);
      return ink && contrastRatio(luminance(compositeColor(ink, source)), luminance(source)) >= 1.5;
    })) return null;
    const parent = element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
    const originalOutside = authoredSolidBackdrop(parent);
    if (!originalOutside || contrastRatio(luminance(source), luminance(originalOutside)) < 1.5) return null;
    const outside = getOutside(parent);
    if (!outside || luminance(outside) > .16 || luminance(surface) > .18 ||
        contrastRatio(luminance(surface), luminance(outside)) >= 1.5) return null;
    // Finer interpolation avoids overshooting a subtle surface step, which
    // would also leave less contrast headroom for text and optional borders.
    return readableColor(surface, outside, 1.5, 256);
  }

  function separatedCardPaint(element, style, source, surface) {
    // A dark source panel can be strongly separated from a light canvas even
    // though its own fill needs no dark conversion. Preserve that grouping
    // when the surrounding canvas darkens; do not treat every dark band as a
    // card, or alter panels that were already subtle on a dark source canvas.
    if (source?.[3] === 1 && luminance(source) < .18 &&
        Math.max(...source.slice(0,3))-Math.min(...source.slice(0,3)) <= 20 &&
        element.matches('div,section,article,aside') && element.textContent.trim() &&
        element.clientWidth >= 120 && element.clientWidth <= 1200 &&
        element.clientHeight >= 44 && element.clientHeight <= 600 &&
        parseFloat(style.paddingTop) >= 12 && parseFloat(style.paddingLeft) >= 12 &&
        style.backgroundImage === 'none' && style.filter === 'none' && style.opacity === '1' &&
        style.mixBlendMode === 'normal' && !element.closest(interactive) &&
        !element.querySelector('img,svg,video,canvas') &&
        !paintedBorderSides(style).some(side => {
          const ink = chromiumSrgb(style[`border${side}Color`]);
          return ink?.[3] && Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3)) > 20;
        }) &&
        element.style.getPropertyPriority('background-color') !== 'important') {
      const originalParent = authoredSolidBackdrop(element.parentElement);
      const palette = palettes[preset];
      const parent = palette ? palette.surface.slice(1).match(/../g).map(c=>parseInt(c,16)).concat(1) :
        chromiumTextBackdrop(element.parentElement,new Map());
      const converted = surface ?? source;
      if (originalParent && luminance(originalParent) > .6 && parent && luminance(parent) < .18 &&
          contrastRatio(luminance(source),luminance(originalParent)) >= 3 &&
          contrastRatio(luminance(converted),luminance(parent)) < 1.2) {
        return {surface:readableColor(parent,parent,1.25),shadow:null};
      }
    }
    if (!palettes[preset]) {
      const action = separatedControlSurface(element, style, source, surface ?? source,
        parent => chromiumTextBackdrop(parent, new Map()));
      if (action) return { surface: action, shadow: null };
    }
    if (semanticNoteSurface(element) && source?.[3] > 0 && source[3] < .2 && luminance(source) < .18 &&
        Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)) <= 24 &&
        style.backgroundImage === 'none' && parseFloat(style.paddingTop) >= 8) {
      const parent = authoredSolidBackdrop(element.parentElement);
      const palette = palettes[preset];
      const base = palette ? palette.surface.slice(1).match(/../g).map(c=>parseInt(c,16)).concat(1) :
        parent && (chromiumColor(parent,'background') ?? parent);
      if (base && luminance(base) < .18) return { surface: readableColor(base, base, 1.2), shadow: null };
    }

    if (!source || source[3] !== 1 || !surface || luminance(surface) > .18 || luminance(source) < .75 ||
        Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)) > 20 ||
        element.style.getPropertyPriority('background-color') === 'important') return null;
    const canvasPaint = formPanelCanvasPaint(element, style, source);
    if (canvasPaint) return canvasPaint;
    if (style.backgroundImage !== 'none') return null;
    const compact = !raisedLink(element, style) && element.matches('a,button,label,span,[role="button"]') &&
      (element.textContent.trim() || element.hasAttribute('aria-label')) &&
      element.clientWidth <= 360 && element.clientHeight >= 20 &&
      (element.clientHeight <= 80 || element.clientWidth <= 80 && element.clientHeight <= 120);
    const formShadow = formPanelShadow(element, style);
    const structural = formShadow || element.matches('article,aside') && element.querySelector(heading) &&
      (paintedBorderSides(style).length || style.boxShadow !== 'none');
    if (!compact && (!(structural || raisedLink(element, style)) || element.clientWidth < 120 || element.clientHeight < 44)) return null;
    // A decorative picture on an outer canvas prevents a solid text-backdrop
    // measurement. For this opaque form panel, its canvas color still supplies
    // a conservative tonal baseline, not a claim about picture-pixel contrast.
    let originalParent = authoredSolidBackdrop(element.parentElement);
    if (!originalParent && formShadow) {
      for (let node = element.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
        const ink = chromiumSrgb(authoredBackdropStyle(node).backgroundColor);
        if (ink?.[3] === 1) { originalParent = ink; break; }
      }
    }
    if (!originalParent) return null;
    // A matching light fill is not a visible control surface on its own.
    // Navigation items often author white resting fills and reserve their
    // separate fill for hover. Do not manufacture that hovered appearance.
    if (compact && contrastRatio(luminance(source), luminance(originalParent)) <= 1.12 &&
        style.boxShadow === 'none' && !hasPaintedOutline(style) &&
        !borderEdges.every(side => {
          const ink = chromiumSrgb(style[`border${side}Color`]);
          return parseFloat(style[`border${side}Width`]) > 0 &&
            !['none','hidden'].includes(style[`border${side}Style`]) && ink?.[3] &&
            contrastRatio(luminance(compositeColor(ink, source)), luminance(source)) > 1.12;
        })) return null;
    const palette = palettes[preset];
    const paletteColor = value => value.slice(1).match(/../g).map(channel => parseInt(channel, 16)).concat(1);
    // An outlined action already has its own boundary. Raising a white source
    // fill again makes that secondary action unnecessarily pale in dark mode.
    const edge = chromiumSrgb(style.borderTopColor);
    if (compact && edge?.[3] && Math.max(...edge.slice(0, 3)) - Math.min(...edge.slice(0, 3)) >= 45 &&
        borderEdges.every(side => style[`border${side}Style`] === 'solid' &&
          parseFloat(style[`border${side}Width`]) > 0 && parseFloat(style[`border${side}Width`]) <= 2 &&
          style[`border${side}Color`] === style.borderTopColor)) {
      return { surface: palette ? paletteColor(palette.surface) : surface, shadow: null };
    }
    const parent = palette ? paletteColor(palette.surface) : chromiumColor(originalParent, 'background') ?? originalParent;
    // Elevation needs a tonal step when both light fills collapse to one dark
    // tone. The owning canvas is lifted separately; keep the panel dark and
    // retain its authored shadow rather than manufacturing a luminous halo.
    if (formShadow && contrastRatio(luminance(source), luminance(originalParent)) <= 1.12) {
      return { surface: palette ? paletteColor(palette.surface) : surface, shadow: null, filter: style.filter };
    }
    let separated = surface;
    const minimum = compact ? 1.12 : 1.2, target = compact ? 1.15 : 1.25;
    const sameSourceLevel = contrastRatio(luminance(source), luminance(originalParent)) <= 1.12;
    if (sameSourceLevel || contrastRatio(luminance(surface), luminance(parent)) < minimum) {
      separated = palette ? paletteColor(palette.raised) : readableColor(parent, parent, target);
      if (contrastRatio(luminance(separated), luminance(parent)) < minimum) separated = readableColor(parent, parent, target);
    }
    const shadow = style.boxShadow.includes('inset') ? style.boxShadow : style.boxShadow.replace(/rgba?\([^)]+\)/g, value => {
      const ink = chromiumSrgb(value);
      return ink?.[3] > 0 && luminance(ink) < .05 && Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) < 16 ?
        rgba([255, 255, 255, Math.min(.14, ink[3] * .45)]) : value;
    });
    return { surface: separated ?? surface, shadow: shadow !== style.boxShadow ? shadow : null, filter: formShadow };
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
    return box.width > 0 && box.width <= 320 && box.height > 0 && box.height <= 80;
  }

  function fileActivationFrame(element) {
    if(!element.matches('div,span,label')||element.closest('[aria-disabled="true"]')||
        !element.textContent.trim()||element.textContent.trim().length>100||
        element.clientWidth<=0||element.clientWidth>720||element.clientHeight<20||element.clientHeight>80)return false;
    const inputs=element.querySelectorAll(':scope > input[type="file"]');
    if(inputs.length!==1||inputs[0].disabled||authoredBackdropStyle(inputs[0]).opacity!=='0')return false;
    const source=authoredBackdropStyle(element),box=element.getBoundingClientRect(),input=inputs[0].getBoundingClientRect();
    return source.position==='relative'&&source.opacity==='1'&&source.filter==='none'&&
      input.width>0&&input.height>0&&input.right>box.left&&input.left<box.right&&input.bottom>box.top&&input.top<box.bottom;
  }

  function overlayActivationFrame(element, includeSelf = false) {
    for (let frame=includeSelf?element:element.parentElement,depth=0;frame&&depth<3;frame=frame.parentElement,depth++) {
      if (!frame.matches('span,div,label') || frame.clientWidth <= 0 || frame.clientWidth > 720 || frame.clientHeight > 80) continue;
      const inputs=frame.querySelectorAll('input[type="submit"],input[type="button"],select:not([multiple])');
      if (inputs.length !== 1 || inputs[0].disabled) continue;
      const input=inputs[0],style=authoredBackdropStyle(input),box=frame.getBoundingClientRect(),target=input.getBoundingClientRect();
      if (input instanceof HTMLSelectElement && input.size > 1) continue;
      const alpha=Number(style.opacity);
      if (alpha>=0 && alpha<=.02 && style.position === 'absolute' && target.width >= box.width*.8 && target.height >= box.height*.8 &&
          target.left <= box.left+2 && target.top <= box.top+2 && target.right >= box.right-2 && target.bottom >= box.bottom-2) return frame;
    }
    return null;
  }

  function translucentActionFrame(element, style) {
    const fill=chromiumSrgb(style.backgroundColor),ink=chromiumSrgb(style.borderTopColor);
    if (!compactTextControl(element) || !fill || !(fill[3]>0&&fill[3]<.5) ||
        !ink || !(ink[3]>0&&ink[3]<1) || luminance(ink)<.6 ||
        Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24 || style.borderImageSource!=='none' ||
        !borderEdges.every(side=>style[`border${side}Style`]==='solid'&&style[`border${side}Color`]===style.borderTopColor&&
          parseFloat(style[`border${side}Width`])>0&&parseFloat(style[`border${side}Width`])<=2)) return '';
    const alpha=emphasizeSeparators ? ink[3]+(1-ink[3])*separatorLevels[emphasizeSeparators].opacity : ink[3];
    return `border-color: ${rgba([...ink.slice(0,3),alpha])} !important;`;
  }

  function coloredControlBorder(element, style, getBackdrop) {
    if (element.matches(':disabled,[aria-disabled="true"]') ||
        style.borderImageSource !== 'none') return '';
    const compoundControl=fileActivationFrame(element)||selectProxyFrame(element);
    const control = compoundControl || element.matches(interactive) &&
      !element.matches('[aria-selected],[aria-current],[role="tab"]') &&
      (!element.hasAttribute('aria-pressed') || element.matches('button'));
    if (!control && !paintedBorderSides(style).length) return '';
    const source = authoredBackdropStyle(element);
    if (!control || chromiumSrgb(source.backgroundColor)?.[3] > .2) {
      // A selected card can paint its meaningful edge on a noninteractive
      // container around heading links. Do not recolor matching button fills
      // or arbitrary colored decoration as though they were such a boundary.
      const ink = chromiumSrgb(source.borderTopColor), backing = compoundControl?chromiumSrgb(source.backgroundColor):authoredSolidBackdrop(element);
      const width = parseFloat(source.borderTopWidth);
      if (!ink?.[3] || !(width > 0 && width <= 2) || !backing ||
          Math.max(...backing.slice(0, 3)) - Math.min(...backing.slice(0, 3)) > 24 ||
          contrastRatio(luminance(compositeColor(ink, backing)), luminance(backing)) < 3 ||
          !borderEdges.every(side => source[`border${side}Style`] === 'solid' &&
            source[`border${side}Color`] === source.borderTopColor && parseFloat(source[`border${side}Width`]) === width) ||
          !(control && (compactTextControl(element)||compoundControl) ||
            element.matches('article,aside,[role="option"],[role="tab"],[aria-selected="true"],[aria-current="true"]') ||
            element.querySelector('h1 a[href],h2 a[href],h3 a[href],h4 a[href],h5 a[href],h6 a[href]'))) return '';
    }
    const backdrop = compoundControl?solidControlBackdrop(element,source,getBackdrop):getBackdrop(element);
    if (!backdrop || luminance(backdrop) >= .18) return '';
    const colors = [];
    const declarations = borderEdges.map(side => {
      const width = parseFloat(source[`border${side}Width`]);
      const ink = chromiumSrgb(source[`border${side}Color`]);
      if (!(width > 0 && width <= 2) || !['solid','dashed','dotted'].includes(source[`border${side}Style`]) || !ink?.[3] ||
          Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) < 45) return '';
      const color = contrastingGlyphInk(ink, backdrop, 4.5, true) ?? ink;
      colors.push(rgba(color));
      return `border-${side.toLowerCase()}-color: ${rgba(color)} !important;`;
    }).join('');
    // Selection/status color is information, not a neutral separator. Extend
    // a uniform frame inward in its repaired Off ink instead of washing it
    // toward white. An inset extension joins the actual border without changing
    // layout or replacing the authored soft shadow. Leave mixed sides alone.
    if (!emphasizeSeparators || colors.length !== 4 || new Set(colors).size !== 1 ||
        !borderEdges.every(side => source[`border${side}Width`] === source.borderTopWidth)) return declarations;
    const level = separatorLevels[emphasizeSeparators];
    const spread = Math.round(level.opacity * level.edgeWidth * 100) / 100;
    const shadow = source.boxShadow === 'none' ? '' : `, ${source.boxShadow}`;
    return declarations + `box-shadow: inset 0 0 0 ${spread}px ${colors[0]}${shadow} !important;`;
  }

  function navigationIndicatorPaint(element, style, getBackdrop) {
    style = authoredBackdropStyle(element);
    if (!element.closest('nav,[role="navigation"]') || element.closest(':disabled,[aria-disabled="true"]') ||
        style.backgroundImage !== 'none' || style.borderImageSource !== 'none' ||
        style.transform !== 'none' || style.filter !== 'none') return '';
    const control = element.matches(interactive) ? element :
      element.matches('div,li') && element.childElementCount === 1 && element.firstElementChild.matches(interactive) ? element.firstElementChild : null;
    if (!control || element.clientWidth > 400 || element.clientHeight > 140 ||
        paintedBorderSides(style).join(',') !== 'Bottom' || style.borderBottomStyle !== 'solid') return '';
    const width = parseFloat(style.borderBottomWidth), source = chromiumSrgb(style.borderBottomColor), backdrop = getBackdrop(element);
    if (!(width > 0 && width <= 4) || !source || source[3] !== 1 ||
        Math.max(...source.slice(0,3))-Math.min(...source.slice(0,3)) < 45 || !backdrop || luminance(backdrop) > .18) return '';
    const ink = contrastingGlyphInk(source,backdrop,4.5,true) ?? source;
    const paint = `border-bottom-color: ${rgba(ink)} !important;`;
    if (!emphasizeSeparators) return paint;
    const level = separatorLevels[emphasizeSeparators], spread = Math.round(level.opacity*level.edgeWidth*100)/100;
    const shadow = style.boxShadow === 'none' ? '' : `, ${style.boxShadow}`;
    // Extend only the already-visible semantic underline, in its repaired Off
    // ink. The transparent resting reservation and layout remain untouched.
    return paint + `box-shadow: inset 0 -${spread}px 0 0 ${rgba(ink)}${shadow} !important;`;
  }

  function compositeFieldFrame(element, style, framePaint) {
    if (!emphasizeSeparators || !framePaint || !element.closest('form') ||
        !element.matches('form,div,fieldset,section') || hasPaintedOutline(style) ||
        parseFloat(style.borderTopLeftRadius)<4 || style.position!=='relative' ||
        style.overflowX!=='visible' || style.overflowY!=='visible' || getComputedStyle(element,'::after').content!=='none') return '';
    const inputs=element.querySelectorAll(textInput),width=parseFloat(style.borderTopWidth);
    const ink=chromiumSrgb(style.borderTopColor),match=/border-color:\s*([^;]+);/.exec(framePaint);
    if(inputs.length<2||inputs.length>4||!match||!ink||ink[3]!==1||
        Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24||!(width>0&&width<=2)||
        !borderEdges.every(side=>style[`border${side}Style`]==='solid'&&
          style[`border${side}Width`]===style.borderTopWidth&&style[`border${side}Color`]===style.borderTopColor))return '';
    const box=element.getBoundingClientRect();
    let touching=0;
    for(const input of inputs){
      for(let host=input.parentElement,depth=0;host&&host!==element&&depth<3;depth++,host=host.parentElement){
        const source=authoredBackdropStyle(host),rect=host.getBoundingClientRect();
        if(chromiumSrgb(source.backgroundColor)?.[3]===1&&parseFloat(source.borderTopLeftRadius)>=4&&
            !paintedBorderSides(source).length&&rect.top<=box.top+width+1&&rect.bottom>=box.bottom-width-1){touching++;break;}
      }
    }
    if(touching<2)return '';
    const level=separatorLevels[emphasizeSeparators],extent=width+level.opacity*level.edgeWidth;
    // Inset shadows and the element's outline paint below positioned children.
    // Retrace the existing frame on an unused, pointer-transparent upper layer;
    // keep overflow and layout intact rather than clipping autocomplete menus.
    const color = match[1].replace(/\s*!important\s*$/,'');
    return `content: "" !important; display: block !important; position: absolute !important;
      inset: -${width}px !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
      border-radius: inherit !important; background: none !important; pointer-events: none !important;
      box-shadow: inset 0 0 0 ${extent}px ${color} !important; z-index: 1 !important; transition: none !important;`;
  }

  function authoredFrameBorder(element, style, backdrop, sourceBackground) {
    const compact = compactTextControl(element);
    if (!backdrop || luminance(backdrop) > .18 ||
        (!compact && element.closest(interactive)) || element.closest('[role="tablist"]') || element.matches('input,select,textarea') ||
        style.borderImageSource !== 'none' || hasPaintedOutline(style)) return '';
    const background = sourceBackground ?? authoredSolidBackdrop(element);
    const color = chromiumSrgb(style.borderTopColor);
    const width = parseFloat(style.borderTopWidth);
    // Pixel snapping at fractional scale can report an authored 1px border as 0.8px.
    if (background?.[3] !== 1 || luminance(background) < .6 || color?.[3] !== 1 ||
        Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) > 16 || width <= 0 || width > 8 ||
        !['Top', 'Right', 'Bottom', 'Left'].every(side => style[`border${side}Style`] === 'solid' &&
          style[`border${side}Color`] === style.borderTopColor && parseFloat(style[`border${side}Width`]) === width)) return '';
    const originalContrast = contrastRatio(luminance(color), luminance(background));
    if (originalContrast > 3) {
      const ink = overlayActivationFrame(element,true) === element ?
        readableColor(backdrop,backdrop,Math.max(1.5,originalContrast),256) ?? color :
        contrastingGlyphInk(color, backdrop, 3, true) ?? color;
      const level = emphasizeSeparators && separatorLevels[emphasizeSeparators];
      const shadow = style.boxShadow === 'none' ? '' : `, ${style.boxShadow}`;
      return `border-color: ${rgba(ink)} !important;` + (level ?
        `box-shadow: inset 0 0 0 ${level.opacity * level.edgeWidth}px ${rgba(ink)}${shadow} !important;` : '');
    }
    // Off follows the authored visual weight; the preference supplies a graduated target.
    const baseline = Math.max(1.05, originalContrast * 1.08);
    const target = emphasizeSeparators ? baseline + separatorLevels[emphasizeSeparators].minimum - 1 : baseline;
    const edge = readableColor(backdrop, backdrop, target);
    return `border-color: ${rgba(edge)} !important;`;
  }

  function smallLabelFramePaint(element, backdrop) {
    if (!element.matches('span') || !backdrop || luminance(backdrop) > .18 ||
        element.matches(interactive) || element.closest(':disabled,[aria-disabled="true"]') ||
        !element.textContent.trim() || element.textContent.trim().length>160 || element.querySelector('img,svg,input,button')) return '';
    const style=authoredBackdropStyle(element),width=parseFloat(style.borderTopWidth),ink=chromiumSrgb(style.borderTopColor);
    if (!['inline-flex','inline-block','flex'].includes(style.display) || element.clientWidth>420 ||
        !(element.clientHeight>0&&element.clientHeight<=40)||parseFloat(style.borderTopLeftRadius)<element.clientHeight*.25||
        style.backgroundImage!=='none'||chromiumSrgb(style.backgroundColor)?.[3]!==0||style.opacity!=='1'||
        style.borderImageSource!=='none'||hasPaintedOutline(style)||!ink||ink[3]!==1||!(width>0&&width<=2)||
        Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24||
        !borderEdges.every(side=>style[`border${side}Style`]==='solid'&&style[`border${side}Color`]===style.borderTopColor&&style[`border${side}Width`]===style.borderTopWidth)||
        authoredFrameBorder(element,style,backdrop))return '';
    // Transparent inline capsules can rely on the browser canvas rather than
    // an authored white ancestor. Their existing opaque frame still needs a
    // readable edge on the measured dark backing; no new sides are invented.
    const palette=palettes[preset],base=palette?palette.border.slice(1).match(/../g).map(c=>parseInt(c,16)).concat(1):ink;
    const baseline=readableColor(base,backdrop,3)??base;
    const target=contrastRatio(luminance(baseline),luminance(backdrop))+(emphasizeSeparators?separatorLevels[emphasizeSeparators].minimum-1:0);
    return `border-color: ${rgba(readableColor(base,backdrop,target)??baseline)} !important;`;
  }

  function subtleBoundaryPaint(element, backdrop) {
    if (!(element instanceof HTMLElement) || !backdrop || luminance(backdrop) > .18 ||
        element.matches('input,select,textarea,:disabled,[aria-disabled="true"]') ||
        element.closest('[role="tablist"]')) return '';
    const style = authoredBackdropStyle(element);
    if (style.borderImageSource !== 'none' || hasPaintedOutline(style) || style.transform !== 'none' ||
        style.clipPath !== 'none' || !paintedBorderSides(style).length) return '';
    const background = authoredSolidBackdrop(element);
    if (!background || luminance(background) < .6) return '';
    // A pale divider inside a linked card or an image-only control still needs
    // its authored weight. Text/link foreground policy must not brighten it.
    return paintedBorderSides(style).map(side => {
      const ink = chromiumSrgb(style[`border${side}Color`]);
      const width = parseFloat(style[`border${side}Width`]);
      if (!(width > 0 && width <= 2) || style[`border${side}Style`] !== 'solid' || !ink?.[3] ||
          Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 24) return '';
      const ratio = contrastRatio(luminance(compositeColor(ink, background)), luminance(background));
      if (ratio > 3) return '';
      const baseline = Math.max(1.05, ratio * 1.08);
      const target = emphasizeSeparators ? baseline + separatorLevels[emphasizeSeparators].minimum - 1 : baseline;
      return `border-${side.toLowerCase()}-color: ${rgba(readableColor(backdrop, backdrop, target))} !important;`;
    }).join('');
  }

  function gradientSectionBoundary(element) {
    const source = authoredBackdropStyle(element), sides = paintedBorderSides(source);
    if (element.clientWidth < 360 || element.matches(interactive) || source.transform !== 'none' ||
        source.borderImageSource !== 'none' || chromiumSrgb(source.backgroundColor)?.[3] !== 0 ||
        sides.length !== 1 || !['Top','Bottom'].includes(sides[0])) return '';
    const side = sides[0], ink = chromiumSrgb(source[`border${side}Color`]);
    if (source[`border${side}Style`] !== 'solid' || parseFloat(source[`border${side}Width`]) > 2 ||
        !ink || ink[3] !== 1 || luminance(ink) < .6 || Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3)) > 24) return '';
    for (let node=element.parentElement, depth=0;node&&depth<3;node=node.parentElement,depth++) {
      const layer=authoredBackdropStyle(node);
      const gradients=layer.backgroundImage.match(/(?:linear|radial)-gradient\([^;]+/g);
      if (gradients) {
        const stops=[...gradients.join('').matchAll(/rgba?\([^)]+\)/g)].map(m=>chromiumSrgb(m[0]));
        if(stops.length<2||stops.some(c=>!c||c[3]!==1||luminance(c)>.08))return '';
        const base=stops.reduce((a,b)=>luminance(a)>luminance(b)?a:b);
        const minimum=1.5+(emphasizeSeparators?separatorLevels[emphasizeSeparators].minimum-1:0);
        // The source frame is neutral/cool gray. Scale that ink rather than
        // blending the backdrop toward white, which invents a blue frame.
        const target=Math.min(minimum,contrastRatio(luminance(ink),luminance(base)));
        let low=0,high=1;
        for(let step=0;step<10;step++) {
          const factor=(low+high)/2,candidate=ink.map((v,i)=>i===3?1:Math.round(v*factor));
          if(luminance(candidate)<luminance(base)||contrastRatio(luminance(candidate),luminance(base))<target)low=factor;
          else high=factor;
        }
        return `border-${side.toLowerCase()}-color: ${rgba(ink.map((v,i)=>i===3?1:Math.round(v*high)))} !important;`;
      }
      if(chromiumSrgb(layer.backgroundColor)?.[3]||layer.backgroundImage!=='none')return '';
    }
    return '';
  }

  function listItemFramePaint(element, getBackdrop) {
    if (element.matches(':focus-within')) return [];
    const backdrop = getBackdrop(element);
    if (!backdrop || luminance(backdrop) > .18) return [];
    const paints = [];
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      if (style.content !== '""' || style.backgroundImage !== 'none' || style.transform !== 'none' ||
          style.filter !== 'none' || style.maskImage !== 'none' || !(parseFloat(style.borderTopWidth) > 0)) continue;
      const extent = (dimension, sides) => parseFloat(style[dimension]) + (style.boxSizing === 'border-box' ? 0 :
        sides.reduce((sum, side) => sum + parseFloat(style[`border${side}Width`]) + parseFloat(style[`padding${side}`]), 0));
      if (!element.matches('li,[role="listitem"]') &&
          (style.position !== 'absolute' || Math.abs(parseFloat(style.top)) > 1 || Math.abs(parseFloat(style.left)) > 1 ||
            Math.abs(extent('width', ['Left', 'Right']) - element.clientWidth) > 1 ||
            Math.abs(extent('height', ['Top', 'Bottom']) - element.clientHeight) > 1)) continue;
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

  function readableFieldBorder(element, backdrop) {
    const proxy = selectProxyFrame(element);
    if (!(element.matches(`${textInput},input[type="password"],input[type="email"],input[type="url"],input[type="tel"],input[type="number"]`) || proxy)) return '';
    const style = authoredBackdropStyle(element), fill = chromiumSrgb(style.backgroundColor);
    if (!fill || style.borderImageSource !== 'none') return '';
    // The border is outside the background image. Its opaque solid backing
    // remains measurable even when an inset field glyph cannot be decoded.
    if (!backdrop && fill[3] === 1) backdrop = palettes[preset] ?
      chromiumSrgb(getComputedStyle(element).backgroundColor) : chromiumSurfaceColor(element, style, fill) ?? fill;
    if (!backdrop || backdrop[3] !== 1 || luminance(backdrop) > .18) return '';
    // color-scheme can darken a browser-supplied input fill before our next
    // sample. Measure that existing dark fill, not an earlier white-to-dark
    // projection; otherwise resampling drops the repair or targets stale ink.
    const currentFill = chromiumSrgb(getComputedStyle(element).backgroundColor);
    if (!palettes[preset] && element.getAttribute(sampleMarker) === 'native-control' && luminance(fill) <= .18) {
      // The scheme probe may itself start a UA fill transition. Its cached
      // destination is stable; an intermediate gray would over-brighten the
      // frame and then leave that accidental strength after sampling ends.
      backdrop = fill;
    } else if (!palettes[preset] && currentFill?.[3] === 1 && luminance(currentFill) <= .18) backdrop = currentFill;
    const minimum = preset === 'contrast' ? 3 : 2.5;
    return paintedBorderSides(style).map(side => {
      const ink = chromiumSrgb(style[`border${side}Color`]), width = parseFloat(style[`border${side}Width`]);
      // Native bevel shading can darken an inset/outset side to one third of
      // its computed ink. When that fails on the dark fill, use a flat frame
      // of the same width/radius instead of compensating invisible CSS ink.
      // Pale native frames retain their separate weight policy. A select
      // replacement owns its visible frame rather than the hidden select's.
      // Saturated status inks and transparent reservations stay separate.
      if (!ink || ink[3] !== 1 || (!proxy && luminance(ink) >= .45) || !(width > 0 && width <= 2) ||
          !['solid', 'inset', 'outset'].includes(style[`border${side}Style`]) ||
          Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 64) return '';
      const palette = palettes[preset];
      const applied = palette ? palette.border.slice(1).match(/../g).map(c => parseInt(c, 16)).concat(1) :
        proxy && luminance(ink) >= .45 ? [...ink.slice(0,3),.34] : ink;
      const opaque = compositeColor(applied, backdrop);
      const baseline = readableColor(opaque,backdrop,minimum) ?? opaque;
      const target = emphasizeSeparators ? contrastRatio(luminance(baseline),luminance(backdrop)) + separatorLevels[emphasizeSeparators].minimum - 1 : minimum;
      const repaired = readableColor(opaque, backdrop, target);
      const bevel = ['inset', 'outset'].includes(style[`border${side}Style`]) &&
        contrastRatio(luminance((repaired ?? applied).map((c, i) => i === 3 ? 1 : c / 3)), luminance(backdrop)) < minimum;
      return repaired || bevel || proxy ? `border-${side.toLowerCase()}-color: ${rgba(repaired ?? opaque)} !important;` +
        (bevel ? `border-${side.toLowerCase()}-style: solid !important;` : '') : '';
    }).join('');
  }

  function progressIndicatorPaint(element, style, getBackdrop) {
    const track = element.matches('[role="progressbar"]') ? element : element.parentElement;
    if (!track?.matches('[role="progressbar"]') || track.childElementCount !== 1 ||
        track.closest('[aria-disabled="true"]')) return '';
    const fill = track.firstElementChild;
    if (fill.childElementCount || fill.textContent.trim() || !(fill instanceof HTMLElement)) return '';
    const frame = authoredBackdropStyle(track), paint = authoredBackdropStyle(fill);
    if (frame.transform !== 'none') return '';
    if (paint.transform !== 'none') {
      const transform = new DOMMatrixReadOnly(paint.transform);
      if (!transform.is2D || transform.b !== 0 || transform.c !== 0 || transform.d !== 1 ||
          transform.a < 0 || transform.a > 1 || transform.e > 0 || transform.f !== 0) return '';
    }
    const box = track.getBoundingClientRect(), filled = fill.getBoundingClientRect();
    if (box.height <= 0 || box.height > 24 || box.width < 24 || filled.width <= 0 ||
        filled.width > box.width || filled.height <= 0 || filled.height > box.height ||
        [frame,paint].some(s=>s.backgroundImage !== 'none' || s.filter !== 'none' || s.opacity !== '1' ||
          s.mixBlendMode !== 'normal')) return '';
    const source = chromiumSrgb(paint.backgroundColor), backing = getBackdrop(track);
    if (!source || source[3] !== 1 || !backing || luminance(backing) > .18) return '';
    const applied = palettes[preset] ? chromiumSrgb(getComputedStyle(fill).backgroundColor) :
      chromiumSurfaceColor(fill, paint, source) ?? source;
    if (!applied || contrastRatio(luminance(compositeColor(applied,backing)),luminance(backing)) >= 4.5) return '';
    const ink = contrastingGlyphInk(source,backing,4.5,true) ?? readableColor(applied,backing,4.5);
    if (!ink) return '';
    if (element === fill) return `background-color: ${rgba(ink)} !important;`;
    // A matching authored frame belongs to the same indicator ink. Preserve
    // its width/radius; unrelated track/status borders retain their policy.
    return paintedBorderSides(frame).map(side=>{
      const edge=chromiumSrgb(frame[`border${side}Color`]);
      return edge?.[3] === 1 && edge.slice(0,3).every((c,i)=>Math.abs(c-source[i])<=8) ?
        `border-${side.toLowerCase()}-color: ${rgba(ink)} !important;` : '';
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
    const original = switchingRenderer || stickyTransition || raised || element.getAttribute(sampleMarker) === 'native-control' ?
      originalTransitionColors(element, style) : style;
    const foreground = chromiumSrgb(original.color ?? style.color);
    const background = chromiumSrgb(original.backgroundColor ?? style.backgroundColor);
    const blend = ['multiply', 'darken', 'color-burn'].includes(style.mixBlendMode);
    const preservePhoto = blend && (element.matches('img') ||
      (!element.textContent.trim() && element.querySelector('img')));
    const hasText = Array.prototype.some.call(element.childNodes, textNode) ||
      (element instanceof HTMLInputElement && element.matches(actionButton) && element.value.trim());
    const imageLabel = (hasText && imageLabelPaint(element, style, 4.5)) || flowImageLinkPaint(element, style);
    let color = foreground?.[3] ? chromiumColor(foreground, 'foreground') : null;
    const horizontalSeparator = element.matches('hr,[role="separator"]:not([aria-orientation="vertical"])') &&
      !element.textContent.replace(/&nbsp;/gi, '').trim();
    if (horizontalSeparator) {
      // Generated separator lines can use currentColor even when the element has no visible text.
      color = foreground;
    }
    const changedActionFill = compactTextControl(element) && background?.[3] > 0 && style.backgroundImage === 'none' &&
      Boolean(chromiumSurfaceColor(element,style,background)) && (background[3]>=.75||darkGradientUnderlay(element));
    if (imageLabel || (!changedActionFill && color && hasImageBackdrop(element, style, backdrops.images, backdrops.solid))) {
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
    const gradient = contrastingSvgBackground(glyph, glyphBackdrop, 10,
      glyph?.external || select || Boolean(carousel)) ??
      svgBackground?.image ?? chromiumGradient(style, headingBackground);
    let shadow = chromiumBackdropShadow(original.boxShadow ?? style.boxShadow);
    let surface = blendsBackgroundImage && !gradient ? null : chromiumSurfaceColor(element, style, background);
    const cardPaint = separatedCardPaint(element, style, background, surface);
    if (cardPaint) { surface = cardPaint.surface; shadow = cardPaint.shadow ?? shadow; }
    const backdropFor = node => chromiumTextBackdrop(node, backdrops.solid);
    const authoredBacking = foreground?.[3] && !element.matches('input,select,textarea') &&
      Math.max(...foreground.slice(0,3))-Math.min(...foreground.slice(0,3)) > 24 && authoredSolidBackdrop(element);
    if (authoredBacking && luminance(authoredBacking) < .18 && foreground &&
        contrastRatio(luminance(foreground), luminance(authoredBacking)) >= 4.5 &&
        backdropFor(element) && contrastRatio(luminance(foreground), luminance(backdropFor(element))) >= 4.5)
      color = foreground;
    const artwork = artworkRepair(element, style, background, surface);
    surface = artwork.backing ?? surface;
    const artworkFilter = cardPaint?.filter ?? artwork.filter ??
      (element instanceof HTMLImageElement ? linkedGlyphFilter(element, style, backdropFor) :
        contentSpriteFilter(element,style,backdropFor) || compactBackgroundFilter(element, style, backdropFor(element.parentElement ?? element.getRootNode().host)));
    const artworkContent = artworkContrast.get(element)?.svgPaint ?? smallLabeledSvgPaint(element, style, backdropFor);
    if (element === document.documentElement && window === window.top && background?.[3] === 0 && style.backgroundImage === 'none') {
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
    const panelEdge = formPanelEdge(element, backdropFor(element));
    if (panelEdge) pseudoStyles.push([':not(:focus-visible)', panelEdge]);
    const semanticEdge=semanticSurfaceEdge(element,backdropFor(element));
    if(semanticEdge)pseudoStyles.push([':not(:focus-visible)',semanticEdge]);
    const clippedEdge = clippedPanelEdge(element, backdropFor(element));
    if (clippedEdge) pseudoStyles.push([':not(:focus-visible)', clippedEdge]);
    const embeddedWordmark=embeddedControlWordmarkPaint(element,backdropFor);
    if(embeddedWordmark)pseudoStyles.push(['',embeddedWordmark]);else pseudoStyles.push(...backgroundArtworkPaint(element, style, backdropFor));
    const maskedInk=clippedMaskInk(element,backdropFor);if(maskedInk)pseudoStyles.push(['',maskedInk]);
    const toolbarText=toolbarControlText(element,backdropFor);if(toolbarText)pseudoStyles.push(['',toolbarText]);
    const compactLabel=compactControlLabel(element,backdropFor);if(compactLabel)pseudoStyles.push(['',compactLabel]);
    const embeddedCanvas=embeddedCanvasPaint(element);if(embeddedCanvas)pseudoStyles.push(['',embeddedCanvas]);
    if(embeddedCanvas&&element===document.documentElement)pseudoStyles.push([' > body',embeddedCanvas]);
    const glassFrame=translucentActionFrame(element,style);if(glassFrame)pseudoStyles.push([':not(:focus-visible)',glassFrame]);
    const fieldGlyphPaint=fieldBackgroundPaint(element,style,backdropFor);
    if(fieldGlyphPaint)pseudoStyles.push(['',fieldGlyphPaint]);
    const proxyLabel = proxyLabelPaint(element,style,backdropFor);
    if (proxyLabel) pseudoStyles.push(['',proxyLabel]);
    pseudoStyles.push(...semanticSelectArrow(element,backdropFor));
    const camouflaged = camouflagedInputPaint(element,style);
    if (camouflaged) pseudoStyles.push([':not(:focus)',camouflaged]);
    const glyphText = glyphLabelTextPaint(element,style,backdropFor(element),color ?? foreground);
    if(glyphText)pseudoStyles.push(['',glyphText]);
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
    const labelFrame = smallLabelFramePaint(element,backdropFor(element));
    if (labelFrame) pseudoStyles.push([':not(:focus-visible)',labelFrame]);
    const compositeFrame = compositeFieldFrame(element,style,boxBorder);
    if (compositeFrame) pseudoStyles.push([':not(:focus-within)::after',compositeFrame]);
    const fieldBorder = subduedFieldBorder(element, style, background, surface);
    if (fieldBorder) pseudoStyles.push([':not(:focus,:user-invalid,:disabled,[aria-invalid="true"])', fieldBorder]);
    const fieldContrast = readableFieldBorder(element, backdropFor(element));
    if (fieldContrast) pseudoStyles.push([':not(:focus,:user-invalid,:disabled,[aria-invalid="true"])', fieldContrast]);
    const progress = progressIndicatorPaint(element,style,backdropFor);
    if (progress) pseudoStyles.push(['',progress]);
    const subtleEdge = subtleBoundaryPaint(element, backdropFor(element));
    if (subtleEdge) pseudoStyles.push(['', subtleEdge]);
    const gradientEdge = gradientSectionBoundary(element);
    if (gradientEdge) pseudoStyles.push(['', gradientEdge]);
    const coloredEdge = coloredControlBorder(element, style, backdropFor);
    if (coloredEdge) pseudoStyles.push([':not(:focus-visible)', coloredEdge]);
      const colorIndicator=toolbarColorIndicator(element);if(colorIndicator)pseudoStyles.push(['',colorIndicator]);
    const navigationEdge = navigationIndicatorPaint(element,style,backdropFor);
    if (navigationEdge) pseudoStyles.push([':not(:focus-within)',navigationEdge]);
    for (const pseudo of decorativePseudos(element, style)) {
      if (!pseudoStyles.some(([selector]) => selector === pseudo)) {
        pseudoStyles.push([pseudo, 'filter: brightness(.18) !important;']);
      }
    }
    pseudoStyles.push(...placeholderPaint(element, backdropFor));
    pseudoStyles.push(...fontGlyphPaint(element, backdropFor));
    const actionInk = solidActionInk(element, style, surface ?? background);
    if (actionInk) pseudoStyles.push(['', actionInk]);
    pseudoStyles.push(...selectPopupPaint(element, style, backdropFor));
    const fallbackControlIcon = pseudoStyles.some(([, declarations]) => declarations.includes('translate(-50%'));
    if (!color && !surface && !artworkFilter && !artworkContent && !preservePhoto && !gradient && !shadow && !textFill && !isolateLabel &&
        !undimLabel && !lightIcon && !expander && !separators.length && !pseudoStyles.length &&
        !stickyTransition && !imageLabel) return null;
    const declarations = [
      color ? `color: ${rgba(color)} !important;` : '',
      textFill ? `-webkit-text-fill-color: ${rgba(textFill)} !important;` : '',
      surface ? `background-color: ${rgba(surface)} !important;` : '',
      artworkFilter ? `filter: ${artworkFilter} !important;` : '',
      artworkContent,
      gradient ? `background-image: ${gradient} !important;` : '',
      shadow ? `box-shadow: ${shadow} !important;` : '',
      preservePhoto || isolateLabel ? 'mix-blend-mode: normal !important;' : '',
      undimLabel ? 'filter: none !important;' : '',
      expander || '',
      lightIcon === 'mask' ? 'background-color: white !important;' : '',
      fallbackControlIcon && style.position === 'static' ? 'position: relative !important;' : '',
      fallbackControlIcon && /^(?:url|image-set)\(/.test(style.backgroundImage) ? 'background-image: none !important;' : '',
      ...separators,
      imageLabel
    ].filter(Boolean);
    const properties = new Set(['color', ...declarations.map(value => value.split(':', 1)[0])]);
    if (fieldGlyphPaint) properties.add('background-image');
    if (progress) properties.add('background-color');
    if (navigationEdge) properties.add('box-shadow');
    if (panelEdge || semanticEdge) properties.add('box-shadow');
    if (clippedEdge) properties.add('outline-color');
    if (stickyTransition || raised) properties.add('background-color');
    if (chipBorder || fieldBorder || fieldContrast || boxBorder || labelFrame || subtleEdge || gradientEdge || coloredEdge || navigationEdge || progress) {
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
        // ViewBox units describe drawing coordinates, not displayed size.
        // Common compact metadata glyphs use 512/576-unit viewports.
        view.width > 0 && view.height > 0 && Math.max(view.width, view.height) <= 4096;
      if (compact) {
        for (let node = parent, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
          const style = getComputedStyle(node);
          if (style.cursor === 'pointer' && node.clientWidth <= 80 && node.clientHeight <= 80) {
            control = node;
            break;
          }
          const pairedLabel = node === parent && node.matches('div,span') && node.childElementCount <= 3 &&
            node.querySelectorAll('svg').length === 1 && !node.querySelector('img,video,canvas') &&
            node.clientWidth <= 360 && node.clientHeight <= 80 && Array.prototype.some.call(node.children, child =>
              child.matches('span,a[href]') && Array.prototype.some.call(child.childNodes, textNode));
          if ((node.matches(`${heading},dt,label,span,p`) && Array.prototype.some.call(node.childNodes, textNode) || pairedLabel) &&
              node.textContent.trim().length <= 160) {
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
    if (!(control || labeledIcon || hiddenIcon || wideStaticMark(element) || host?.closest(interactive) || labeledHost) ||
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
      const labelBackdrop = backdrop ?? getBackdrop(parent ?? host);
      const palette = labelBackdrop && svgPaletteGlyphPaint(element, labelBackdrop);
      if (palette) return palette;
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
      const transformed = (simulated || wideLinkedMark(element)) && luminance(backdrop) < .18 && chromiumColor(ink, 'foreground');
      const color = readableColor(transformed || ink, backdrop, minimum) ?? transformed;
      if (!color || color.every((channel, index) => channel === ink[index])) return null;
      paint = rgba(color);
    }
    const pseudoStyles = svgPaintRules(element, paints, () => paint);
    return { declarations: matchesLabel ? 'color: inherit !important;' : '', transition: null, pseudoStyles };
  }

  function svgPaintRules(element, paints, resolve) {
    return paints.map(([shape, properties]) => {
      const path = [];
      for (let node = shape; node !== element; node = node.parentElement) {
        const index = Array.prototype.indexOf.call(node.parentElement.children, node) + 1;
        path.unshift(` > :nth-child(${index})`);
      }
      return [path.join(''), properties.map(property => `${property}: ${resolve(shape, property)} !important;`).join('')];
    });
  }

  function svgPaletteGlyphPaint(element, backdrop) {
    const box = element.getBoundingClientRect();
    if (box.width > 48 || box.height > 48 || luminance(backdrop) >= .18 ||
        element.querySelector('image,use,foreignObject,text,animate,animateTransform,set') ||
        getComputedStyle(element).filter !== 'none') return null;
    const paints = [], colors = new Set();
    for (const shape of element.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect')) {
      if (shape.closest('defs,clipPath,mask')) continue;
      const style = getComputedStyle(shape), properties = [];
      if (style.opacity !== '1' || style.fillOpacity !== '1' || style.strokeOpacity !== '1') return null;
      for (const property of ['fill', 'stroke']) {
        if (style[property] === 'none') continue;
        const ink = chromiumSrgb(style[property]);
        if (ink?.[3] !== 1) return null;
        colors.add(ink.join(',')); properties.push(property);
      }
      if (properties.length) paints.push([shape, properties]);
      if (colors.size > 2 || paints.length > 32) return null;
    }
    if (colors.size !== 2) return null;
    let changed = false;
    const pseudoStyles = svgPaintRules(element, paints, (shape, property) => {
      const source = getComputedStyle(shape)[property], ink = paletteGlyphInk(chromiumSrgb(source), backdrop);
      if (ink) changed = true;
      return ink ? rgba(ink) : source;
    });
    return changed ? { declarations: '', transition: null, pseudoStyles } : null;
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
        const glyph = backgroundSvgGlyph(style, true);
        const image = contrastingSvgBackground(glyph, backdrop, 10);
        const filter = !glyph && compactBackgroundFilter(element, style, backdrop, pseudo);
        if (image) declarations.push(`background-image: ${image} !important;`);
        else if (filter) declarations.push(`filter: ${filter} !important;`);
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
    if (!element.matches('input[placeholder],textarea[placeholder]')) return [];
    const selector = ':is(input,textarea):not(:disabled)::placeholder';
    if (Number(placeholderSources.get(element)?.opacity) === 0) return [[selector,'opacity: 0 !important;']];
    if (element.matches(':disabled,[aria-disabled="true"]')) return [];
    const backdrop = getBackdrop(element);
    const placeholder = getComputedStyle(element, '::placeholder');
    const ink = chromiumSrgb(placeholder.webkitTextFillColor);
    if (!backdrop || !ink?.[3]) return [];
    const opacity = Number(placeholder.opacity);
    if (!(opacity > 0)) return [];
    const search = element.matches('input[type="search"]') || element.closest('[role="search"],search');
    const visible = compositeColor([...ink.slice(0, 3), ink[3] * opacity], backdrop);
    const autocomplete = element.matches('input[role="combobox"][aria-autocomplete="list"],input[role="combobox"][aria-autocomplete="both"]');
    const readable = readableColor(visible, backdrop, search ? 10 : Math.max(autocomplete ? 8.5 : 6,minimum));
    return readable ? [[selector,
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
      const image = contrastingSvgBackground(glyph, backdrop, 10);
      if (image) paint.push([pseudo, `background-image: ${image} !important;`]);
      else {
        const filter = compactBackgroundFilter(element, style, getBackdrop(element), pseudo);
        if (filter) paint.push([pseudo, `filter: ${filter} !important;`]);
      }
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

  function fontGlyphPaint(element, getBackdrop) {
    if (!element.matches('i,span') || element.childElementCount || element.textContent.trim() ||
        element.closest(':disabled,[aria-disabled="true"]')) return [];
    const source = authoredBackdropStyle(element), box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0 && Math.max(box.width, box.height) <= 48)) return [];
    if (!(element.closest(interactive) || element.hasAttribute('title'))) {
      const ink=chromiumSrgb(source.color);
      if (!ink || ink[3]!==1 || Math.max(...ink.slice(0,3))-Math.min(...ink.slice(0,3))>24 ||
          source.opacity!=='1' || source.filter!=='none' || element.getAnimations().length) return [];
    }
    const backdrop = getBackdrop(element);
    const paints = [];
    for (const pseudo of ['::before','::after']) {
      const layer = getComputedStyle(element, pseudo);
      if (!/^"[\uE000-\uF8FF]"$/.test(layer.content) || layer.backgroundImage !== 'none') continue;
      const original = chromiumSrgb(source.color);
      if (!original?.[3]) continue;
      const control = element.closest(interactive);
      if (control === element.parentElement && control.matches(actionButton) &&
          authoredBackdropStyle(control).color === source.color) {
        // Keep an originally inherited action glyph attached to its label's
        // live hover/focus ink, rather than freezing an independently sampled
        // color from the previous backing.
        paints.push(['', 'color: inherit !important; -webkit-text-fill-color: inherit !important;']);
        paints.push([pseudo, 'color: inherit !important; -webkit-text-fill-color: inherit !important;']);
        continue;
      }
      if (!backdrop) continue;
      const labelInk = control && chromiumSrgb(getComputedStyle(control).color);
      const ink = labelInk && contrastRatio(luminance(labelInk), luminance(backdrop)) >= 7 ? labelInk :
        contrastingGlyphInk(original, backdrop, 7, true) ?? original;
      let opacity = Number(source.opacity ?? getComputedStyle(element).opacity);
      // A titled status glyph is information, even when the site dims it.
      // Explicit disabled semantics above retain the site's disabled paint.
      if (opacity > 0 && opacity < 1 && element.hasAttribute('title')) {
        while (opacity < 1 && contrastRatio(luminance(compositeColor([...ink.slice(0,3),opacity], backdrop)), luminance(backdrop)) < 3)
          opacity = Math.min(1, opacity + .05);
        paints.push(['', `opacity: ${opacity} !important;`]);
      }
      paints.push([pseudo, `color: ${rgba(ink)} !important; -webkit-text-fill-color: ${rgba(ink)} !important;`]);
    }
    return paints;
  }

  function solidActionInk(element, style, backing) {
    if (!element.matches(actionButton) || element.matches(':disabled,[aria-disabled="true"]') ||
        !element.textContent.trim() || style.backgroundImage !== 'none' || backing?.[3] !== 1 ||
        Math.max(...backing.slice(0,3))-Math.min(...backing.slice(0,3)) < 45) return '';
    const minimum = parseFloat(style.fontSize) < 18 ? 7 : 4.5;
    const ink = chromiumSrgb(style.color), repair = ink && readableColor(ink, backing, minimum);
    return repair ? `color: ${rgba(repair)} !important; -webkit-text-fill-color: ${rgba(repair)} !important;` : '';
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
        // Several independent repairs can target the same layer (for example
        // a background glyph and its boundary). Keep their declarations in
        // order rather than overwriting the previous repair's whole rule.
        const layers = new Map();
        for (const [pseudo, declarations] of paint.pseudoStyles) {
          layers.set(pseudo,(layers.get(pseudo) ?? '') + ';' + declarations);
        }
        for (const [pseudo, declarations] of layers) {
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
    // User-agent colors (for example -webkit-link) depend on color-scheme.
    // Full sampling disables the paint sheet, including its root dark scheme.
    // Local sampling must expose the same authored scheme without clearing the
    // ancestors' repaired paint. Restore synchronously before browser paint.
    const rootPaint = preset === 'chromium' && sheet.cssRules[0]?.style;
    const scheme = rootPaint && rootPaint.getPropertyValue('color-scheme');
    const schemePriority = scheme && rootPaint.getPropertyPriority('color-scheme');
    if (scheme) rootPaint.removeProperty('color-scheme');
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
      if (scheme) rootPaint.setProperty('color-scheme', scheme, schemePriority);
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
      if(target!==document.documentElement&&target!==document.body&&target.scrollHeight>target.clientHeight){
        // Independent vertical panes do not move the rest of the document.
        // Inspect only newly exposed descendants, retaining the full viewport
        // path for window scrolling and separate mutation/state resampling.
        scrollingSurfaces.add(target);requestViewportFrame();return;
      }
    }
    scheduleViewport(true);
  }

  function refreshHoverPaint(event) {
    const editRoot = camouflagedInputs.get(event.target);
    if (editRoot && ['focusin','focusout'].includes(event.type)) {
      for (const node of [editRoot,...editRoot.querySelectorAll('*')]) hoverTargets.add(node);
    }
    const path = event.composedPath();
    const crossed = element => !(event.relatedTarget instanceof Node && element.contains(event.relatedTarget));
    const control = path.find(node => node instanceof HTMLElement && node.matches(interactive));
    if (control && crossed(control) && (raisedLinks.has(control) || control.closest('nav,[role="navigation"]') ||
        control.querySelector('svg') || compactTextControl(control) || flowImageLinkLabels(control))) {
      hoverTargets.add(control);
      const parent = control.parentElement;
      if (parent?.closest('nav,[role="navigation"]') && parent.childElementCount === 1 &&
          parseFloat(getComputedStyle(parent).borderBottomWidth) > 0) hoverTargets.add(parent);
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
        if (!control.matches(interactive) || !(control.querySelector('svg,i,span') || flowImageLinkLabels(control))) continue;
        const descendants = control.querySelectorAll('*');
        if (descendants.length <= 64) targets.push(...descendants);
      }
      for(const target of targets)forgetOverlayInk(target);
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
    // Background sprites need evidence from the displayed crop; a stylesheet or
    // position alone cannot distinguish a glyph from a multicolor flag.
    return masked ? 'mask' : 'background';
  }

  function wideLinkedMark(element) {
    const link = element.closest('a[href]');
    if (!link || link.textContent.trim() || !(link.hasAttribute('aria-label') || link.relList.contains('home')) ||
        element.querySelector('text,animate,animateTransform,animateMotion,set,script')) return false;
    const { width, height } = element.getBoundingClientRect();
    return width > 48 && width <= 240 && height > 0 && height <= 64 && width >= height * 2 &&
      element.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect').length <= 64;
  }

  function wideStaticMark(element) {
    if (!(element instanceof SVGSVGElement)) return false;
    const {width,height}=element.getBoundingClientRect(),style=getComputedStyle(element);
    return width>48&&width<=240&&height>=8&&height<=64&&width>=height*2&&
      style.opacity==='1'&&style.filter==='none'&&style.mixBlendMode==='normal'&&
      !element.querySelector('svg,text,image,use,foreignObject,animate,animateTransform,animateMotion,set,script')&&
      element.querySelectorAll('path,circle,ellipse,line,polygon,polyline,rect').length<=64&&
      !element.getAnimations({subtree:true}).length;
  }

  function monochromeIconColor(element, paints) {
    if (getComputedStyle(element).filter !== 'none' || element.querySelector('use,foreignObject')) return null;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height || ((width > 48 || height > 48) && !(wideLinkedMark(element)||wideStaticMark(element)))) return null;
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
      if (roles && element.matches('a[href],button')) {
        const source = authoredBackdropStyle(element), style = getComputedStyle(element);
        const surface = separatedControlSurface(element, source, chromiumSrgb(source.backgroundColor),
          chromiumSrgb(style.backgroundColor), backdrop);
        if (surface) {
          update[1] += ` ${palettePaintRole(`background-color: ${rgba(surface)} !important;`, [], rules)}`;
          fixes.push([element, update[1]]);
        }
      }
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
        if (background && luminance(background) < .18 && icon === 'mask') {
          repaired += ' icon-mask-light';
        }
      }
      const glyph = ((direction || select || hasText || wrappedBackgroundGlyphLabel(element, style)) &&
        elementBackgroundGlyph(element, style)) || externalSvgGlyph(element, style);
      if (glyph) {
        const image = contrastingSvgBackground(glyph, backdrop(glyph.external ? element.parentElement : element),
          10, Boolean(glyph.external || direction || select));
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
      const embeddedWordmark=embeddedControlWordmarkPaint(element,backdrop);
      if(embeddedWordmark)pseudoStyles.push(['',embeddedWordmark]);else pseudoStyles.push(...backgroundArtworkPaint(element, style, backdrop));
      const maskedInk=clippedMaskInk(element,backdrop);if(maskedInk)pseudoStyles.push(['',maskedInk]);
      const toolbarText=toolbarControlText(element,backdrop);if(toolbarText)pseudoStyles.push(['',toolbarText]);
      const compactLabel=compactControlLabel(element,backdrop);if(compactLabel)pseudoStyles.push(['',compactLabel]);
      const embeddedCanvas=embeddedCanvasPaint(element);if(embeddedCanvas)pseudoStyles.push(['',embeddedCanvas]);
      if(embeddedCanvas&&element===document.documentElement)pseudoStyles.push([' > body',embeddedCanvas]);
      const glassFrame=translucentActionFrame(element,authoredBackdropStyle(element));if(glassFrame)pseudoStyles.push([':not(:focus-visible)',glassFrame]);
      const fieldGlyphPaint=fieldBackgroundPaint(element,style,backdrop);
      if(fieldGlyphPaint)pseudoStyles.push(['',fieldGlyphPaint]);
      const proxyLabel = proxyLabelPaint(element,style,backdrop);
      if (proxyLabel) pseudoStyles.push(['',proxyLabel]);
      pseudoStyles.push(...semanticSelectArrow(element,backdrop));
        const camouflaged = camouflagedInputPaint(element,style);
      if (camouflaged) pseudoStyles.push([':not(:focus)',camouflaged]);
      const glyphText = glyphLabelTextPaint(element,style,backdrop(element),chromiumSrgb(style.color));
      if(glyphText)pseudoStyles.push(['',glyphText]);
      pseudoStyles.push(...placeholderPaint(element, backdrop, minimum));
      pseudoStyles.push(...fontGlyphPaint(element, backdrop));
      const actionInk = solidActionInk(element, style, backdrop(element));
      if (actionInk) pseudoStyles.push(['', actionInk]);
      const fieldContrast = readableFieldBorder(element, backdrop(element));
      if (fieldContrast) pseudoStyles.push([':not(:focus,:user-invalid,:disabled,[aria-invalid="true"])', fieldContrast]);
      const progress = progressIndicatorPaint(element,style,backdrop);
      if (progress) pseudoStyles.push(['',progress]);
      pseudoStyles.push(...selectPopupPaint(element, style, backdrop));
      pseudoStyles.push(...iconControlEdges(element, style, backdrop(element)));
      pseudoStyles.push(...listItemFramePaint(element, backdrop));
      const panelEdge = formPanelEdge(element, backdrop(element));
      if (panelEdge) pseudoStyles.push([':not(:focus-visible)', panelEdge]);
      const semanticEdge=semanticSurfaceEdge(element,backdrop(element));
      if(semanticEdge)pseudoStyles.push([':not(:focus-visible)',semanticEdge]);
      const clippedEdge = clippedPanelEdge(element, backdrop(element));
      if (clippedEdge) pseudoStyles.push([':not(:focus-visible)', clippedEdge]);
      const subtleEdge = subtleBoundaryPaint(element, backdrop(element));
      if (subtleEdge) pseudoStyles.push(['', subtleEdge]);
      const labelFrame = smallLabelFramePaint(element,backdrop(element));
      if (labelFrame) pseudoStyles.push([':not(:focus-visible)',labelFrame]);
      const gradientEdge = gradientSectionBoundary(element);
      if (gradientEdge) pseudoStyles.push(['', gradientEdge]);
      const coloredEdge = coloredControlBorder(element, style, backdrop);
      if (coloredEdge) pseudoStyles.push([':not(:focus-visible)', coloredEdge]);
      const colorIndicator=toolbarColorIndicator(element);if(colorIndicator)pseudoStyles.push(['',colorIndicator]);
      const navigationEdge = navigationIndicatorPaint(element,style,backdrop);
      if (navigationEdge) pseudoStyles.push([':not(:focus-within)',navigationEdge]);
      if (roles.includes(' raised-link')) {
        const parent = element.parentElement ?? element.getRootNode().host;
        const edge = raisedSurfaceEdge(style, backdrop(element), backdrop(parent), style.boxShadow);
        if (edge) pseudoStyles.push([':not(:focus-visible)', edge]);
      }
      const filter = element instanceof HTMLImageElement ? linkedGlyphFilter(element, style, backdrop) :
        contentSpriteFilter(element,style,backdrop) || compactBackgroundFilter(element, style, backdrop(element.parentElement ?? element.getRootNode().host));
      const artworkContent = artworkContrast.get(element)?.svgPaint ?? smallLabeledSvgPaint(element, style, backdrop);
      const expander = !icon && expanderPaint(element, style, backdrop);
      if (filter || artworkContent || expander || pseudoStyles.length) {
        repaired += ` ${palettePaintRole((filter ? `filter: ${filter} !important;` : '') + artworkContent + (expander || ''), pseudoStyles, rules)}`;
      }
      if (roles.includes(' breadcrumb') && !backdrop(element)) {
        repaired += ' breadcrumb-backdrop';
      }
      if (roles.includes(' card')) {
        const color = backdrop(element);
        const parent = backdrop(element.assignedSlot ?? element.parentElement ?? element.getRootNode().host);
        if (color && parent) {
          if (contrastRatio(luminance(color), luminance(parent)) < 1.5) {
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
        // Unknown image paint is not evidence that a transparent heading needs
        // a full-width solid strip. Measured image-text repair is separate;
        // without samples, retain the heading's authored background geometry.
        continue;
      }
      const originalInk = chromiumSrgb(authoredBackdropStyle(element).color);
      const originalBacking = authoredSolidBackdrop(element);
      if (originalInk && originalBacking && luminance(originalBacking) < .18 && luminance(background) < .18 &&
          Math.max(...originalInk.slice(0,3))-Math.min(...originalInk.slice(0,3)) > 24 &&
          contrastRatio(luminance(originalInk), luminance(originalBacking)) >= minimum &&
          contrastRatio(luminance(originalInk), luminance(background)) >= minimum) {
        fixes.push([element, `${repaired} ${palettePaintRole(`color: ${rgba(originalInk)} !important; -webkit-text-fill-color: ${rgba(originalInk)} !important;`, [], rules)}`]);
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
      neutralImageProbes.delete(event.target);
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
    // Mutation batches often contain both a popup/card and several descendants.
    // Keep one enclosing root rather than inspecting overlapping subtrees again.
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      if (dirtySurfaces.has(parent)) return;
    }
    for (const queued of dirtySurfaces) if (root.contains(queued)) dirtySurfaces.delete(queued);
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
    viewportFrame = requestAnimationFrame(flushViewport);
  }

  function flushViewport() {
      viewportFrame = undefined;
      if (!preset) return;
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
      if(scrollingSurfaces.size){
        const roots=new Set([...scrollingSurfaces].filter(root=>root.isConnected));scrollingSurfaces.clear();
        if(!repaintViewport)paintVisibleSurfaces(true,true,false,roots);
      }
      if (repaintViewport) paintVisibleSurfaces(onlyUnpainted, includeLookahead);
      if (preload) scheduleViewport(true);
  }

  function paintStateBeforeFrame() {
    if (statePaintQueued) return;
    statePaintQueued = true;
    queueMicrotask(() => {
      statePaintQueued = false;
      if (!preset) return;
      // A page can reveal a menu/fixed panel inside its own animation-frame
      // callback. Waiting for our next rAF exposes the authored light paint
      // for one frame. Coalesce the state batch in this pre-paint microtask;
      // keep ordinary mutations, scrolling and offscreen work on their queues.
      cancelAnimationFrame(viewportFrame);
      flushViewport();
    });
  }

  function refreshChromium() {
    // Root state classes can expose a new fixed surface in this frame. Only
    // the offscreen scan may wait for the document-wide debounce.
    scheduleViewport();
    if (chromiumRefreshTimer === undefined) {
      chromiumRefreshTimer = setTimeout(() => {
        chromiumRefreshTimer = undefined;
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
    paintVisibleSurfaces();
    scheduleDocument();
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
      document.removeEventListener('focusin', refreshHoverPaint, true);
      document.removeEventListener('focusout', refreshHoverPaint, true);
      window.removeEventListener('resize', refreshChromium);
      cancelIdleCallback(idleBatch);
      clearTimeout(chromiumRefreshTimer);
      clearTimeout(horizontalScrollTimer);
      cancelAnimationFrame(viewportFrame);
      cancelAnimationFrame(hoverFrame);
      hoverFrame = undefined;
      hoverTargets.clear();
      dirtySurfaces.clear();
      compactBackgroundWaiters.clear();
      scrollingSurfaces.clear();
      overlayInkLabels.clear();overlayAuthoredInk=new WeakMap();
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
    transitionSheet.replaceSync(`:root { ${transitionProbe}: yes; }
      :is(input,select,textarea)[${sampleMarker}="native-control"] { color-scheme: dark !important; }`);
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
            forgetOverlayInk(target);
            if (target === document.documentElement || target === document.body || target.matches('style,link[rel~="stylesheet"]')) {
              refreshChromium();
              paintStateBeforeFrame();
              continue;
            }
            if (['class', 'style', 'hidden', 'data-theme', 'open', 'aria-hidden', 'aria-expanded'].includes(attribute)) {
              const sampled = sampledElements.delete(target);
              // Hidden menus can be opened before the idle scan ever visited
              // them. Paint the newly visible popup together, not on hover of
              // each item. Ordinary unsampled class changes stay time-sliced.
              const popup = target.closest('[role="menu"],[role="listbox"],[role="dialog"],[popover]');
              if (sampled || popup) scheduleDirtySurface(target);
              if (popup) paintStateBeforeFrame();
            }
            schedule(target);
            continue;
          }
          forgetOverlayInk(target);
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
        forgetOverlayInk(target);
        if (target?.closest('style')) {
          const root = target.getRootNode();
          schedule(root === document ? document.documentElement : root);
        }
        else if (record.type === 'attributes') {
          const value = target.getAttribute(record.attributeName);
          if (record.oldValue !== value &&
              !(record.attributeName === 'style' && movementStyle(record.oldValue) === movementStyle(value))) {
            schedule(target);
            const popup=target.closest('[role="menu"],[role="listbox"],[role="dialog"],[popover]');
            if (sampledElements.has(target) || popup) scheduleDirtySurface(target);
            if (target===document.documentElement || target===document.body) scheduleViewport();
            if (popup || target===document.documentElement || target===document.body) paintStateBeforeFrame();
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
    document.addEventListener('focusin', refreshHoverPaint, { capture: true, passive: true });
    document.addEventListener('focusout', refreshHoverPaint, { capture: true, passive: true });
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
      : style.getPropertyValue(paletteProbe).trim() === palettes[preset]?.base));
    if (!applied) setPreset(previous, false, previousSeparators);
    reply(applied);
  };
  chrome.runtime.onMessage.addListener(globalThis.nativeDarkModeWebsiteThemeListenerV4);
  window.addEventListener('pageshow', event => { if (event.persisted) requestPreset(); });
  requestPreset();
})();
