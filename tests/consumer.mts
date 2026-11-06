import {
  createMessageEnvelope,
  type MessageEnvelope,
  type JsonValue,
} from '@lp-labs/message-envelope';

const payload: JsonValue = { orderId: 'o-1' };
const envelope: MessageEnvelope<JsonValue> = createMessageEnvelope({
  id: 'e-1',
  type: 'order.created',
  schema: { id: 'order', version: 1 },
  createdAt: 0,
  payload,
});
void envelope;
