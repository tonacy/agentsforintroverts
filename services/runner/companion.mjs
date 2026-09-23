#!/usr/bin/env node
import { readArgs, requireWorkspace, requireDate } from './src/args.mjs';
import { openCompanion, companionStatus, readCompanion, checkpointCompanion } from './src/companion.mjs';
import { researchOutside } from './src/outside-research.mjs';
try {
  const {values,positionals} = readArgs(process.argv.slice(2));
  const workspace = requireWorkspace(values);
  const action = positionals[0];
  let input = '';
  if(['checkpoint','research'].includes(action)) for await(const chunk of process.stdin) {
    input += chunk; if(input.length > 30000) throw new Error('Request is too large.');
  }
  const request = input ? JSON.parse(input) : {};
  let result;
  if(action === 'open') result = await openCompanion(workspace);
  else if(action === 'status') result = await companionStatus(workspace);
  else if(action === 'read') result = await readCompanion(workspace);
  else if(action === 'checkpoint') result = await checkpointCompanion(workspace,request);
  else if(action === 'research') result = await researchOutside({workspace,date:requireDate(values),topics:request.topics});
  else throw new Error('Expected open, status, read, checkpoint, or research.');
  process.stdout.write(JSON.stringify(result)+'\n');
} catch(e) {process.stderr.write(e.message+'\n');process.exitCode=1;}
