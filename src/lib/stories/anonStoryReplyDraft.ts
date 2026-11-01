"use client";

const KEY="sayittome:pending-anonymous-story-reply:v1";
type Draft={sessionId:string;alias:string;storyId:string;text:string;at:number};
export function stageAnonymousStoryReply(input:Omit<Draft,"at">) {
  try {
    sessionStorage.setItem(KEY,JSON.stringify({...input,at:Date.now()}));
  }catch { /* optional draft persistence */ }
}
function consume(test:(draft:Draft)=>boolean) {
  try {
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return "";
    const draft=JSON.parse(raw) as Draft;
    if(!draft.at||Date.now()-draft.at>5*60_000) {
      sessionStorage.removeItem(KEY);return "";
    }
    if(!test(draft))return "";
    sessionStorage.removeItem(KEY);
    return "↪ Respuesta a historia anónima: "+String(draft.text||"").slice(0,1000);
  }catch{return "";}
}
export function takeAnonymousStoryReplyForProfileChat(chatId:string) {
  const id=String(chatId||"").split("__anon_to__")[0];
  return consume(draft=>draft.sessionId===id);
}
export function takeAnonymousStoryReplyForDirectChat(chatId:string) {
  return consume(draft=>Boolean(draft.alias)&&String(chatId).includes(draft.alias));
}
