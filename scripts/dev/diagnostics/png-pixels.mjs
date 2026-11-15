import {inflateSync} from 'node:zlib';
// Bounded decoder for Chromium's non-interlaced 8-bit RGB/RGBA screenshot PNGs.
// Other PNG types stay explicitly unsupported rather than being silently resampled.
export function decodeScreenshotPng(png){
 if(png.length>20971520||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Unsupported PNG');
 let offset=8,width,height,channels,ended=false;const parts=[];
 while(offset+12<=png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),end=offset+12+size;
  if(end>png.length)throw Error('Truncated PNG');
  let crc=0xffffffff;for(const byte of png.subarray(offset+4,end-4)){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  if(((crc^0xffffffff)>>>0)!==png.readUInt32BE(end-4))throw Error('PNG chunk checksum mismatch');
  const data=png.subarray(offset+8,offset+8+size);
  if(type==='IHDR'){
   if(width||size!==13)throw Error('Invalid PNG header');width=data.readUInt32BE(0);height=data.readUInt32BE(4);
   if(!width||!height||width*height>4000000||data[8]!==8||![2,6].includes(data[9])||data[10]||data[11]||data[12])throw Error('Unsupported PNG geometry/encoding');channels=data[9]===2?3:4;
  }else if(type==='IDAT'){if(!channels)throw Error('PNG data before header');parts.push(data);}
  else if(type==='IEND'){ended=true;break;}
  else if(['tRNS','acTL','fcTL','fdAT'].includes(type))throw Error('Unsupported PNG transparency/animation chunk');
  else if(type[0]===type[0].toUpperCase())throw Error('Unsupported critical PNG chunk');
  offset=end;
 }
 if(!ended||!channels||!parts.length)throw Error('Incomplete PNG');
 const stride=width*channels,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});
 if(raw.length!==(stride+1)*height)throw Error('Invalid decoded PNG size');
 const scan=Buffer.alloc(stride*height),pixels=Buffer.alloc(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unsupported PNG filter');
  for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?scan[i-channels]:0,b=y?scan[i-stride]:0,c=y&&x>=channels?scan[i-stride-channels]:0;
   scan[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}
 }
 for(let i=0,j=0;i<scan.length;i+=channels,j+=4){pixels[j]=scan[i];pixels[j+1]=scan[i+1];pixels[j+2]=scan[i+2];pixels[j+3]=channels===4?scan[i+3]:255;}
 return{width,height,pixels};
}
