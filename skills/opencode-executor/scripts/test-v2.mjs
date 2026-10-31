import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runtimeVersion, executionOverlay } from './opencode-runtime.mjs';
import { readCLIMetadata, normalizeV2Models } from './read-cli-metadata.mjs';
import { parseModels, buildCatalog, initialAssessments } from './refresh-model-catalog.mjs';
import { axes, digest } from './routing-schema.mjs';
import { collectUsage } from './collect-usage.mjs';

const scripts=fileURLToPath(new URL('.',import.meta.url));
const scratch=resolve(scripts,'../../../artifacts/opencode/tmp');mkdirSync(scratch,{recursive:true});
const base=mkdtempSync(join(scratch,'v2-test.'));after(()=>rmSync(base,{recursive:true,force:true}));
process.env.SKILLS_STATE_DIR=join(base,'isolated-shared-state');
const bin=join(base,'bin');mkdirSync(bin);
const report='# Status\n\nSUCCESS\n\n# Implemented\n\n- Fixture.\n\n# Changed Files\n\n- none\n\n# Verification\n\n- Native fixture passed.\n\n# Plan Deviations\n\n- none\n\n# Blockers\n\n- none\n';
writeFileSync(join(bin,'opencode'),`#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(args[0]==='--version'){fs.writeSync(1,(process.env.V2_TEST_VERSION||'opencode v2.2.2')+'\\n');process.exit(0);}
if(args[0]!=='run'){console.error('No model discovery authorized during execution');process.exit(99);}
const prompt=fs.readFileSync(0,'utf8'),selection=args[args.indexOf('--model')+1],parts=selection.split('#');
const call={args,prompt,model:parts[0],variant:parts[1]??null,overlay:JSON.parse(process.env.OPENCODE_CONFIG_CONTENT||'{}'),config_disabled:process.env.OPENCODE_DISABLE_PROJECT_CONFIG,project_disabled:process.env.OPENCODE_CONFIG_PROJECT_DISABLE,models_fetch_disabled:process.env.OPENCODE_DISABLE_MODELS_FETCH};
fs.appendFileSync('calls.jsonl',JSON.stringify(call)+'\\n');
const emit=e=>fs.writeSync(1,JSON.stringify({sessionID:'ses_fixture',timestamp:1,...e})+'\\n');
if(parts[0]==='fixture/free'&&process.env.V2_TEST_FAILURE){
 if(process.env.V2_TEST_FAILURE==='changed')fs.appendFileSync('user.txt','changed');
 if(process.env.V2_TEST_FAILURE==='tool')emit({type:'tool_use',part:{type:'tool',id:'tool',tool:'shell'}});
 const type=process.env.V2_TEST_FAILURE==='quota'?'provider.free-limit':'provider.internal';
 emit({type:'error',error:{type,status:503,message:'PRIVATE_V2_ERROR'}});process.exit(42);
}
if(!process.env.V2_TEST_RECOVERY)fs.writeFileSync('.agents/IMPLEMENTATION_REPORT.md',${JSON.stringify(report)});
emit({type:'step_start',part:{type:'step-start',id:'start',messageID:'msg_final'}});
emit({type:'step_finish',part:{type:'step-finish',id:'finish',messageID:'msg_final',tokens:{input:10,output:5,reasoning:2,cache:{read:3,write:0}},cost:0}});
if(process.env.V2_TEST_RECOVERY){const text=${JSON.stringify(report)};const split=text.indexOf('# Changed Files');for(const [i,t]of [text.slice(0,split),text.slice(split)].entries())emit({type:'text',part:{type:'text',id:'text'+i,messageID:'msg_final',sessionID:'ses_fixture',text:t}});}
`,{mode:0o755});
writeFileSync(join(bin,'codex'),'#!/bin/sh\nexit 99\n',{mode:0o755});
let serial=0;
const json=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n');
function fixture(routed=false,version='2.2.2'){
 const root=join(base,`consumer ${serial++}`);mkdirSync(join(root,'.agents/skills'),{recursive:true});
 symlinkSync(resolve(scripts,'..'),join(root,'.agents/skills/opencode-executor'));
 writeFileSync(join(root,'AGENTS.md'),'# Project\nPreserve fixture data.\n');
 writeFileSync(join(root,'.gitignore'),'artifacts/\ncalls.jsonl\n');writeFileSync(join(root,'user.txt'),'preserved\n');
 writeFileSync(join(root,'.agents/PLAN.md'),'# Goal\n\nReady: V2 fixture.\n\n# Relevant Instructions\n\nnone\n');
 writeFileSync(join(root,'.agents/IMPLEMENTATION_REPORT.md'),'existing report\n');
 json(join(root,'.agents/executor.json'),{model:'fixture/go',effort:'high',instructions:['AGENTS.md']});
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('OPENCODE_')));
 env.PATH=bin+':'+process.env.PATH;env.XDG_CONFIG_HOME=join(base,'config');env.V2_TEST_VERSION='opencode v'+version;
 env.OPENCODE_CONFIG_CONTENT=JSON.stringify({permissions:[{action:'shell',resource:'*',effect:'ask'}],policies:[{action:'tool.use',resource:'shell:danger *',effect:'deny'}]});
 assert.equal(spawnSync('git',['init','-q',root],{env}).status,0);
 if(routed){
  const entry=(model,variant,billing)=>({model,variant,variant_hash:digest(variant),context:10000,output:1000,tool_use:true,billing,
   rates:Object.fromEntries(['input','output','cache_read','cache_write'].map(k=>[k,billing==='free'?0:1000000])),assessment:Object.fromEntries(axes.map(k=>[k,{score:3,basis:'observed',evidence:'Isolated fixture evidence'}])),evidence:'Fixture only',requires_xhigh:false,outcomes:[]});
  const hash=spawnSync('node',['--input-type=module','-e',`import{contextHash}from ${JSON.stringify(new URL('./route-plan.mjs',import.meta.url).href)};import{writeSync}from'node:fs';writeSync(1,contextHash(process.argv[1],'project',process.argv[2])+'\\n');`,root,version],{env,encoding:'utf8'});assert.equal(hash.status,0,hash.stderr);assert.match(hash.stdout.trim(),/^[a-f0-9]{64}$/);
  json(join(root,'.agents/model-catalog.json'),{schema_version:1,revision:'v2-fixture',credit_unit:'microUSD',source:{kind:'opencode-cli',cli_version:version,captured_at:'2026-10-30T00:00:00Z',context_hash:hash.stdout.trim(),metadata_hash:'fixture'},entries:[entry('fixture/free','careful','free'),entry('fixture/go',null,'go')]});
  json(join(root,'.agents/routing-policy.json'),{schema_version:1,enabled:true,minimum_score:1,default_go:[{model:'fixture/go',variant:null}],specialists:[],allow_provisional:false,auto_fallback:true,reserve_multiplier:1});
  const cap={tokens:10000,credits:10000};json(join(root,'.agents/budget.json'),{schema_version:1,period:'fixture',credit_unit:'microUSD',enforcement:'estimated',project:cap,per_run:cap,phases:Object.fromEntries(['implementation','fallback','repair','validation','specialist'].map(k=>[k,cap])),reserves:{repair:{tokens:100,credits:100},validation:{tokens:100,credits:100}}});
  json(join(root,'.agents/executor-task.json'),{schema_version:1,task_id:'v2-fixture',operations:['implementation'],complexity:1,risk:1,validation:3,context_tokens:100,output_tokens:100,estimated_tokens:{input:20,output:20,cache_read:0,cache_write:0},phase:'implementation'});
 }
 return{root,env,run(extra=[],overrides={}){return spawnSync('bash',[join(scripts,'execute-plan.sh'),'--project',root,...extra],{cwd:base,env:{...env,...overrides},encoding:'utf8'});},calls(){try{return readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);}catch{return[];}}};
}

