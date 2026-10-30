import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {verifyDistribution,repository,repositoryId} from './verify-dist.mjs';
const dryRun=process.argv.includes('--dry-run');assert(process.argv.slice(2).every(arg=>arg==='--dry-run'));
assert.equal(process.env.GITHUB_ACTIONS,'true','Publishing requires GitHub OIDC');assert.equal(process.env.GITHUB_REPOSITORY,repository);assert.equal(process.env.GITHUB_REPOSITORY_ID,repositoryId);assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','npm OIDC requires a supported hosted runner');
assert.equal(process.env.DISTRIBUTION_REPOSITORY_PRIVATE,'false');assert(!process.env.NODE_AUTH_TOKEN&&!process.env.NPM_TOKEN,'Persistent npm tokens are not used');
const {record,result}=await verifyDistribution(),tag=`v${record.version}`;
if(!dryRun){
 assert.equal(process.env.GITHUB_REF,`refs/tags/${tag}`);assert.equal(process.env.GITHUB_WORKFLOW_REF,`${repository}/.github/workflows/publish-ppt.yml@refs/tags/${tag}`);
 const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};assert.equal(git('rev-parse','HEAD'),git('rev-parse',`${tag}^{commit}`));assert.equal(spawnSync('git',['merge-base','--is-ancestor','HEAD','origin/main']).status,0,'Release tag must remain in main');
}
const npm=args=>spawnSync('npm',args,{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',NPM_CONFIG_PROVENANCE:'false',NPM_CONFIG_PREFER_ONLINE:'true'}});
const readback=()=>{const r=npm(['view',`@file-viewer/ppt@${record.version}`,'dist.integrity','--json']);if(r.status===0)return JSON.parse(r.stdout);if(/E404|No match found|not in this registry/i.test(r.stderr+r.stdout))return null;throw new Error(r.stderr);};
const existing=readback();
if(existing)assert.equal(existing,record.integrity,'Registry version has different bytes');
else{
 const published=npm(['publish',`release/${record.filename}`,'--access','public','--tag','latest','--ignore-scripts','--provenance=false',...(dryRun?['--dry-run']:[])]);process.stdout.write(published.stdout);process.stderr.write(published.stderr);assert.equal(published.status,0,'OIDC publication failed');
 if(!dryRun){let actual;for(let i=0;i<6;i++){actual=readback();if(actual)break;await new Promise(resolve=>setTimeout(resolve,5000));}assert.equal(actual,record.integrity,'Registry integrity differs');}
}
if(!dryRun){const tags=npm(['view','@file-viewer/ppt','dist-tags','--json']);assert.equal(tags.status,0,tags.stderr);assert.equal(JSON.parse(tags.stdout).latest,record.version,'Registry latest differs');}
console.log(JSON.stringify({method:dryRun?'dry-run':'oidc-registry-verified',...result}));
