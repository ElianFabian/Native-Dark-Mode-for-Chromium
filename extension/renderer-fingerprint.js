// Only extension-owned initializer source is accepted. No page facts or resources are read.
export async function fingerprintRendererSource(source) {
  if (typeof source !== 'string' || source.length > 2097152 ||
      !/^function nativeDarkMode(?:WebsiteTheme|ChromiumColors|ImageContrast)\(\) \{/.test(source) || !source.endsWith('}')) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.replace(/\r\n?/g, '\n')));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