test('native runtime rejects unknown releases and preserves permissions while denying delegation/extra AI',()=>{
 assert.equal(runtimeVersion('opencode v2.2.2').major,2);assert.equal(runtimeVersion('opencode v2.2.3').major,2);assert.equal(runtimeVersion('1.18.31').major,1);
 for(const v of ['2.2.4','3.0.0','garbage'])assert.throws(()=>runtimeVersion(v));
 const initial={warming:true,compaction:{auto:true,keep:{tokens:8000}},policies:[{action:'tool.use',resource:'shell:*',effect:'deny'}],agents:{build:{permissions:[{action:'edit',resource:'*',effect:'ask'}]}}};
 const c=executionOverlay('2.2.2','fixture/go',initial);
 assert.equal(initial.warming,true);assert.equal(c.warming,false);assert.equal(c.compaction.auto,false);assert.equal(c.compaction.keep.tokens,8000);
 assert.deepEqual(c.agents.build.permissions[0],initial.agents.build.permissions[0]);assert.deepEqual(c.policies[0],initial.policies[0]);
 assert(c.policies.some(x=>x.resource==='subagent:*'&&x.effect==='deny'));
 for(const name of ['title','summary','compaction'])assert.equal(c.agents[name].disabled,true);
 assert.throws(()=>executionOverlay('2.2.2','fixture/go',{permission:{shell:'deny'}}),/Migrate legacy/);
 assert.throws(()=>executionOverlay('2.2.2','fixture/go',{agents:{build:[]}}),/Invalid V2 build agent/);
});

