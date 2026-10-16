import {writeFile, readFile, unlink} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {evaluate} from './cdp.mjs';

export function validate(game, seconds) {
  if (!/^\d+$/.test(game)) throw Error('Use the full numeric Steam game ID');
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw Error('Duration must be 1–120 whole seconds');
}
// These are private Steam UI APIs, observed on the tested Deck client. Fail closed
// when their shape changes; never change unrelated Steam or game settings.
const prelude = `
if (!window.g_GRS || !window.settingsStore || !window.webpackChunksteamui) throw Error('Unsupported Steam UI');
window.webpackChunksteamui.push([['capture-tools-'+Date.now()],{},r=>window.__captureToolsRequire=r]);
const setting=window.__captureToolsRequire(39828)?.qt;
if (typeof setting !== 'function') throw Error('Unsupported Steam setting API');
const recorder=window.g_GRS;
`;
export async function action(command, data, endpoint) {
  const expressions = {
    inspect: `return {mode:settingsStore.clientSettings.gamerecording_background_mode,maxFps:settingsStore.clientSettings.gamerecording_max_fps};`,
    enable: `await setting('gamerecording_background_mode',2); if(settingsStore.clientSettings.gamerecording_background_mode!==2) throw Error('Recording mode did not change'); return true;`,
    start: `const r=await recorder.StartRecording(${JSON.stringify(data.game)}); if(r?.GetEResult?.()!==1) throw Error('Steam refused recording'); return true;`,
    stop: `await recorder.StopRecording(${JSON.stringify(data.game)}); return true;`,
    restore: `const current=settingsStore.clientSettings.gamerecording_background_mode; if(current!==${JSON.stringify(data.mode)} && current!==2) throw Error('Recording mode changed externally; refusing overwrite'); await setting('gamerecording_background_mode',${JSON.stringify(data.mode)}); if(settingsStore.clientSettings.gamerecording_background_mode!==${JSON.stringify(data.mode)}) throw Error('Settings restoration failed'); return true;`
  };
  if (!(command in expressions)) throw Error('Unknown action');
  return evaluate(`(async()=>{${prelude}${expressions[command]}})()`, endpoint);
}
export async function record({game,seconds,receipt,endpoint}, deps={}) {
  validate(game,seconds);
  const call=deps.call || ((cmd,data)=>action(cmd,data,endpoint));
  const save=deps.save || (value=>writeFile(receipt,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}));
  const remove=deps.remove || (()=>unlink(receipt));
  const wait=deps.wait || (()=>sleep(seconds*1000));
  const before=await call('inspect',{});
  // Refuse to interrupt an existing background/on-demand recording configuration.
  if (before.mode!==0) throw Error('Disable existing recording first; refusing to interrupt it');
  await save({game,mode:before.mode,endpoint});
  let attempted=false;
  let primaryError;
  try {
    await call('enable',{});
    attempted=true;
    await call('start',{game});
    await wait();
  } catch(error) { primaryError=error; }
  // Attempt both cleanup operations even if stopping fails. Keep the recovery
  // receipt on ANY failure, including an uncertain start acknowledgement.
  const cleanup=[];
  if (attempted) { try { await call('stop',{game}); } catch(error) { cleanup.push(error); } }
  try { await call('restore',before); } catch(error) { cleanup.push(error); }
  if (cleanup.length) throw new AggregateError([...(primaryError?[primaryError]:[]),...cleanup],'Cleanup incomplete; keep receipt and run recover');
  await remove();
  if (primaryError) throw primaryError;
}
async function main() {
  const [command,game,duration,receipt,endpoint='http://127.0.0.1:8080']=process.argv.slice(2);
  if(command==='record' && receipt) {
    const controller=new AbortController();
    const interrupt=()=>controller.abort();
    process.once('SIGINT',interrupt); process.once('SIGTERM',interrupt);
    try { await record({game,seconds:Number(duration),receipt,endpoint},{wait:()=>sleep(Number(duration)*1000,undefined,{signal:controller.signal})}); }
    finally { process.removeListener('SIGINT',interrupt); process.removeListener('SIGTERM',interrupt); }
  } else if(command==='recover' && game) {
    const state=JSON.parse(await readFile(game,'utf8'));
    validate(state.game,1);
    if(state.mode!==0) throw Error('Invalid recovery mode');
    const failures=[];
    try { await action('stop',{game:state.game},state.endpoint); } catch(error) { failures.push(error); }
    try { await action('restore',state,state.endpoint); } catch(error) { failures.push(error); }
    if(failures.length) throw new AggregateError(failures,'Recovery incomplete; receipt retained');
    await unlink(game);
  } else throw Error('Usage: node capture.mjs record GAME_ID SECONDS RECEIPT [LOOPBACK_URL] | recover RECEIPT');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error);process.exitCode=1;});
