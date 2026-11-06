# @lp-labs/message-envelope

Create and validate typed, versioned JSON message envelopes with correlation metadata. This is a
local data-format utility: it does not send messages, negotiate schemas, authenticate producers, or
provide transport security.

## Install and quick start

```sh
npm install @lp-labs/message-envelope
```

```js
import { createMessageEnvelope, parseMessageEnvelope } from '@lp-labs/message-envelope';

const envelope = createMessageEnvelope({
  id: 'evt-17',
  type: 'order.created',
  schema: { id: 'order-created', version: 2 },
  createdAt: 1_800_000_000_000,
  correlationId: 'request-4',
  metadata: { source: 'checkout' },
  payload: { orderId: 'o-17', total: 25.5 },
});
const restored = parseMessageEnvelope(JSON.stringify(envelope));
if (restored.payload.orderId !== 'o-17') throw new Error('Envelope did not round-trip');
```

## API and types

- `createMessageEnvelope(input, limits?)` validates fields and returns a detached envelope.
- `validateMessageEnvelope<T>(input, limits?)` validates an object and returns a detached envelope.
- `serializeMessageEnvelope(envelope, limits?)` validates before producing JSON text.
- `parseMessageEnvelope<T>(text, limits?)` parses and validates serialized input.
- Types: `JsonValue`, `EnvelopeSchema`, `MessageEnvelope<T>`, `CreateMessageEnvelope<T>`,
  `EnvelopeLimits`.

The envelope uses format `lp-message-envelope`, format version `1`, a non-empty `id` and `type`,
schema identifier and positive integer version, non-negative integer millisecond `createdAt`,
optional correlation/causation IDs, JSON metadata, and a JSON payload. Application schema validation
belongs to the producer or consumer; the schema identifier is descriptive metadata.

## Limits, errors, and customization

Default limits are 1 MiB serialized UTF-8, depth 64, and 100,000 JSON nodes. Customize `maxBytes`,
`maxDepth`, or `maxNodes` per operation; byte/node limits must be positive safe integers and depth
may be zero. Unknown envelope fields, malformed JSON, cycles, accessors, symbols, undefined values,
non-finite numbers, and non-plain objects are rejected with `TypeError`; exceeded bounds throw
`RangeError`. The package does not enforce uniqueness, ordering, delivery, compatibility, or
confidentiality. Do not treat metadata or IDs as trusted authorization data.

ESM, CommonJS, and TypeScript declarations are included. There are no runtime or peer dependencies;
TypeScript and Prettier are development-only.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
