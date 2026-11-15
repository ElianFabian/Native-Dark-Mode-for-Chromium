import { listVisuals,readVisual,selectVisualReference,visualCompatibility } from './diagnostics/visual-archive.mjs';
const [command,caseId,runId,captureId,otherRun,otherCapture,...extra]=process.argv.slice(2);
if(command==='list'&&caseId&&!runId)console.table(await listVisuals(caseId));
else if(command==='reference'&&caseId&&runId&&captureId&&!otherRun)console.log(await selectVisualReference(caseId,runId,captureId));
else if(command==='compare'&&caseId&&runId&&captureId&&otherRun&&otherCapture&&!extra.length){
  const result=visualCompatibility(await readVisual(caseId,runId,captureId),await readVisual(caseId,otherRun,otherCapture));
  console.log(JSON.stringify(result,null,2));if(result.status!=='compatible')process.exitCode=1;
}else throw Error('Use npm run visuals -- list CASE | reference CASE RUN CAPTURE | compare CASE RUN CAPTURE RUN CAPTURE');
