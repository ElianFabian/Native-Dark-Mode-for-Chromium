// Copyright 2019, 2026 The Chromium Authors
// Adapted from Blink's dark_mode_color_filter.cc, dark_mode_color_classifier.cc,
// and dark_mode_lab_color_space.h at 39567dda62f317e0d95c05c608e68ff81f7d9e42.
// Distributed under the BSD-style license in LICENSE.chromium.
(() => {
  const white = [0.964212, 1, 0.825188];
  // Blink's sRGB matrix after Bradford adaptation from D65 to D50, and its inverse.
  const rgbToXyz = [
    [0.4348794143, 0.3820188842, 0.1473136160],
    [0.2221231146, 0.7159544776, 0.0619223917],
    [0.0070117025, 0.0783932823, 0.7397832234]
  ];
  const xyzToRgb = [
    [3.1342311342, -1.6188614989, -0.4886176579],
    [-0.9787888977, 1.9152106580, 0.0345973069],
    [0.0740138144, -0.1876072210, 1.3527122725]
  ];
  const sigma = 6 / 29;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const multiply = (matrix, vector) => matrix.map(([a, b, c]) =>
    a * vector[0] + b * vector[1] + c * vector[2]);

  function toLinear(channel) {
    const value = channel / 255;
    return clamp(value < 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4, 0, 1);
  }

  function toSrgb(value) {
    return clamp(value < 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055, 0, 1);
  }

  function labComponent(value) {
    return value > sigma ** 3 ? Math.cbrt(value) : value / (3 * sigma ** 2) + 4 / 29;
  }

  function xyzComponent(value) {
    return value > sigma ? value ** 3 : 3 * sigma ** 2 * (value - 4 / 29);
  }

  // Returns null for a color the classifier leaves alone.
  globalThis.nativeDarkModeChromiumColor = ([red, green, blue, alpha], role) => {
    const brightness = Math.floor((299 * Math.round(red) + 587 * Math.round(green) + 114 * Math.round(blue)) / 1000);
    if (role === 'background' ? brightness <= 205 : brightness >= 150) return null;

    const xyz = multiply(rgbToXyz, [red, green, blue].map(toLinear));
    const [x, y, z] = xyz.map((value, index) => labComponent(value / white[index]));
    const lightness = Math.min(110 - clamp(116 * y - 16, 0, 100), 100);
    const a = clamp(500 * (x - y), -128, 128);
    const b = clamp(200 * (y - z), -128, 128);
    const fy = (lightness + 16) / 116;
    const invertedXyz = [fy + a / 500, fy, fy - b / 200]
      .map((value, index) => xyzComponent(value) * white[index]);
    const rgb = multiply(xyzToRgb, invertedXyz).map(toSrgb);
    const [r, g, blueChannel] = rgb;
    const floatEpsilon = 2 ** -23;
    // The adapted matrix can introduce tiny channel differences for neutral inputs.
    const gray = (red === green && red === blue) ||
      (Math.abs(r - g) < floatEpsilon && Math.abs(r - blueChannel) < floatEpsilon);
    if (gray && r > 18 / 255 && r < 32 / 255) return [18, 18, 18, alpha];
    return [...rgb.map(channel => Math.round(channel * 255)), alpha];
  };

  // Signed sRGB perceptual contrast, based on the published 0.0.98G-4g equations.
  // https://github.com/Myndex/apca-w3#current-apca-constants
  function perceptualLuminance([red, green, blue]) {
    const light = .2126729 * (red / 255) ** 2.4 +
      .7151522 * (green / 255) ** 2.4 + .072175 * (blue / 255) ** 2.4;
    return light >= .022 ? light : light + (.022 - light) ** 1.414;
  }

  function perceptualScore(ink, backdrop, inkDark, inkLight, backdropDark, backdropLight) {
    if (Math.abs(backdrop - ink) < .0005) return 0;
    const darkInk = backdrop > ink;
    const score = darkInk ? 1.14 * ((backdropDark ?? backdrop ** .56) - (inkDark ?? ink ** .57)) :
      1.14 * ((backdropLight ?? backdrop ** .65) - (inkLight ?? ink ** .62));
    if (Math.abs(score) < .1) return 0;
    return 100 * (score + (darkInk ? -.027 : .027));
  }

  globalThis.nativeDarkModePerceptualContrast = (text, background) =>
    perceptualScore(perceptualLuminance(text), perceptualLuminance(background));

  // Prepare immutable opaque background samples once when comparing several
  // foregrounds. This uses the same equations, not a quantized approximation.
  globalThis.nativeDarkModePerceptualContrast.prepare = backgrounds => {
    const prepared = backgrounds.map(background => {
      const value = perceptualLuminance(background);
      return [value, value ** .56, value ** .65];
    });
    return ink => {
      const alpha = ink[3] ?? 1;
      if (alpha !== 1) return backgrounds.map((background, i) => {
        const text = ink.slice(0, 3).map((v, channel) => v * alpha + background[channel] * (1 - alpha));
        const [value, dark, light] = prepared[i];
        return perceptualScore(perceptualLuminance(text), value, undefined, undefined, dark, light);
      });
      const value = perceptualLuminance(ink), dark = value ** .57, light = value ** .62;
      return prepared.map(([background, bgDark, bgLight]) =>
        perceptualScore(value, background, dark, light, bgDark, bgLight));
    };
  };
})();
