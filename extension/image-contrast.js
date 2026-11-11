// Shared image-text selection policy. This aggregation is an engineering
// heuristic, not an APCA/WCAG conformance test. See docs/IMAGE-TEXT-CONTRAST.md.
(() => {
  const dark = [18, 18, 18, 1], light = [255, 255, 255, 1];

  function targetFor(size, weight) {
    if (size >= 36 || size >= 24 && weight >= 700) return 45;
    if (size >= 24 || size >= 18 && weight >= 600 || size >= 16 && weight >= 700) return 60;
    return size >= 18 && weight >= 400 ? 75 : 90;
  }

  globalThis.nativeDarkModeImageTextContrast = (sample, options = {}) => {
    const contrast = globalThis.nativeDarkModePerceptualContrast;
    if (!contrast || !sample?.colors?.length || sample.colors.length > 9216 ||
        sample.weights?.length !== sample.colors.length) return null;
    const target = options.decoration ? 45 : targetFor(options.fontSize || 16, options.fontWeight || 400);
    const total = sample.weights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(total) || total <= 0 || sample.weights.some(w => !Number.isFinite(w) || w <= 0) ||
        sample.colors.some(c => c.length < 3 || c.slice(0, 3).some(v => !Number.isFinite(v) || v < 0 || v > 255))) return null;
    const authored = options.authored;
    const validInk = ink => ink?.length >= 3 && ink.every(Number.isFinite) &&
      ink.slice(0, 3).every(v => v >= 0 && v <= 255) && (ink[3] ?? 1) > 0 && (ink[3] ?? 1) <= 1;
    if (options.decoration && (!validInk(authored) || !validInk(options.adapted))) return null;
    const candidates = options.decoration ? [authored, options.adapted] : [dark, light];
    if (!options.decoration && validInk(authored)) candidates.push(authored);
    const measure = contrast.prepare(sample.colors);
    const measurements = candidates.map(ink => {
      const values = measure(ink).map((value, i) => ({ contrast: Math.abs(value), weight: sample.weights[i] }))
        .sort((a, b) => a.contrast - b.contrast);
      let cumulative = 0, lowerDecile = values.at(-1).contrast, found = false;
      let mean = 0, utility = 0, coverage = 0;
      for (const value of values) {
        cumulative += value.weight;
        if (!found && cumulative >= total * .1) { lowerDecile = value.contrast; found = true; }
        mean += value.contrast * value.weight / total;
        utility += Math.min(1, value.contrast / target) * value.weight / total;
        if (value.contrast >= target) coverage += value.weight / total;
      }
      // Reward broad readability without letting very high-contrast pixels
      // compensate indefinitely for unreadable ones. The lower tail matters,
      // but a single outlier must not select ink for the entire label.
      const score = .65 * utility + .35 * Math.min(1, lowerDecile / target);
      return { ink, score, mean, lowerDecile, coverage, worst: values[0].contrast };
    });
    let best = measurements[0].score > measurements[1].score + .02 ? measurements[0] : measurements[1];
    if (options.decoration) best = measurements[1].score > measurements[0].score + .02 ? measurements[1] : measurements[0];
    // Keep useful authored color only when its broad coverage is good and the
    // loss versus the best neutral candidate is negligible. Ties are stable.
    const source = measurements[2];
    if (source?.coverage >= .9 && source.score >= best.score - .02) best = source;
    return { target, uncertain: best.coverage < .9 || best.worst < target / 2,
      method: sample.method || 'weighted-region', ...best, candidates: measurements };
  };
})();
