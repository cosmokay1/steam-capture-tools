import test from 'node:test';
import assert from 'node:assert/strict';
import {record,validate} from './capture.mjs';
import {evaluate} from './cdp.mjs';
function harness(fail=[],mode=0) {
  const events=[];
  return {events,deps:{call:async(command)=>{events.push(command);if(fail.includes(command))throw Error(command);return {mode};},save:async()=>events.push('save'),remove:async()=>events.push('remove'),wait:async()=>events.push('wait')}};
}
const args={game:'1234567890123',seconds:20,receipt:'unused'};
test('bounded successful capture restores settings and deletes recovery receipt',async()=>{
 const h=harness();await record(args,h.deps);assert.deepEqual(h.events,['inspect','save','enable','start','wait','stop','restore','remove']);
});
test('failed start still stops possible recording and restores settings',async()=>{
 const h=harness(['start']);await assert.rejects(record(args,h.deps));assert.deepEqual(h.events,['inspect','save','enable','start','stop','restore','remove']);
});
test('stop failure does not skip restoration and retains recovery receipt',async()=>{
 const h=harness(['stop']);await assert.rejects(record(args,h.deps),AggregateError);assert(h.events.includes('restore'));assert(!h.events.includes('remove'));
});
test('restoration failure retains recovery receipt',async()=>{
 const h=harness(['restore']);await assert.rejects(record(args,h.deps),AggregateError);assert(!h.events.includes('remove'));
});
test('enable failure still attempts settings restoration',async()=>{
 const h=harness(['enable']);await assert.rejects(record(args,h.deps));assert(h.events.includes('restore'));assert(!h.events.includes('start'));
});
test('existing recording configuration is untouched',async()=>{
 const h=harness([],1);await assert.rejects(record(args,h.deps));assert.deepEqual(h.events,['inspect']);
});
test('receipt collision prevents mutation',async()=>{
 const h=harness();h.deps.save=async()=>{throw Error('EEXIST');};await assert.rejects(record(args,h.deps));assert.deepEqual(h.events,['inspect']);
});
test('interrupted recording still stops and restores',async()=>{
 const h=harness();h.deps.wait=async()=>{throw Error('abort');};await assert.rejects(record(args,h.deps));assert(h.events.includes('stop'));assert(h.events.includes('restore'));
});
test('reject invalid IDs, unbounded durations and remote endpoints',async()=>{
 for(const n of [0,121,1.5,NaN])assert.throws(()=>validate('123',n));assert.throws(()=>validate('abc',10));
 await assert.rejects(evaluate('1','http://example.com:8080'),/loopback/);
});
