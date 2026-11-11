// Compact deterministic handoff, independent of renderer replacement colors.
export function issueMarkdown(report) {
  const lines=['# Element issue bundle','',
    `Page: ${report.issue?.url ?? 'not recorded'}`,
    `Selector: ${JSON.stringify(report.issue?.selector ?? '')}`, '',
    report.issue?.limitations ?? 'Structural matches are best-effort.',
    'CSS resource URLs and generated text are redacted. No HTML or input values are included. Review the files before sharing.',
    'Original/themed differences are evidence, not automatically defects. Image contrast and optical equivalence can remain unknown.', ''];
  for(const capture of report.captures.filter(c=>c.sourceId)) {
    const source=report.captures.find(c=>c.id===capture.sourceId);
    lines.push(`## ${capture.theme} / ${capture.level} / ${capture.scale}`, '',
      `Settled: ${capture.settled}. Rows: ${capture.rows.length}. Skipped: ${capture.coverage?.skipped ?? 'unknown'}.`, '');
    let matched=0;
    for(const row of capture.rows.slice(0,50)) {
      const original=source?.rows.find(r=>r.key===row.key&&r.signature===row.signature);
      if(!original) { lines.push(`- Unmatched node: ${JSON.stringify(row.key)}. Do not infer a regression from this match.`, '');continue; }
      matched++;
      const changes=[];
      const compare=(a,b,prefix)=>{
        for(const field of ['bounds','backdrop','color','textFill','backgroundColor','backgroundImage','opacity','filter','mask','blend','transform','display','position','fontSize','fontWeight','outline','shadow','borders','boxSizing','padding','overflow','textShadow','decorationLine','decorationColor','decorationThickness','underlineOffset']) {
          if(JSON.stringify(a?.[field])!==JSON.stringify(b?.[field])) changes.push({where:prefix,field,original:a?.[field]??null,applied:b?.[field]??null});
        }
      };
      compare(original,row,'element');
      for(let i=0;i<row.layers.length;i++) compare(original.layers?.[i],row.layers[i],row.layers[i].pseudo||'element style');
      for(const ancestor of row.context??[]) {
        const before=original.context?.find(a=>a.key===ancestor.key);
        if(before) for(let i=0;i<ancestor.layers.length;i++) compare(before.layers[i],ancestor.layers[i],`ancestor ${ancestor.tag} ${ancestor.layers[i].pseudo}`);
      }
      lines.push(`### ${JSON.stringify(row.key)}`, '',
        `Backdrop: ${row.backdrop?.reason ?? 'measured'}. Context ancestors: ${row.context?.length??0}.`, '',
        '```json','[',...changes.slice(0,24).map((change,i,shown)=>'  '+JSON.stringify(change)+(i<shown.length-1?',':'')),']','```',
        changes.length>24?`${changes.length-24} additional changes retained in capture.json.`:'', '');
    }
    lines.push(`Matched nodes: ${matched}/${Math.min(50,capture.rows.length)}. Full facts and preservation evidence: capture.json.`, '');
  }
  return lines.join('\n');
}
