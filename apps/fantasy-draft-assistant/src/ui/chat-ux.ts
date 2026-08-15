export const shouldSubmitChatKey=(event:Pick<KeyboardEvent,'key'|'shiftKey'|'isComposing'>)=>event.key==='Enter'&&!event.shiftKey&&!event.isComposing;
export const isNearConversationBottom=(element:Pick<HTMLElement,'scrollHeight'|'scrollTop'|'clientHeight'>,threshold=64)=>element.scrollHeight-element.scrollTop-element.clientHeight<=threshold;
export const scrollConversationToBottom=(element:Pick<HTMLElement,'scrollHeight'|'scrollTop'>)=>{element.scrollTop=element.scrollHeight};
export function bindChatKeyboard(textarea:HTMLTextAreaElement,form:HTMLFormElement){textarea.addEventListener('keydown',event=>{if(!shouldSubmitChatKey(event))return;event.preventDefault();if(!textarea.value.trim())return;form.requestSubmit()})}
