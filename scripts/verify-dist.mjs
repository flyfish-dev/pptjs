import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const repository='flyfish-dev/pptjs',repositoryId='1439507870';
const digest=body=>createHash('sha256').update(body).digest('hex');
export async function waitForRegistry(read,{timeoutMs=600000,intervalMs=5000,now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const deadline=now()+timeoutMs;
 while(true){const value=await read();if(value)return value;const remaining=deadline-now();if(remaining<=0)return null;await pause(Math.min(intervalMs,remaining));}
}
export function assertFrozenRefBinding(version,context=process.env,root=process.cwd()){
 const tag=`v${version}`,git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const head=git('rev-parse','HEAD'),frozen=git('rev-parse',`${tag}^{commit}`);
 if(context.GITHUB_REF===`refs/tags/${tag}`){assert.equal(head,frozen);assert.equal(context.GITHUB_WORKFLOW_REF,`${repository}/.github/workflows/publish-ppt.yml@refs/tags/${tag}`);}
 else{
  assert.equal(context.GITHUB_EVENT_NAME,'workflow_dispatch','Maintenance publication requires explicit dispatch');assert.equal(context.GITHUB_REF,'refs/heads/main');assert.equal(context.PPT_CANDIDATE_TAG,tag,'Dispatched candidate must match the frozen version');assert.equal(context.GITHUB_WORKFLOW_REF,`${repository}/.github/workflows/publish-ppt.yml@refs/heads/main`);
 }
 assert.equal(spawnSync('git',['merge-base','--is-ancestor',frozen,head],{cwd:root}).status,0,'Controls must retain the immutable candidate tag');
 assert.equal(spawnSync('git',['merge-base','--is-ancestor',head,'origin/main'],{cwd:root}).status,0,'Publisher controls must be retained in main');
 assert.equal(git('diff',tag,'--',`release/file-viewer-ppt-${version}.tgz`,'release/npm-release.json','release/qualification.json','LICENSE','NOTICE.md'),'','Maintenance controls cannot change frozen artifacts or qualification');
 return {tag,frozenCommit:frozen,controlCommit:head};
}
export function verifyArchive(bytes,record){
 assert.equal(bytes.length,record.bytes,'Archive byte count differs');
 assert.equal(digest(bytes),record.sha256,'Archive SHA-256 differs');
 assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),record.integrity,'Archive integrity differs');
 const tar=gunzipSync(bytes),files=new Map();let offset=0,ended=false;
 const string=buffer=>buffer.toString('utf8').replace(/\0.*$/s,'');
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0)){assert(tar.length-offset>=1024&&tar.subarray(offset).every(byte=>byte===0),'Invalid tar terminator');ended=true;break;}
  const checksum=Number.parseInt(string(header.subarray(148,156)).trim(),8),sum=header.reduce((value,byte,index)=>value+(index>=148&&index<156?32:byte),0);assert.equal(sum,checksum,'Invalid tar checksum');
  const sizeText=string(header.subarray(124,136)).trim();assert(/^[0-7]+$/.test(sizeText),'Invalid tar size');const size=Number.parseInt(sizeText,8);assert(Number.isSafeInteger(size)&&size>=0);
  const prefix=string(header.subarray(345,500)),name=(prefix?prefix+'/':'')+string(header.subarray(0,100));
  assert(/^[a-zA-Z0-9_./-]+$/.test(name)&&name.startsWith('package/')&&path.posix.normalize(name)===name&&!name.split('/').includes('..'),'Unsafe tar path');
  assert(header[156]===0||header[156]===48,'Only regular package files are allowed');
  const file=name.slice(8);assert(!files.has(file),'Duplicate tar path');
  assert(file.startsWith('dist/')||['package.json','LICENSE','NOTICE.md','README.md'].includes(file),'Unexpected package file');
  assert(!file.endsWith('.map')&&(!file.endsWith('.ts')||file.endsWith('.d.ts')),'Implementation source or source map in archive');
  assert(!/\.(?:wasm|otf|ttf|ppt|pot|pptx|pdf|png|jpe?g)$/i.test(file),'Private or native binary in archive');
  assert(offset+512+size<=tar.length,'Truncated tar member');files.set(file,tar.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
 }
 assert(ended&&tar.length%512===0,'Truncated tar terminator');assert(files.size>0,'Empty archive');assert.equal(files.size,record.files.length,'Archive entry count differs');
 assert.equal(new Set(record.files.map(file=>file.path)).size,record.files.length,'Duplicate inventory path');
 for(const file of record.files){assert(files.has(file.path),'Missing inventory member');assert.equal(digest(files.get(file.path)),file.sha256,`Archive member differs: ${file.path}`);}
 for(const required of ['package.json','LICENSE','NOTICE.md','README.md','dist/index.js','dist/pptjs.worker.js','dist/manifest.json'])assert(files.has(required),`Missing ${required}`);
 const pkg=JSON.parse(files.get('package.json'));assert.equal(pkg.name,'@file-viewer/ppt');assert.equal(pkg.version,record.version);assert.equal(pkg.private,false);assert.equal(pkg.license,'Apache-2.0');assert.equal(pkg.repository.url,`git+https://github.com/${repository}.git`);
 for(const key of ['dependencies','optionalDependencies','peerDependencies','bundledDependencies'])assert.equal(Object.keys(pkg[key]??{}).length,0,`Unexpected ${key}`);
 const manifest=JSON.parse(files.get('dist/manifest.json'));assert.equal(manifest.packageVersion,pkg.version);assert.equal(manifest.sourceRepositoryPrivate,true);assert.equal(manifest.wasmRequired,false);
 return {name:pkg.name,version:pkg.version,bytes:bytes.length,integrity:record.integrity,files:files.size};
}
export function verifyPublicIndex(root){
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 const allowed=file=>['.github/workflows/publish-ppt.yml','README.md','LICENSE','NOTICE.md','publication.json','scripts/verify-dist.mjs','scripts/publish-ppt.mjs','release/npm-release.json','release/qualification.json'].includes(file)||/^release\/file-viewer-ppt-\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\.tgz$/.test(file);
 for(const entry of git('ls-files','--stage','-z').split('\0').filter(Boolean)){const [header,file]=entry.split('\t');assert(allowed(file),`Unexpected public index entry: ${file}`);assert(/^100(?:644|755) /.test(header),'Only regular public files are allowed');}
 const head=spawnSync('git',['rev-parse','--verify','HEAD'],{cwd:root,encoding:'utf8'});
 if(head.status===0)for(const file of git('log','--all','--pretty=format:','--name-only').split('\n').filter(Boolean))assert(allowed(file),`Private history cannot be exported: ${file}`);
}
export async function verifyDistribution(root=process.cwd()){
 verifyPublicIndex(root);
 const config=JSON.parse(await readFile(path.join(root,'publication.json'),'utf8'));assert.equal(config.repository,repository);assert.equal(String(config.repositoryId),repositoryId);assert.equal(config.sourceRepositoryPrivate,true);
 const record=JSON.parse(await readFile(path.join(root,'release/npm-release.json'),'utf8'));
 assert.match(record.version,/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);assert.equal(record.filename,`file-viewer-ppt-${record.version}.tgz`);
 const qualification=JSON.parse(await readFile(path.join(root,'release/qualification.json'),'utf8'));
 assert.equal(qualification.archiveIntegrity,record.integrity);assert.match(qualification.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(qualification.sourceRepositoryPrivate,true);assert.equal(qualification.runner,'oracle-linux-arm64');assert(qualification.namedTests>0);
 assert.deepEqual(qualification.checks,[['verify',0],['test:package',0],['test:browser',0],['test:consumers',0],['audit',0]],'Oracle checks did not all pass');
 const result=verifyArchive(await readFile(path.join(root,'release',record.filename)),record);return {record,qualification,result};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify((await verifyDistribution()).result));
