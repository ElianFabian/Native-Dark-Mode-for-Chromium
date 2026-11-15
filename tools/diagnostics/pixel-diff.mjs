export const maxVisualPixels = 4000000;
export function pixelDifference(before,after,width,height,tolerance=0) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>maxVisualPixels)throw Error('Image exceeds the 4-million-pixel comparison limit');
  if(!Number.isInteger(tolerance)||tolerance<0||tolerance>255)throw Error('Invalid channel tolerance');
  if(before.length!==width*height*4||after.length!==before.length)throw Error('Pixel geometry mismatch');
  const pixels=new Uint8ClampedArray(before.length);let changed=0,left=width,top=height,right=-1,bottom=-1,maxDelta=0;
  for(let index=0;index<before.length;index+=4){
    let delta=0;for(let channel=0;channel<4;channel++)delta=Math.max(delta,Math.abs(before[index+channel]-after[index+channel]));
    maxDelta=Math.max(maxDelta,delta);pixels[index+3]=255;
    if(delta<=tolerance)continue;
    changed++;const x=(index/4)%width,y=Math.floor(index/4/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    pixels[index]=Math.max(48,delta);pixels[index+2]=Math.max(48,delta);
  }
  return {pixels,changed,total:width*height,maxDelta,tolerance,bounds:changed?{x:left,y:top,width:right-left+1,height:bottom-top+1}:null};
}
