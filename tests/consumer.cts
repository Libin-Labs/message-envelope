import { createMessageEnvelope, type EnvelopeLimits } from '@lp-labs/message-envelope';

const limits: EnvelopeLimits = { maxBytes: 1024 };
const envelope = createMessageEnvelope(
  {
    id: 'c-1',
    type: 'test',
    schema: { id: 'test', version: 1 },
    createdAt: 0,
    payload: { ok: true },
  },
  limits,
);
void envelope;
