// Real production agent/tool loop. The harness waits for actual Linux Compute
// replies written by the operator; it never fabricates a successful test result.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {blueprintAgent} from '../lib/ai-agent.js';
import {graphContext,usageFromSteps} from '../lib/ai-blueprint.js';
const [destination,metadata]=process.argv.slice(2);await mkdir(destination,{recursive:true});
const shelf=JSON.parse(await readFile(metadata,'utf8'));
const tasks=[['sphere','Add a single sphere beside the shelf, with an editable radius from 1 to 10 initially 3. Keep the shelf.','shelf'],['noise','Make a Perlin-noise surface and populate 20 spheres on it. Expose width, depth, amplitude, frequency, seed, population count, and sphere radius. Show the surface too.','empty'],['dimensions','Add live overall width, depth and height dimensions around Shelf_Clean3. Keep the shelf visible and expose dimension offset and text height.','shelf']];
async function run([id,brief,source]){
 let current=source==='shelf'?structuredClone(shelf):{controls:[],graph:{nodes:[],wires:[],groups:[],notes:[]},warnings:[]};let attempts=0;let lastPassed=false;const steps=[];const events=[];
 const session={passed:()=>lastPassed,context:()=>graphContext(current),definition:()=>current,test:async({edits,reason})=>{
  if(++attempts>2)return{passed:false,errors:['Two-test budget exhausted']};
  const requestId=`smoke-${id}-${attempts}`;const req={id:requestId,source,plan:{status:'candidate',reason,edits}};
  await writeFile(path.join(destination,requestId+'.plan.json'),JSON.stringify(req,null,2));console.log(requestId,'waiting for actual Compute');
  const deadline=Date.now()+600000;let result;
  while(Date.now()<deadline){try{result=JSON.parse(await readFile(path.join(destination,requestId+'.reply.json'),'utf8'));break;}catch{}await new Promise(r=>setTimeout(r,1000));}
  if(!result)return{passed:false,errors:['Compute harness did not provide a result']};
  const passed=['verified','solved_semantics_unverified'].includes(result.status);lastPassed=passed;
  if(passed)current={controls:result.controls,graph:result.graph,warnings:result.archiveWarnings};
  return{passed,errors:result.error?[result.error]:result.errors||[],warnings:result.warnings||[],objects:result.objects,controls:graphContext(current).controls};
 }};
 try{const agent=blueprintAgent(graphContext(current),{session,allowEdits:true,refinement:false,onStepEnd:async step=>steps.push(step),report:async event=>events.push(event)});const result=await agent.generate({prompt:JSON.stringify({brief,definitionEditing:true}),abortSignal:AbortSignal.timeout(900000)});await writeFile(path.join(destination,id+'.agent.json'),JSON.stringify({brief,attempts,output:result.output,usage:usageFromSteps(steps,'openai/gpt-6.1-sol'),events},null,2));console.log(id,'agent completed',attempts);}catch(e){await writeFile(path.join(destination,id+'.agent.json'),JSON.stringify({brief,attempts,error:e.message,events},null,2));console.log(id,'agent error',e.message.slice(0,150));}
}
await Promise.all(tasks.map(run));
