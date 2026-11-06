import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  createMessageEnvelope,
  parseMessageEnvelope,
  serializeMessageEnvelope,
  validateMessageEnvelope,
} from '../dist/esm/index.js';

test('creates detached typed metadata and round-trips through JSON', () => {
  const payload = { amount: 4, fields: ['a'] };
  const envelope = createMessageEnvelope({
    id: 'e1',
    type: 'invoice.created',
    schema: { id: 'invoice', version: 1 },
    createdAt: 10,
    correlationId: 'c1',
    metadata: { tenant: 'demo' },
    payload,
  });
  payload.fields.push('b');
  assert.deepEqual(envelope.payload, { amount: 4, fields: ['a'] });
  assert.deepEqual(parseMessageEnvelope(serializeMessageEnvelope(envelope)), envelope);
});

test('rejects malformed envelope shapes, unsupported versions, and missing fields', () => {
  const valid = createMessageEnvelope({
    id: 'x',
    type: 'x',
    schema: { id: 'x', version: 1 },
    createdAt: 0,
    payload: null,
  });
  for (const input of [
    null,
    [],
    { ...valid, extra: true },
    { ...valid, version: 2 },
    { ...valid, payload: undefined },
    { ...valid, metadata: [] },
    { ...valid, schema: { id: 'x', version: 0 } },
    { ...valid, createdAt: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(() => validateMessageEnvelope(input));
  }
  assert.throws(() => parseMessageEnvelope('{"format":'));
});

test('rejects non-finite, undefined, cyclic, accessor, and class payloads', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 });
  const envelopeAccessor = Object.defineProperty(
    {
      type: 'x',
      schema: { id: 'x', version: 1 },
      createdAt: 0,
      payload: null,
    },
    'id',
    { enumerable: true, get: () => 'x' },
  );
  for (const payload of [Infinity, { value: undefined }, cyclic, accessor, new Date()]) {
    assert.throws(() =>
      createMessageEnvelope({
        id: 'x',
        type: 'x',
        schema: { id: 'x', version: 1 },
        createdAt: 0,
        payload,
      }),
    );
  }
});

test('enforces bounded metadata, payload size, identifiers, and timestamps', () => {
  const base = { type: 'x', schema: { id: 'x', version: 1 }, createdAt: 0, payload: null };
  for (const id of ['', 'x'.repeat(257)])
    assert.throws(() => createMessageEnvelope({ ...base, id }));
  for (const createdAt of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createMessageEnvelope({ ...base, id: 'x', createdAt }));
  }
  assert.throws(() => createMessageEnvelope(envelopeAccessor));
  assert.throws(() => createMessageEnvelope({ ...base, id: 'x' }, { maxBytes: 16 }), /byte limit/);
  assert.throws(
    () => createMessageEnvelope({ ...base, id: 'x', payload: { nested: true } }, { maxDepth: 0 }),
    /depth limit/,
  );
  assert.throws(() => parseMessageEnvelope('{}', { maxBytes: 1 }), /byte limit/);
});

test('CommonJS exposes the same runtime API', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), [
    'createMessageEnvelope',
    'parseMessageEnvelope',
    'serializeMessageEnvelope',
    'validateMessageEnvelope',
  ]);
});