test('both supported V2 releases execute routed exact variants and safe fallback through the native adapter',()=>{
 for(const version of ['2.2.2','2.2.3']){
  const f=fixture(true,version),result=f.run([],{V2_TEST_FAILURE:'technical'});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.deepEqual(f.calls().map(c=>[c.model,c.variant]),[['fixture/free','careful'],['fixture/go',null]]);
  assert(f.calls().every(c=>c.args.includes('--standalone')&&c.overlay.warming===false&&c.config_disabled==='1'));
 }
});

test('V2 emergency defaults execute and settle unassessed approved models without a project model, policy or budget',()=>{
 const f=fixture(true,'2.2.3'),shared=join(base,`global-state ${serial++}`),configHome=join(shared,'config');mkdirSync(shared);
 json(join(f.root,'.agents/executor.json'),{instructions:['AGENTS.md']});
 const c=JSON.parse(readFileSync(join(f.root,'.agents/model-catalog.json')));
 c.schema_version=2;c.source.scope='global';c.unassessed=[];c.exclusions=[];
 c.unassessed=c.entries.filter(e=>e.billing==='free');c.entries=[];
 for(const e of c.unassessed){e.model='opencode/deepseek-fixture-free';for(const a of Object.values(e.assessment))Object.assign(a,{score:null,basis:'unknown'});}
 for(const file of ['model-catalog.json','routing-policy.json','budget.json'])rmSync(join(f.root,'.agents',file));
 const env={...f.env,SKILLS_STATE_DIR:shared,XDG_CONFIG_HOME:configHome};
 const hash=spawnSync('node',['--input-type=module','-e',`import{contextHash}from ${JSON.stringify(new URL('./route-plan.mjs',import.meta.url).href)};import{writeSync}from'node:fs';writeSync(1,contextHash(process.argv[1],'global','2.2.3'));`,f.root],{env,encoding:'utf8'});
 assert.equal(hash.status,0,hash.stderr);c.source.context_hash=hash.stdout.trim();
 json(join(shared,'catalog.json'),c);
 const source=resolve(scripts,'../../..');
 json(join(shared,'consumer.json'),JSON.parse(readFileSync(join(source,'consumer.example.json'))));
 const pool=JSON.parse(readFileSync(join(source,'credits.example.json')));pool.volume.enabled=true;json(join(shared,'credits.json'),pool);
 const result=f.run([],{SKILLS_STATE_DIR:shared,XDG_CONFIG_HOME:configHome});assert.equal(result.status,0,result.stderr+result.stdout);
 assert.deepEqual(f.calls().map(x=>[x.model,x.variant]),[['opencode/deepseek-fixture-free','careful']]);
 const state=JSON.parse(readFileSync(join(shared,'credits.json')));
 assert.equal(state.state.codex.status,'unavailable');assert.equal(state.state.last_error.code,'usage_key');
 assert.equal(Object.values(state.state.runs).length,1);assert(Object.values(state.state.runs).every(r=>r.state==='finished'&&r.usage_credits===0));
 assert.equal(existsSync(join(f.root,'.agents/budget.json')),false);
 assert.equal(existsSync(join(f.root,'artifacts/opencode/workspace.lock')),false);
});

