import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupCompanion,openCompanion,checkpointCompanion,companionStatus,readCompanion,syncCompanion,messagesFromTurns,companionInstructions} from '../src/companion.mjs';
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'desk-companion-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await Promise.all(['context','preferences'].map(n=>mkdir(join(root,n))));
 await writeFile(join(root,'context/context.md'),'Human context, kept verbatim.');
 return root;
}
const update={expected_revision:'0',summary:'Tentative understanding',open_questions:['What mattered?'],message_ids:[],reason:'First reflection'};
test('one prepared handoff reuses its marker and preserves user context',async t=>{
 const root=await fixture(t);
 const connect=work=>work({call:async()=>({data:[]})});
 const first=await openCompanion(root,{connect});
 const second=await openCompanion(root,{connect});
 assert.equal(first.url,second.url);
 const url=new URL(first.url);
 assert.equal(url.searchParams.get('path'),await realpath(root));
 assert.match(url.searchParams.get('prompt'),/Read .quiet-desk\/CODEX.md/);
 assert.equal(await readFile(join(root,'context/context.md'),'utf8'),'Human context, kept verbatim.');
});
test('checkpoints preserve agent attribution, CAS, history and safe retries',async t=>{
 const root=await fixture(t); await setupCompanion(root);
 const one=await checkpointCompanion(root,update);
 assert.equal(one.author,'agent');
 assert.deepEqual(await checkpointCompanion(root,update),one);
 await assert.rejects(checkpointCompanion(root,{...update,summary:'Stale overwrite'}),/Context changed/);
 const two=await checkpointCompanion(root,{...update,expected_revision:one.revision,summary:'Corrected understanding',reason:'The person corrected the earlier interpretation'});
 const status=await companionStatus(root,{sync:false});
 assert.equal(status.revision,two.revision);assert.equal(status.updates.length,2);
 assert.equal(status.summary,'Corrected understanding');
});
test('concurrent context updates cannot silently overwrite each other',async t=>{
 const root=await fixture(t);await setupCompanion(root);
 const results=await Promise.allSettled([checkpointCompanion(root,update),checkpointCompanion(root,{...update,summary:'Other understanding'})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await companionStatus(root,{sync:false})).updates.length,1);
});
test('rejects fabricated evidence, missing revision and invalid checkpoint shapes',async t=>{
 const root=await fixture(t);
 await assert.rejects(checkpointCompanion(root,{...update,message_ids:['invented']}),/evidence message/);
 await assert.rejects(checkpointCompanion(root,{...update,expected_revision:undefined}),/Context changed/);
 await assert.rejects(checkpointCompanion(root,{...update,open_questions:'foo'}),/open questions/);
});
test('imports only conversation text and binds only the matching workspace handoff',async t=>{
 const root=await fixture(t);const {session}=await setupCompanion(root);
 const first=[{id:'turn',startedAt:100,items:[
  {type:'userMessage',id:'prompt',content:[{type:'text',text:`Quiet Desk session: ${session.marker}`}]},
  {type:'userMessage',id:'human',content:[{type:'text',text:'I felt distracted today.'}]},
  {type:'agentMessage',id:'agent',text:'Was it the interruptions?'},
  {type:'reasoning',id:'private',text:'Hidden reasoning'},
  {type:'commandExecution',id:'tool',text:'Private tool output'}]}];
 const connect=work=>work({call:async(method,params)=>{
  if(method==='thread/list') return {data:[{id:'unrelated'},{id:'bound'}]};
  if(method==='thread/read') return {thread:{cwd:root}};
  if(method==='thread/turns/list') return {data:params.threadId==='unrelated'?[]:first};
  throw Error(method);
 }});
 await syncCompanion(root,connect);
 const state=await readCompanion(root,{sync:false});
 assert.equal(state.status.thread_id,'bound');
 assert.deepEqual(state.conversation.messages.map(m=>m.author),['desk_prompt','conversation_user','agent']);
 assert.equal(state.conversation.messages[1].text,'I felt distracted today.');
 await checkpointCompanion(root,{...update,message_ids:['human']});
 const opened=await openCompanion(root,{connect});
 assert.equal(opened.url,'codex://threads/bound');
});
test('a sync failure retains saved context and surfaces the error',async t=>{
 const root=await fixture(t);await setupCompanion(root);await checkpointCompanion(root,update);
 const state=await companionStatus(root,{connect:async()=>{throw Error('Codex unavailable');}});
 assert.equal(state.summary,update.summary);assert.equal(state.sync_error,'Codex unavailable');
});

