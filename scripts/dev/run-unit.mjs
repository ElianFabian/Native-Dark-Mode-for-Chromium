// Search only the test tree. Node's repository-wide automatic discovery also
// walks large ignored research/report directories before running any tests.
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function discover(directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) files.push(...await discover(file));
    else if(entry.isFile()&&/\.test\.[cm]?js$/.test(entry.name)) files.push(file);
  }
  return files.sort();
}
const files=await discover(path.join(root,'test'));
if(!files.length) throw Error('No unit test files discovered.');
console.log(`Running ${files.length} unit test files from test/.`);
const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
