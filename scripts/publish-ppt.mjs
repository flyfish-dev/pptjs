import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {verifyDistribution,repository,repositoryId,assertFrozenRefBinding,waitForRegistry} from './verify-dist.mjs';
const dryRun=process.argv.includes('--dry-run'),verifyOnly=process.argv.includes('--verify-only');assert(process.argv.slice(2).every(arg=>['--dry-run','--verify-only'].includes(arg)));assert(!(dryRun&&verifyOnly));
assert.equal(process.env.GITHUB_ACTIONS,'true','Publishing requires GitHub OIDC');assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.equal(process.env.GITHUB_REPOSITORY_ID,repositoryId);assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','npm OIDC requires a supported hosted runner');
assert.equal(process.env.DISTRIBUTION_REPOSITORY_PRIVATE,'false');assert(!process.env.NODE_AUTH_TOKEN&&!process.env.NPM_TOKEN,'Persistent npm tokens are not used');
const {record,result}=await verifyDistribution();
if(!dryRun)assertFrozenRefBinding(record.version);
const npm=args=>spawnSync('npm',args,{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',NPM_CONFIG_PROVENANCE:'false',NPM_CONFIG_PREFER_ONLINE:'true'}});
const readback=async()=>{const url=new URL('https://registry.npmjs.org/@file-viewer%2Fppt');url.searchParams.set('publish_check',`${process.env.GITHUB_RUN_ID}-${Date.now()}`);const response=await fetch(url,{headers:{accept:'application/json','cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});assert(response.ok,`Registry read failed (${response.status})`);const data=await response.json();assert.equal(data.name,'@file-viewer/ppt');const integrity=data.versions?.[record.version]?.dist?.integrity;if(integrity)assert.equal(integrity,record.integrity,'Registry version has different bytes');return {integrity,latest:data['dist-tags']?.latest};};
const existing=await readback();
if(!existing.integrity&&!verifyOnly){
 const published=npm(['publish',path.resolve('release',record.filename),'--access','public','--tag','latest','--ignore-scripts','--provenance=false',...(dryRun?['--dry-run']:[])]);process.stdout.write(published.stdout);process.stderr.write(published.stderr);assert.equal(published.status,0,'OIDC publication failed');
}
if(!dryRun){const confirmed=await waitForRegistry(async()=>{const current=await readback();return current.integrity===record.integrity&&current.latest===record.version?current:null;});assert(confirmed,'Registry propagation is pending; continue with --verify-only without republishing');}
console.log(JSON.stringify({method:dryRun?'dry-run':verifyOnly?'registry-readback-verified':'oidc-registry-verified',...result}));