test('V2 executor uses native standalone/events, exact variant and stdin; preflight remains offline',()=>{
 const f=fixture();assert.equal(f.run(['--check']).status,0);assert.equal(f.calls().length,0);assert.equal(readFileSync(join(f.root,'.agents/IMPLEMENTATION_REPORT.md'),'utf8'),'existing report\n');
 const result=f.run([],{OPENCODE_CONFIG_PROJECT_DISABLE:'0'});assert.equal(result.status,0,result.stderr+result.stdout);const[c]=f.calls();assert.equal(f.calls().length,1);
 assert.equal(c.args.includes('--standalone'),true);assert.equal(c.args.includes('--variant'),false);assert.equal(c.args.includes('--auto'),false);assert.equal(c.args.includes('--continue'),false);assert.equal(c.args.includes('--session'),false);
 assert.equal(c.args.includes('fixture/go#high'),true);assert.equal(c.args.some(x=>x.includes('# Task plan')),false);assert.match(c.prompt,/# Task plan/);assert.match(c.prompt,/Preserve fixture data/);assert.equal(c.config_disabled,'1');
 assert.equal(c.overlay.warming,false);assert.equal(c.overlay.compaction.auto,false);assert.equal(c.project_disabled,'1');assert.equal(c.models_fetch_disabled,'1');
});

test('unknown runtime and mixed unsafe inline config fail before report mutation/inference',()=>{
 for(const overrides of [{V2_TEST_VERSION:'opencode v3.0.0'},{OPENCODE_CONFIG_CONTENT:JSON.stringify({permission:{shell:'deny'}})}]){
  const f=fixture(),result=f.run([],overrides);assert.notEqual(result.status,0);assert.equal(f.calls().length,0);assert.equal(readFileSync(join(f.root,'.agents/IMPLEMENTATION_REPORT.md'),'utf8'),'existing report\n');
 }
});

test('V2 routed execution pins the custom variant and atomically permits one safe technical fallback',()=>{
 const f=fixture(true),result=f.run([],{V2_TEST_FAILURE:'technical'});assert.equal(result.status,0,result.stderr+result.stdout);
 assert.deepEqual(f.calls().map(x=>[x.model,x.variant]),[['fixture/free','careful'],['fixture/go',null]]);
 const state=JSON.parse(readFileSync(join(f.root,'artifacts/opencode/budget/state.json'),'utf8'));
 assert.equal(state.tasks['v2-fixture'].fallbacks,1);assert.equal(Object.keys(state.runs).length,2);
 const runs=Object.values(state.runs);assert.equal(runs[0].outcome.fallback_safe,true);assert.equal(runs[1].outcome.usage.tokens,20);assert.equal(runs[1].outcome.accounting.credits,'estimated-from-catalog');
 const records=readdirSync(join(f.root,'artifacts/opencode/runs'));assert.equal(records.length,2);
});

test('V2 quota errors, tool work and changed workspace never cause automatic replay',()=>{
 for(const failure of ['quota','tool','changed']){const f=fixture(true),result=f.run([],{V2_TEST_FAILURE:failure});assert.equal(result.status,42,result.stderr+result.stdout);assert.equal(f.calls().length,1);}
});

test('V2 usage is session-bound, deduplicated and conservative about zeros/truncation/errors',()=>{
 const file=join(base,'usage.jsonl'),entry={billing:'go',rates:{input:1000000,output:1000000,cache_read:1000000,cache_write:1000000}};
 const finish={type:'step_finish',sessionID:'ses_a',part:{id:'finish',type:'step-finish',tokens:{input:10,output:5,reasoning:2,cache:{read:3,write:0}},cost:0}};
 const check=events=>{writeFileSync(file,events.map(JSON.stringify).join('\n')+'\n');return collectUsage(file,entry,'opencode v2.2.2');};
 assert.equal(check([finish,finish]).usage.tokens,20);assert.equal(check([finish]).usage.credits,20);
 assert.equal(check([finish,{...finish,sessionID:'ses_b'}]).usage.tokens,null);
 const zero=structuredClone(finish);zero.part.tokens={input:0,output:0,reasoning:0,cache:{read:0,write:0}};assert.equal(check([zero]).usage.tokens,null);assert.equal(check([finish,{...zero,part:{...zero.part,id:'second'}}]).usage.tokens,null);
 const error={type:'error',sessionID:'ses_a',error:{type:'provider.internal',status:503,message:'private'}};
 assert.equal(check([error]).before_work,true);assert.equal(check([error]).session_id,'ses_a');assert.equal(check([{...error,error:{type:'provider.go-limit',status:429,retryAfterMs:3000}}]).retry_after_ms,3000);assert.equal(check([{...error,error:{type:'provider.go-limit',status:429}},error]).before_work,false);
 assert.equal(check([finish,error]).before_work,false);writeFileSync(file,JSON.stringify(finish));assert.equal(collectUsage(file,entry,'2.2.2').usage.tokens,null);
});

const nativeModel={id:'model',modelID:'upstream/model',providerID:'fixture',name:'Fixture',enabled:true,type:'chat',settings:{reasoningEffort:'medium'},capabilities:{tools:true,input:['text'],output:['text']},variants:[{id:'custom',settings:{reasoningEffort:'high',budgetTokens:9000}}],cost:[{input:1,output:2,cache:{read:0.1,write:0}}],limit:{context:20000,output:2000}};
test('V2 metadata comes only from the CLI roster and effective custom variants, with full bindings',()=>{
 const config={key:'PRIVATE_CONFIG_SENTINEL'},agent={id:'build',request:{headers:{},body:{}},permissions:[]};const seen=[];
 const response=data=>JSON.stringify({location:{directory:base},data});
 const cli=args=>{seen.push(args);switch(args.join(' ')){
  case '--version':return'opencode v2.2.2\n';case 'models --standalone':return'fixture/model\n';case 'debug config --standalone':return JSON.stringify([{type:'document',info:config}]);
  case 'api --standalone model.list':return response([nativeModel]);case 'api --standalone provider.list':return response([{id:'fixture',settings:{apiKey:'PRIVATE_PROVIDER_SENTINEL'}}]);case 'api --standalone agent.list':return response([agent]);default:throw Error('Unexpected command');}};
 const c=readCLIMetadata(base,parseModels,cli);const initial=initialAssessments(c.models,'v2-draft',null,{context_hash:'fixture'},c.agent);
 const built=buildCatalog(base,c.models,initial.annotations,{kind:'opencode-cli',scope:'global',cli_version:c.version,captured_at:'2026-10-30T00:00:00Z',context_hash:'fixture',metadata_hash:digest(c.metadata)},c.agent);
 assert.equal(built.entries.length,0);assert.equal(built.unassessed.length,2);assert.deepEqual(built.unassessed.map(e=>e.variant),[null,'custom']);assert.equal(built.unassessed[0].rates.input,1000000);
 assert.doesNotMatch(JSON.stringify(built),/PRIVATE_(CONFIG|PROVIDER)_SENTINEL/);assert(seen.every(args=>!args.includes('run')&&!args.includes('--refresh')));
 const changed=structuredClone(nativeModel);changed.variants[0].settings.budgetTokens++;
 const b=normalizeV2Models(['fixture/model'],[changed]);assert.notEqual(digest(c.models.get('fixture/model').variants.custom),digest(b.get('fixture/model').variants.custom));
 assert.throws(()=>normalizeV2Models(['fixture/missing'],[nativeModel]));assert.throws(()=>normalizeV2Models(['fixture/model'],[{...nativeModel,variants:undefined}]));
 const strongAgent={...agent,model:{providerID:'fixture',id:'model',variant:'xhigh'}},annotations=initialAssessments(c.models,'v2-strong',null,{context_hash:'fixture'},strongAgent);
 const strong=buildCatalog(base,c.models,annotations.annotations,{kind:'opencode-cli',scope:'global',cli_version:c.version,captured_at:'2026-10-30T00:00:00Z',context_hash:'fixture',metadata_hash:'fixture'},strongAgent);assert(strong.unassessed.every(e=>e.requires_xhigh));
});

test('V2 final assistant report can span native text parts, while tool text stays ineligible',()=>{
 const f=fixture(),result=f.run([],{V2_TEST_RECOVERY:'1'});assert.equal(result.status,0,result.stderr+result.stdout);
 assert.equal(readFileSync(join(f.root,'.agents/IMPLEMENTATION_REPORT.md'),'utf8'),report);
});

test('V2 recovery rejects earlier messages, conflicting parts and mixed sessions',()=>{
 const file=join(base,'report-events.jsonl'),target=join(base,'report.md');
 const text=(id,messageID,value=report)=>({type:'text',sessionID:'ses_a',part:{type:'text',sessionID:'ses_a',id,messageID,text:value}});
 const later={type:'reasoning',sessionID:'ses_a',part:{type:'reasoning',messageID:'msg_b'}};
 for(const events of [[text('a','msg_a'),later],[text('a','msg_a'),text('a','msg_a',report+'changed')],[{...text('a','msg_a'),part:{...text('a','msg_a').part,sessionID:'ses_b'}}],[text('a','msg_a'),{...text('b','msg_a'),sessionID:'ses_b'}],[{type:'tool_use',sessionID:'ses_a',part:{type:'tool',id:'a',messageID:'msg_a',text:report}}]]){
  writeFileSync(file,events.map(JSON.stringify).join('\n')+'\n');writeFileSync(target,'preserved\n');
  assert.notEqual(spawnSync('node',[join(scripts,'recover-report.mjs'),file,target]).status,0);assert.equal(readFileSync(target,'utf8'),'preserved\n');
 }
});

test('V2 explicit catalog adapter publishes only into an isolated fake installation and preserves it on capture failure',()=>{
 const f=fixture(),metadataBin=join(base,'metadata-bin');mkdirSync(metadataBin);
 const agent={id:'build',request:{headers:{},body:{}},permissions:[]};
 writeFileSync(join(metadataBin,'opencode'),`#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2),command=args.join(' ');
if(process.env.OPENCODE_CONFIG_PROJECT_DISABLE!=='1'||process.env.OPENCODE_DISABLE_MODELS_FETCH!=='1')process.exit(98);
const output=value=>fs.writeSync(1,typeof value==='string'?value+'\\n':JSON.stringify(value)+'\\n');
const response=data=>output({location:{directory:process.cwd()},data});
switch(command){
case '--version':output('opencode v2.2.2');break;
case 'models --standalone':output('fixture/model');break;
case 'debug config --standalone':output([{type:'document',info:{}}]);break;
case 'api --standalone model.list':{const m=${JSON.stringify(nativeModel)};if(process.env.V2_TEST_BROKEN_METADATA)delete m.variants;if(process.env.V2_TEST_DROP_VARIANT)m.variants=[];response([m]);break;}
case 'api --standalone provider.list':response([{id:'fixture'}]);break;
case 'api --standalone agent.list':response([${JSON.stringify(agent)}]);break;
default:process.exit(99);
}
`,{mode:0o755});
 const env={...f.env,PATH:metadataBin+':'+process.env.PATH,XDG_CONFIG_HOME:join(base,'isolated-v2-installation'),SKILLS_STATE_DIR:join(base,'isolated-v2-state')};
 const update=(revision,extra={})=>spawnSync('node',[join(scripts,'refresh-model-catalog.mjs'),'--update','--global','--revision',revision],{cwd:f.root,env:{...env,...extra},encoding:'utf8'});
 const result=update('fake-v2-a');assert.equal(result.status,0,result.stderr);
 const target=join(env.SKILLS_STATE_DIR,'catalog.json'),saved=readFileSync(target,'utf8'),c=JSON.parse(saved);
 assert.equal(c.source.cli_version,'opencode v2.2.2');assert.equal(c.entries.length,0);assert.deepEqual(c.unassessed.map(e=>e.variant),[null,'custom']);assert(saved.includes('\n  "schema_version": 2,'));
 const revisions=join(env.SKILLS_STATE_DIR,'catalog-revisions'),draft=join(f.root,'artifacts/opencode/catalog-update-old');
 for(const directory of [revisions,draft]){mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'invalid.json'),'{obsolete');}
 assert.notEqual(update('fake-v2-b',{V2_TEST_BROKEN_METADATA:'1'}).status,0);assert.equal(readFileSync(target,'utf8'),saved);
 assert(existsSync(revisions)&&existsSync(draft));
 const refreshed=update('fake-v2-b',{V2_TEST_DROP_VARIANT:'1'});assert.equal(refreshed.status,0,refreshed.stderr);
 assert.deepEqual(JSON.parse(readFileSync(target,'utf8')).unassessed.map(e=>e.variant),[null]);assert.equal(existsSync(revisions),false);assert.equal(existsSync(draft),false);
});

