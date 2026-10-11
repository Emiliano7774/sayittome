import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc } from "firebase/firestore";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const rules=readFileSync(join(root,"firestore.rules"),"utf8");
const projectId="demo-following-secure-20261011";
const env=await initializeTestEnvironment({projectId,firestore:{rules}});
try {
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,"usuarios","owner","siguiendo","target"),{
      seguidoUid:"target",createdAt:new Date("2026-10-11T12:00:00.000Z")
    });
  });
  const owner=env.authenticatedContext("owner").firestore();
  const other=env.authenticatedContext("other").firestore();
  const anon=env.unauthenticatedContext().firestore();
  const ownRef=doc(owner,"usuarios","owner","siguiendo","target");
  await assertSucceeds(getDoc(ownRef));
  const list=await assertSucceeds(getDocs(collection(owner,"usuarios","owner","siguiendo")));
  if(list.size!==1)throw new Error("owner_should_see_exact_follow");
  await assertFails(getDocs(collection(other,"usuarios","owner","siguiendo")));
  await assertFails(getDoc(doc(other,"usuarios","owner","siguiendo","target")));
  await assertFails(getDocs(collection(anon,"usuarios","owner","siguiendo")));
  await assertFails(setDoc(doc(owner,"usuarios","owner","siguiendo","forged"),{seguidoUid:"forged"}));
  await assertFails(deleteDoc(ownRef));
  console.log(JSON.stringify({gate:"FOLLOWING_RULES_OWNER_READ_OTHER_DENIED_CLIENT_WRITE_DENIED",pass:true,checks:7}));
}finally{await env.cleanup();}
