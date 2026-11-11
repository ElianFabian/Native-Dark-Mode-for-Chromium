# Original site resources for regression fixtures

These public logos and drawings belong to their respective owners. They are retained for identification and rendering-regression comparisons, not as project branding or an endorsement. The project's license does not relicense third-party artwork. Original embedded attribution/metadata is retained. See each source site for applicable terms.

[`sources.json`](sources.json) records the source URL, retrieval date, byte count, SHA-256 and extraction method for each resource. Public URL assets retain their original bytes. Inline SVG copies from the reporter's Indeed navigation/preference-button HTML retain drawing paths and paint while removing extension-generated markers. Personal labels, account data, analytics IDs, tracking query strings and live handlers are not copied.

- Gradle: horizontal SVG and elephant PNG from the reported plugin portal resource URLs.
- Indeed: original inline logo/navigation/preference SVGs from the supplied HTML, and the reported decorative SVG gradient.
- SEPE / Government of Spain: official header SVG, laptop and benefits drawings from the reported resources.
- Junta de Andalucía: original PNG brand and decoded SVG course/back glyphs from authored `background-image` inspected on the public course page.
- Training school / funding banner: original logo PNG and the reported Government of Spain / European funding PNG.
- InfoJobs: original linked wordmark SVG.
- formacion.cc: original static GIF.
- Amazon: original public 400x900 PNG sprite; the small carousel arrow uses its 11x15 crop at -105px -7px. The reconstruction retains the nested button/inner/icon/hidden-label structure and `clip-path:circle(0px)` from public CSS. A visible-child negative must not receive a whole-element filter.

Keep asset identity separate from delivery semantics. The original Indeed backdrop and Junta glyphs are embedded `data:image/svg+xml` backgrounds in the source CSS; the fixture must keep them embedded. Their decoded files are retained as provenance, not substituted as external CSS URLs. The Indeed logo remains inline in its logo-marked anchor, with original `currentColor` inheritance for navigation/preference icons. Replacing these details can create failures absent from the real page. The surrounding layout is reduced and is not a pixel-perfect website archive.

The Junta logo also requires its source block/flex container geometry. On the live public page, the anchor and image are both about 288×56px, and the shared renderer preserves a white backing on the anchor in all custom themes. An inline-only reduction produced a 17px-high anchor around the same image and incorrectly lost that backing. The fixture restores the authored white header context and full-height logo anchor; a browser assertion covers source geometry and the automatically preserved light backing without forcing a themed color in fixture CSS.

The formacion.cc GIF uses its source 200×150 display size, associated heading/label and authored `#f7f7f7` backing. The first reduction used a larger image alone in a transparent heading, so it did not reproduce the live classification. The EFP school logo similarly retains its block image, full-image anchor box and light header ancestor. Owned public/local CDP comparisons recorded these differences; unified browser checks cover the corrected source contexts and adaptation in all custom themes. Surrounding page layout remains reduced.

The local fixtures load no resources from these public hosts at runtime. Re-fetching an asset is a deliberate maintenance action; verify MIME/content, replace its pinned hash, and review the original/themed comparison. No build or network fetch is required to use the checked-in resources.
