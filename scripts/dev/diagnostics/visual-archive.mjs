import { mkdir, readFile, writeFile, rename, readdir, appendFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const archiveRoot = fileURLToPath(new URL('../../../research-artifacts/visual-regressions/', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
function token(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) throw Error('Invalid archive case/run ID');
  return value;
}
function recordDirectory(root, caseId, runId, captureId) {
  if (typeof captureId !== 'string' || !captureId.length || captureId.length > 300) throw Error('Invalid capture ID');
  return path.join(root, token(caseId), token(runId), digest(captureId).slice(0,24));
}
async function atomicJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value,null,2)); await rename(temporary,file);
}
export async function archiveCapture({caseId,runId,captureId,png,metadata}, root = archiveRoot) {
  if (metadata?.provenance !== 'local-fixture') throw Error('Only owned local fixture captures are archived automatically');
  if (!Buffer.isBuffer(png) || png.length > 20971520 || png.length < 24 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.toString('ascii',12,16) !== 'IHDR') throw Error('Invalid or oversized PNG');
  const directory = recordDirectory(root,caseId,runId,captureId);
  await mkdir(path.dirname(directory),{recursive:true});
  await mkdir(directory); // Exclusive: never replace an existing candidate or reference image.
  const record = {format:'native-dark-visual-capture',version:1,caseId,runId,captureId,createdAt:new Date().toISOString(),
    metadata, image:{file:'image.png',sha256:digest(png),width:png.readUInt32BE(16),height:png.readUInt32BE(20)}};
  await writeFile(path.join(directory,'image.png'),png,{flag:'wx'});
  await writeFile(path.join(directory,'capture.json'),JSON.stringify(record,null,2),{flag:'wx'});
  return {directory,record};
}
export async function readVisual(caseId,runId,captureId,root = archiveRoot) {
  const directory = recordDirectory(root,caseId,runId,captureId);
  const record = JSON.parse(await readFile(path.join(directory,'capture.json'),'utf8'));
  if(record.format !== 'native-dark-visual-capture' || record.version !== 1 || record.caseId !== caseId || record.runId !== runId || record.captureId !== captureId)throw Error('Invalid visual manifest');
  const imageFile=path.join(directory,'image.png');
  if((await stat(imageFile)).size>20971520)throw Error('Oversized archive image');
  const png=await readFile(imageFile);
  if(digest(png)!==record.image?.sha256)throw Error('Archive image checksum mismatch');
  return record;
}
export function visualCompatibility(before,after) {
  const differences=[],unknown=[];
  for(const field of ['caseId'])if(before[field]!==after[field])differences.push(field);
  for(const field of ['provenance','fixturePath','theme','level','state','action','browser','platform','viewport','dpr','zoom','scroll','crop','fonts','readiness','fixtureHash']){
    const a=before.metadata?.[field],b=after.metadata?.[field];
    if(a===undefined || a===null || b===undefined || b===null)unknown.push(field);
    else if(JSON.stringify(a)!==JSON.stringify(b))differences.push(field);
  }
  for(const field of ['width','height']){
    const a=before.image?.[field],b=after.image?.[field];
    if(!Number.isSafeInteger(a)||a<=0||!Number.isSafeInteger(b)||b<=0)unknown.push('image.'+field);
    else if(a!==b)differences.push('image.'+field);
  }
  for(const [side,record]of [['before',before],['after',after]]){
    if(record.metadata?.settled!==true || record.metadata?.readiness?.fontsReady!==true || record.metadata?.readiness?.visibleImagesReady!==true)unknown.push(side+'.readiness');
    if(record.metadata?.identityStatus!=='match')unknown.push(side+'.identity');
  }
  return {status:differences.length?'incompatible':unknown.length?'unknown':'compatible',differences,unknown,
    rendererChanged:before.metadata?.rendererHash!==after.metadata?.rendererHash,
    limitation:'Metadata compatibility is not visual acceptance, exact font/resource fidelity or a temporal pass. No pixel comparison is performed.'};
}
function conditionKey(record) {
  return digest(JSON.stringify([record.metadata.theme,record.metadata.level,record.metadata.state,record.metadata.zoom,record.metadata.viewport,record.metadata.dpr])).slice(0,24);
}
export async function selectVisualReference(caseId,runId,captureId,root = archiveRoot) {
  const record=await readVisual(caseId,runId,captureId,root);
  if(visualCompatibility(record,record).status!=='compatible')throw Error('Unknown or unsettled capture cannot become a reference');
  const directory=path.join(root,token(caseId),'references');await mkdir(directory,{recursive:true});
  const selection={runId,captureId,selectedAt:new Date().toISOString(),imageHash:record.image.sha256};
  await appendFile(path.join(directory,'history.jsonl'),JSON.stringify(selection)+'\n');
  await atomicJson(path.join(directory,conditionKey(record)+'.json'),selection);
  return selection;
}
export async function listVisuals(caseId,root = archiveRoot) {
  const directory=path.join(root,token(caseId)),rows=[];
  let runs;try{runs=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return rows;throw error;}
  for(const run of runs.filter(e=>e.isDirectory()&&e.name!=='references')){
    for(const capture of await readdir(path.join(directory,run.name),{withFileTypes:true})){
      if(!capture.isDirectory())continue;
      try{const record=JSON.parse(await readFile(path.join(directory,run.name,capture.name,'capture.json'),'utf8'));
        let reference;try{reference=JSON.parse(await readFile(path.join(directory,'references',conditionKey(record)+'.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
        rows.push({runId:record.runId,captureId:record.captureId,theme:record.metadata.theme,level:record.metadata.level,state:record.metadata.state,
          selectedReference:reference?.runId===record.runId&&reference?.captureId===record.captureId});}
      catch{rows.push({runId:run.name,captureId:capture.name,status:'incomplete-manifest'});}
    }
  }
  return rows.sort((a,b)=>(a.runId+'/'+a.captureId).localeCompare(b.runId+'/'+b.captureId));
}

export async function visualCases(root=archiveRoot){
  try{return (await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(e.name)).map(e=>e.name).sort();}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
}
export async function visualImage(caseId,runId,captureId,root=archiveRoot){
  const record=await readVisual(caseId,runId,captureId,root);
  const png=await readFile(path.join(recordDirectory(root,caseId,runId,captureId),'image.png'));
  if(digest(png)!==record.image.sha256)throw Error('Archive image checksum mismatch');
  return png;
}
