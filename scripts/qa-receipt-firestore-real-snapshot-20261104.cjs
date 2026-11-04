const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const{initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve(__dirname,'..');
 const{advanceReceiptSnapshotSignatures:advance,isConfirmedReceiptOnlySnapshot:skip}=await import(pathToFileURL(path.join(root,'src/lib/chat/receiptOnlySnapshot.ts')).href);
 const env=await initializeTestEnvironment({projectId:'receipt-qa-'+Date.now().toString(36),firestore:{host:'127.0.0.1',port:8080,rules:"rules_version = '2'; service cloud.firestore {match /databases/{db}/documents {match /{document=**} {allow read,write: if true;}}}"}});
 let unsub=()=>{};const samples=[];let state={serverReady:false,signatures:new Map()};
 const report={emulator:true,initial:null,receipt:null,text:null,deletion:null,pass:false,projectIsolated:true};
 try{
  const reader=env.authenticatedContext('reader').firestore(),writer=env.authenticatedContext('writer').firestore();
  const collection=writer.collection('chats').doc('qa_chat').collection('mensajes');
  const batch=writer.batch();
  for(let i=0;i<50;i++)batch.set(collection.doc('msg'+String(i).padStart(3,'0')),{texto:'qa '+i,fromUid:'writer',createdAt:new Date(2026,0,1,0,0,i),readBy:{}});
  await batch.commit();
  const q=reader.collection('chats').doc('qa_chat').collection('mensajes').orderBy('createdAt','asc').limitToLast(50);
  unsub=q.onSnapshot(snap=>{
   const changes=snap.docChanges().map(ch=>({id:ch.doc.id,type:ch.type,data:ch.doc.data()}));
   const fast=skip(changes,state,snap.metadata);
   const event={size:snap.size,changes:changes.map(ch=>({type:ch.type,id:ch.id})),fast,cache:snap.metadata.fromCache,pending:snap.metadata.hasPendingWrites};
   samples.push(event);
   if(!fast)state=advance(state,changes,snap.size,()=>snap.docs.map(d=>({id:d.id,data:d.data()})),snap.metadata);
  },err=>{samples.push({error:String(err)})});
  const until=async(pred,label)=>{
   const start=Date.now();
   while(Date.now()-start<10000){const item=samples.find(pred);if(item)return item;await wait(35)}
   throw Error('Missing '+label+': '+JSON.stringify(samples.slice(-4)));
  };
  report.initial=await until(e=>e.size===50&&e.changes?.length===50&&!e.cache,'initial 50 docs');
  assert.equal(report.initial.fast,false);
  await collection.doc('msg025').update({'readBy.reader':true});
  report.receipt=await until(e=>e.changes?.length===1&&e.changes[0].id==='msg025'&&e.fast===true,'readBy-only delta');
  assert.equal(report.receipt.pending,false);assert.equal(report.receipt.cache,false);
  // Multi-document receipt burst from another client must also skip remap.
  const receiptBurst=writer.batch();
  for(let i=0;i<12;i++)receiptBurst.update(collection.doc('msg'+String(i).padStart(3,'0')),{['readBy.reader']:true});
  await receiptBurst.commit();
  report.burst=await until(e=>e.changes?.length===12&&e.fast===true,'12 readBy changes in one server snapshot');
  await collection.doc('msg025').update({texto:'qa edited'});
  report.text=await until(e=>e.changes?.length===1&&e.changes[0].id==='msg025'&&e.fast===false&&e!==report.initial,'text delta');
  await collection.doc('msg026').update({deletedForEveryone:true});
  report.deletion=await until(e=>e.changes?.length===1&&e.changes[0].id==='msg026'&&e.fast===false,'deletion delta');
  await collection.doc('msg027').update({viewOnceLimit:1});
  report.viewOnce=await until(e=>e.changes?.length===1&&e.changes[0].id==='msg027'&&e.fast===false,'view once metadata');
  report.pass=true;
  console.log('PASS_RECEIPT_FIRESTORE_E2E',JSON.stringify({pass:true,initialCount:report.initial.size,receiptOnlySkipped:report.receipt.fast,burstSkipped:report.burst.fast,burstDocs:report.burst.changes.length,textReprocessed:!report.text.fast,deletionReprocessed:!report.deletion.fast,viewOnceReprocessed:!report.viewOnce.fast,noProductionWrites:true,events:samples.length}));
 }finally{unsub();await env.cleanup()}
})().catch(e=>{console.error('FAIL_RECEIPT_FIRESTORE_E2E',e.stack);process.exitCode=1});