test('V2 global fingerprints permit equivalent projects and detect ancestor/agent/inline overrides',()=>{
 const f=fixture(),g=fixture();
 const hash=(root,overrides={})=>{const r=spawnSync('node',['--input-type=module','-e',`import{contextHash}from ${JSON.stringify(new URL('./route-plan.mjs',import.meta.url).href)};import{writeSync}from'node:fs';writeSync(1,contextHash(process.argv[1],'global','2.2.2'));`,root],{env:{...f.env,...overrides},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 const baseline=hash(f.root);assert.equal(hash(g.root),baseline);
 writeFileSync(join(g.root,'.agents/PLAN.md'),'Different project plan\n');assert.equal(hash(g.root),baseline);
 mkdirSync(join(g.root,'.agents/agents'));writeFileSync(join(g.root,'.agents/agents/build.md'),'Different effective build agent\n');assert.notEqual(hash(g.root),baseline);
 assert.notEqual(hash(f.root,{OPENCODE_CONFIG_CONTENT:'{"warming":false}'}),baseline);
 writeFileSync(join(base,'opencode.json'),'{}\n');assert.notEqual(hash(f.root),baseline);rmSync(join(base,'opencode.json'));
 const external=join(base,'linked-settings.json');writeFileSync(external,'{}\n');symlinkSync(external,join(f.root,'opencode.json'));
 const linked=hash(f.root);writeFileSync(external,'{"warming":false}\n');assert.notEqual(hash(f.root),linked);
 const store=join(base,'catalog-and-config');mkdirSync(store);writeFileSync(join(store,'opencode.json'),'{}\n');
 const options={SKILLS_STATE_DIR:store,OPENCODE_CONFIG_DIR:store},sharedHash=hash(f.root,options);
 writeFileSync(join(store,'catalog.json'),'{"revision":"ignored-metadata"}\n');mkdirSync(join(store,'catalog.json.lock'));
 assert.equal(hash(f.root,options),sharedHash);
 writeFileSync(join(store,'opencode.json'),'{"warming":false}\n');assert.notEqual(hash(f.root,options),sharedHash);
});

test('V2 source/runtime mismatch and invalid inline config block before a routed reservation',()=>{
 const f=fixture(true);const result=f.run([],{V2_TEST_VERSION:'1.18.31'});assert.notEqual(result.status,0);assert.equal(f.calls().length,0);
 const g=fixture(true);const invalid=g.run([],{OPENCODE_CONFIG_CONTENT:JSON.stringify({permission:{shell:'allow'}})});assert.notEqual(invalid.status,0);assert.equal(g.calls().length,0);
 assert.equal(readFileSync(join(g.root,'.agents/IMPLEMENTATION_REPORT.md'),'utf8'),'existing report\n');
 assert.equal(readdirSync(g.root).includes('calls.jsonl'),false);
 assert.equal(existsSync(join(f.root,'artifacts/opencode/budget/state.json')),false);assert.equal(existsSync(join(g.root,'artifacts/opencode/budget/state.json')),false);
});
