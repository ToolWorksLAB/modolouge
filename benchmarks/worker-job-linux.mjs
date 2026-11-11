// Queue a private regression through the real worker, including execute.js.
// Does not alter a user's app, original definition, or quota records.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.env.MODOLOUGE_WORKER||'/opt/modolouge-worker';
const {get,put,upload,download,sqs,queue}=await import(pathToFileURL(root+'/storage.js'));
const {SendMessageCommand}=createRequire(root+'/package.json')('@aws-sdk/client-sqs');
const [preparedFile,editsFile,resultFile]=process.argv.slice(2);
assert(preparedFile&&editsFile&&resultFile,'Usage: prepared.json edits.json result.json');
const prepared=JSON.parse(await readFile(preparedFile,'utf8'));
const edits=JSON.parse(await readFile(editsFile,'utf8'));
assert(edits.length>24&&edits.length<=96,'Regression must cross the old 24-edit boundary');
const source=randomUUID(),id=process.env.REGRESSION_JOB_ID||randomUUID(),owner='regression-'+randomUUID();
const ttl=Math.floor(Date.now()/1000)+3600;
const preparedKey=`prepared/${owner}/${source}.json`;
await upload(preparedKey,prepared);
await put({pk:'DEF#'+source,sk:'STATE',id:source,owner,status:'ready',filename:'worker-regression.gh',preparedKey,ttl});
const now=Date.now();
await put({pk:'JOB#'+id,sk:'STATE',id,type:'edit',owner,email:'regression@modolouge.invalid',definitionId:source,definitionOwner:owner,edits,values:{},status:'queued',createdAt:new Date(now).toISOString(),createdMs:now,ttl,location:{}});
// The production worker role deliberately cannot enqueue. An authorized caller
// can submit this ID after the JOB record exists, without broadening that role.
if(process.env.REGRESSION_EXTERNAL_QUEUE!=='1')
 await sqs.send(new SendMessageCommand({QueueUrl:queue,MessageBody:JSON.stringify({id})}));
const deadline=Date.now()+210000;
while(Date.now()<deadline){
 const job=await get('JOB#'+id);
 if(job?.status==='failed')throw Error(job.error||'Queued regression failed');
 if(job?.status==='done'){
  const result=JSON.parse(new TextDecoder().decode(await download(job.resultKey)));
  const evidence={jobId:id,edits:edits.length,status:job.status,sourceId:source,owner,result};
  await writeFile(resultFile,JSON.stringify(evidence));
  assert.equal(result.passed,true,JSON.stringify(result.errors));
  assert(result.objects>0);
  assert.equal(result.definition.id,id);
  assert.equal((await get('DEF#'+source)).preparedKey,preparedKey,'Original remains unchanged');
  console.log(JSON.stringify({jobId:id,edits:edits.length,passed:result.passed,objects:result.objects,errors:result.errors,duration:result.duration}));
  process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
throw Error('Queued regression did not finish before its deadline');
