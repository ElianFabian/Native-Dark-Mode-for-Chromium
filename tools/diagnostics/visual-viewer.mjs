import {pixelDifference,maxVisualPixels} from './pixel-diff.mjs';
import {setHelp} from './help.mjs';
export function installVisualViewer(){
  const $=id=>document.getElementById(id), a=$('visual-a'),b=$('visual-b');
  let entries=[],pair,epoch=0,scheduled=false;
  for(const id of ['visual-refresh','visual-load'])setHelp($(id),id==='visual-refresh'?'Refresh the local archive listing without capturing pages or changing references.':'Load two local archived PNGs and inspect metadata and raw channel differences. A pixel difference is not a renderer failure.');
  setHelp(document.querySelector('[data-tab=visual]'),'Inspect local archived PNGs side by side, overlaid or as a pixel difference. Conditions and raw evidence remain separate from acceptance.');
  for(const [id,text]of Object.entries({
    'visual-case':'Choose a local archived case; this does not capture a page or change reference selections.',
    'visual-before':'Choose the earlier archived image. Explicitly selected references are labeled.',
    'visual-after':'Choose the candidate archived image. Check its theme, state and conditions before interpreting changes.',
    'visual-mode':'Switch between original images, opacity overlay and a raw RGBA difference map. Originals remain unchanged.',
    'visual-zoom':'Change the display scale of both images together, preserving their stored pixels.',
    'visual-opacity':'Set how strongly the after image is drawn over the before image in overlay mode.',
    'visual-tolerance':'Count pixels whose largest raw RGBA channel difference exceeds this value (0–255). This does not change the originals or establish visual acceptance.'
  }))setHelp($(id),text);
  const api=async(route,params={})=>{const response=await fetch('/api/'+route+'?'+new URLSearchParams(params));if(!response.ok)throw Error('Archived evidence could not be loaded or verified.');return response.json();};
  function invalidate(){epoch++;pair=null;$('visual-output').hidden=true;$('visual-facts').textContent='';$('visual-status').textContent='Choose two archived captures and compare.';}
  function options(select,rows){select.replaceChildren();for(const [value,text]of rows){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}}
  async function loadCase(){invalidate();entries=[];options($('visual-before'),[]);options($('visual-after'),[]);const stamp=epoch;
    try{const rows=await api('visuals',{case:$('visual-case').value});if(stamp!==epoch)return;
      entries=rows.filter(row=>!row.status);const choices=entries.map((row,index)=>[String(index),`${row.selectedReference?'Reference · ':''}${row.runId} · ${row.captureId}`]);
      options($('visual-before'),choices);options($('visual-after'),choices);if(entries.length>1)$('visual-after').selectedIndex=entries.length-1;
      $('visual-status').textContent=entries.length?`${entries.length} captures available.`:'No complete captures available.';
    }catch(error){if(stamp===epoch)$('visual-status').textContent=error.message;}
  }
  async function refresh(){invalidate();const stamp=epoch;try{const cases=await api('visual-cases');if(stamp!==epoch)return;options($('visual-case'),cases.map(id=>[id,id]));if(cases.length)await loadCase();else $('visual-status').textContent='No archived local captures. Run a local capture suite first.';}catch(error){$('visual-status').textContent=error.message;}}
  $('visual-refresh').onclick=refresh;$('visual-case').onchange=loadCase;
  $('visual-before').onchange=invalidate;$('visual-after').onchange=invalidate;
  const params=entry=>({case:$('visual-case').value,run:entry.runId,capture:entry.captureId});
  async function image(entry,record){
    if(record.image.width*record.image.height>maxVisualPixels)throw Error('Image exceeds the 4-million-pixel viewer limit; originals remain in the archive.');
    const image=new Image();image.src='/api/visual-image?'+new URLSearchParams(params(entry));await image.decode();
    if(image.naturalWidth!==record.image.width||image.naturalHeight!==record.image.height)throw Error('Decoded image geometry does not match its manifest.');
    return image;
  }
  $('visual-load').onclick=async()=>{
    const before=entries[Number($('visual-before').value)],after=entries[Number($('visual-after').value)];invalidate();const stamp=epoch;
    if(!before||!after){$('visual-status').textContent='Choose two complete captures.';return;}
    $('visual-status').textContent='Loading and verifying local images…';
    try{
      const [left,right,compatibility]=await Promise.all([api('visual',params(before)),api('visual',params(after)),api('visual-compare',{case:$('visual-case').value,beforeRun:before.runId,beforeCapture:before.captureId,afterRun:after.runId,afterCapture:after.captureId})]);
      const images=await Promise.all([image(before,left),image(after,right)]);if(stamp!==epoch)return;
      pair={images,records:[left,right],sameSize:images[0].naturalWidth===images[1].naturalWidth&&images[0].naturalHeight===images[1].naturalHeight};
      for(const [index,canvas]of [a,b].entries()){canvas.width=images[index].naturalWidth;canvas.height=images[index].naturalHeight;canvas.getContext('2d').drawImage(images[index],0,0);}
      pair.pixels=await Promise.all([before,after].map(async entry=>{const response=await fetch('/api/visual-pixels?'+new URLSearchParams(params(entry)));if(!response.ok)throw Error('Raw PNG decoding unavailable: unsupported or corrupt image.');return new Uint8ClampedArray(await response.arrayBuffer());}));
      if(stamp!==epoch)return;
      $('visual-facts').textContent=JSON.stringify({compatibility,before:left,after:right},null,2);
      $('visual-status').textContent=`Conditions: ${compatibility.status}. Differences: ${compatibility.differences.join(', ')||'none'}. Unknown: ${compatibility.unknown.join(', ')||'none'}. Renderer changed: ${compatibility.rendererChanged}. Pixel changes require review.`;
      for(const option of $('visual-mode').options)option.disabled=!pair.sameSize&&option.value!=='side';
      $('visual-mode').value='side';$('visual-output').hidden=false;analyze();
    }catch(error){if(stamp===epoch){pair=null;$('visual-output').hidden=true;$('visual-status').textContent=error.message;}}
  };
  function zoom(){const scale=Number($('visual-zoom').value);for(const canvas of [a,b]){canvas.style.width=canvas.width*scale+'px';canvas.style.height=canvas.height*scale+'px';}}
  function draw(){if(!pair)return;const mode=$('visual-mode').value,ctx=a.getContext('2d');
    ctx.clearRect(0,0,a.width,a.height);ctx.globalAlpha=1;ctx.drawImage(pair.images[0],0,0);
    $('visual-second').hidden=mode!=='side';$('visual-caption-a').textContent=mode==='side'?'Before':mode==='overlay'?'Before + after overlay':'Raw RGBA difference (magenta; unchanged pixels black)';
    a.setAttribute('aria-label',$('visual-caption-a').textContent);
    if(mode==='overlay'){ctx.globalAlpha=Number($('visual-opacity').value)/100;ctx.drawImage(pair.images[1],0,0);ctx.globalAlpha=1;}
    if(mode==='difference'&&pair.diff)ctx.putImageData(new ImageData(pair.diff.pixels,a.width,a.height),0,0);
    zoom();
  }
  function analyze(){if(!pair)return;
    if(!pair.sameSize){$('visual-result').textContent='Image geometry mismatch: originals shown at their own dimensions. Overlay and pixel difference are unavailable.';draw();return;}
    const start=performance.now();pair.diff=pixelDifference(...pair.pixels,a.width,a.height,Number($('visual-tolerance').value));
    $('visual-result').textContent=`${pair.diff.changed} / ${pair.diff.total} changed pixels above channel tolerance ${pair.diff.tolerance}; maximum raw channel delta ${pair.diff.maxDelta}. Bounds: ${JSON.stringify(pair.diff.bounds)}. Analysis ${(performance.now()-start).toFixed(1)} ms. This is not visual acceptance.`;draw();
  }
  $('visual-mode').onchange=draw;$('visual-zoom').onchange=zoom;$('visual-opacity').oninput=draw;
  $('visual-tolerance').oninput=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;analyze();});}};
  const scrolls=document.querySelectorAll('.visual-scroll');
  for(const pane of scrolls)pane.onscroll=()=>{if(!pair?.sameSize||$('visual-mode').value!=='side')return;for(const other of scrolls)if(other!==pane){if(other.scrollLeft!==pane.scrollLeft)other.scrollLeft=pane.scrollLeft;if(other.scrollTop!==pane.scrollTop)other.scrollTop=pane.scrollTop;}};
  void refresh();
}