const workItem = {
 id:'support-intent',project:'Example project',title:'A support decision',state:'Decision recorded',
 preview:[{heading:'Current direction',text:'A grounded description, not a completion claim.'}],
 notes:'Details stay available.',evidence:'Based on the workspace context.',message_ids:[],
 sources:[{label:'Context',path:'context/context.md'}]
};
test('structured shelf survives legacy checkpoints and preserves stable IDs and history',async t=>{
 const root=await fixture(t);await setupCompanion(root);
 const request={...update,work_items:[workItem],latest_decision:{text:'A decision was recorded.',work_item_id:workItem.id}};
 const first=await checkpointCompanion(root,request);
 assert.deepEqual(await checkpointCompanion(root,request),first);
 const legacy=await checkpointCompanion(root,{...update,expected_revision:first.revision,summary:'A later prose-only checkpoint'});
 const state=await companionStatus(root,{sync:false});
 assert.equal(state.work_items[0].id,workItem.id);assert.equal(state.latest_decision.work_item_id,workItem.id);
 assert.equal(state.summary,'A later prose-only checkpoint');
 await checkpointCompanion(root,{...update,expected_revision:legacy.revision,work_items:[]});
 const empty=await companionStatus(root,{sync:false});
 assert.deepEqual(empty.work_items,[]);assert.equal(empty.latest_decision,null);
 assert.equal((await readFile(join(root,'context/context.md'),'utf8')),'Human context, kept verbatim.');
});
test('work item validation rejects ungrounded states, duplicate identities and unsafe sources',async t=>{
 const root=await fixture(t);
 for (const invalid of [
  {...workItem,sources:[]},
  {...workItem,id:'bad id'},
  {...workItem,message_ids:['fabricated']},
  {...workItem,sources:[{label:'Outside',path:'../outside.md'}]},
  {...workItem,sources:[{label:'Executable',url:'javascript:alert(1)'}]},
  {...workItem,notes:'x'.repeat(8001)},
 ]) await assert.rejects(checkpointCompanion(root,{...update,work_items:[invalid]}));
 await assert.rejects(checkpointCompanion(root,{...update,work_items:[workItem,workItem]}),/unique stable/);
 await assert.rejects(checkpointCompanion(root,{...update,work_items:[workItem],latest_decision:{text:'Done',work_item_id:'missing'}}),/existing work item/);
});
test('work item source symlinks cannot escape the workspace',async t=>{
 const root=await fixture(t);const outside=await fixture(t);
 const {symlink}=await import('node:fs/promises');
 await symlink(join(outside,'context/context.md'),join(root,'linked.md'));
 await assert.rejects(checkpointCompanion(root,{...update,work_items:[{...workItem,sources:[{label:'Escape',path:'linked.md'}]}]}),/inside the workspace/);
});

test('the Desk read carries the person\'s loose pages verbatim, and never set-aside or agent pages',async t=>{
 const root=await fixture(t);
 const day=join(root,'captures/2026-09-23');await mkdir(day,{recursive:true});
 const page=(status,author,words)=>`---\nid: capture_x\ncreated_at: 2026-09-23T08:15:12Z\nauthor: ${author}\nsource_kind: quick_note\nstatus: ${status}\n---\n\n${words}\n`;
 await writeFile(join(day,'081512-a-thought.md'),page('loose','human','The page should start fast,\nthen slow down.'));
 await writeFile(join(day,'091000-not-today.md'),page('set_aside','human','Not today.'));
 await writeFile(join(day,'100000-agent-note.md'),page('loose','agent','An agent note.'));
 await writeFile(join(day,'110000-a-link.md'),'---\nid: capture_y\ncreated_at: 2026-09-23T11:00:00Z\nauthor: human\nsource_kind: link\nstatus: loose\nurl: "https://example.com/a"\n---\n\nhttps://example.com/a\n');
 const state=await readCompanion(root,{sync:false});
 assert.deepEqual(state.inside.loose_pages.map(p=>p.path),['captures/2026-09-23/110000-a-link.md','captures/2026-09-23/081512-a-thought.md']);
 assert.equal(state.inside.loose_pages[1].text,'The page should start fast,\nthen slow down.');
 assert.equal(state.inside.loose_pages[0].url,'https://example.com/a');
 assert.equal(state.inside.loose_pages[1].author,'human');
});
test('the Desk read reports where each piece stands from its files, not a status word',async t=>{
 const root=await fixture(t);
 const dir=join(root,'drafts/one');await mkdir(join(dir,'adaptations'),{recursive:true});await mkdir(join(dir,'approvals'));
 await writeFile(join(dir,'piece.json'),JSON.stringify({id:'one',title:'Why this page *slows down*',revision:2,status:'published',canonical_text:'article.md',adaptations:[{channel:'X',path:'adaptations/x.md'},{channel:'LinkedIn',path:'../../context/context.md'}]}));
 await writeFile(join(dir,'article.md'),'# One\n');await writeFile(join(dir,'adaptations/x.md'),'Short.');
 const {createHash}=await import('node:crypto');
 await writeFile(join(dir,'approvals/x.json'),JSON.stringify({form:'x',payload_sha256:createHash('sha256').update('Short.').digest('hex'),approved_by:'human'}));
 await writeFile(join(dir,'approvals/web.json'),JSON.stringify({form:'web',payload_sha256:'an older version',approved_by:'human'}));
 const state=await readCompanion(root,{sync:false});
 assert.deepEqual(state.pieces,[{folder:'drafts/one',id:'one',title:'Why this page slows down',revision:2,forms:{web:'changed_since_signed',x:'signed'}}]);
});
test('the companion instructions point to loose pages and the piece guide, and leave marks to the person',()=>{
 const text=companionInstructions('/tmp/desk');
 assert.match(text,/captures\/<date>/);
 assert.match(text,/PIECE\.md/);
 assert.match(text,/approvals\/ or receipts\//);
});
