export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface EnvelopeSchema {
  readonly id: string;
  readonly version: number;
}

export interface MessageEnvelope<T extends JsonValue = JsonValue> {
  readonly format: 'lp-message-envelope';
  readonly version: 1;
  readonly id: string;
  readonly type: string;
  readonly schema: EnvelopeSchema;
  readonly createdAt: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly payload: T;
}

export interface CreateMessageEnvelope<T extends JsonValue> {
  readonly id: string;
  readonly type: string;
  readonly schema: EnvelopeSchema;
  readonly createdAt: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  readonly payload: T;
}

export interface EnvelopeLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

const FORMAT = 'lp-message-envelope';
const VERSION = 1;
const DEFAULT_LIMITS = { maxBytes: 1_048_576, maxDepth: 64, maxNodes: 100_000 };
const ENVELOPE_KEYS = new Set([
  'format',
  'version',
  'id',
  'type',
  'schema',
  'createdAt',
  'correlationId',
  'causationId',
  'metadata',
  'payload',
]);

function limitsOf(input: EnvelopeLimits = {}) {
  const limits = {
    maxBytes: input.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    maxDepth: input.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxNodes: input.maxNodes ?? DEFAULT_LIMITS.maxNodes,
  };
  if (
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 1 ||
    !Number.isSafeInteger(limits.maxDepth) ||
    limits.maxDepth < 0 ||
    !Number.isSafeInteger(limits.maxNodes) ||
    limits.maxNodes < 1
  ) {
    throw new RangeError('Envelope limits must be positive safe integers (depth may be zero).');
  }
  return limits;
}

function boundedText(value: unknown, name: string, maximum = 256): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new TypeError(`${name} must be a non-empty string of at most ${maximum} characters.`);
  }
}

function assertDataRecord(
  value: unknown,
  name: string,
  allowed: ReadonlySet<string>,
  required: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${name} contains unknown fields.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${name} must contain enumerable data fields.`);
    }
  }
  if (required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${name} is missing required fields.`);
  }
}

function copyJson<T>(input: T, maxDepth: number, maxNodes: number): T {
  let count = 0;
  const active = new Set<object>();
  const visit = (value: unknown, depth: number): JsonValue => {
    if (++count > maxNodes) throw new RangeError('Envelope exceeds the configured node limit.');
    if (depth > maxDepth) throw new RangeError('Envelope exceeds the configured depth limit.');
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      if (active.has(value)) throw new TypeError('Envelope JSON cannot contain cycles.');
      active.add(value);
      const result = Array.from(value, (entry) => visit(entry, depth + 1));
      active.delete(value);
      return result;
    }
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError('Envelope values must contain only finite JSON and plain objects.');
    }
    if (active.has(value)) throw new TypeError('Envelope JSON cannot contain cycles.');
    active.add(value);
    const result: Record<string, JsonValue> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('Envelope JSON cannot contain symbol keys.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
        throw new TypeError('Envelope objects must contain enumerable JSON data properties.');
      }
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    active.delete(value);
    return result;
  };
  return visit(input, 0) as T;
}

function validateInput(input: unknown): asserts input is Record<string, unknown> {
  assertDataRecord(input, 'Envelope', ENVELOPE_KEYS, [
    'format',
    'version',
    'id',
    'type',
    'schema',
    'createdAt',
    'metadata',
    'payload',
  ]);
}

function validateSchema(input: unknown): asserts input is EnvelopeSchema {
  assertDataRecord(input, 'Envelope schema', new Set(['id', 'version']), ['id', 'version']);
  const schema = input;
  boundedText(schema.id, 'schema.id');
  if (!Number.isSafeInteger(schema.version) || (schema.version as number) < 1) {
    throw new RangeError('schema.version must be a positive safe integer.');
  }
}

function buildEnvelope<T extends JsonValue>(
  input: CreateMessageEnvelope<T>,
  limits: EnvelopeLimits,
): MessageEnvelope<T> {
  boundedText(input.id, 'id');
  boundedText(input.type, 'type');
  validateSchema(input.schema);
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new RangeError('createdAt must be a non-negative safe integer timestamp.');
  }
  if (input.correlationId !== undefined) boundedText(input.correlationId, 'correlationId');
  if (input.causationId !== undefined) boundedText(input.causationId, 'causationId');
  const safeLimits = limitsOf(limits);
  const result: MessageEnvelope<T> = {
    format: FORMAT,
    version: VERSION,
    id: input.id,
    type: input.type,
    schema: copyJson(input.schema, safeLimits.maxDepth, safeLimits.maxNodes),
    createdAt: input.createdAt,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    metadata: copyJson(input.metadata ?? {}, safeLimits.maxDepth, safeLimits.maxNodes),
    payload: copyJson(input.payload, safeLimits.maxDepth, safeLimits.maxNodes),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > safeLimits.maxBytes) {
    throw new RangeError('Envelope exceeds the configured byte limit.');
  }
  return result;
}

export function createMessageEnvelope<T extends JsonValue>(
  input: CreateMessageEnvelope<T>,
  limits: EnvelopeLimits = {},
): MessageEnvelope<T> {
  assertDataRecord(
    input,
    'Envelope input',
    new Set([
      'id',
      'type',
      'schema',
      'createdAt',
      'correlationId',
      'causationId',
      'metadata',
      'payload',
    ]),
    ['id', 'type', 'schema', 'createdAt', 'payload'],
  );
  return buildEnvelope(input, limits);
}

export function validateMessageEnvelope<T extends JsonValue = JsonValue>(
  input: unknown,
  limits: EnvelopeLimits = {},
): MessageEnvelope<T> {
  validateInput(input);
  if (input.format !== FORMAT || input.version !== VERSION) {
    throw new TypeError('Unsupported envelope format or version.');
  }
  if (!Object.hasOwn(input, 'payload') || !Object.hasOwn(input, 'metadata')) {
    throw new TypeError('Envelope payload and metadata are required.');
  }
  if (
    input.metadata === null ||
    typeof input.metadata !== 'object' ||
    Array.isArray(input.metadata) ||
    Object.getPrototypeOf(input.metadata) !== Object.prototype
  ) {
    throw new TypeError('Envelope metadata must be a plain object.');
  }
  return buildEnvelope(
    {
      id: input.id as string,
      type: input.type as string,
      schema: input.schema as EnvelopeSchema,
      createdAt: input.createdAt as number,
      ...(input.correlationId === undefined
        ? {}
        : { correlationId: input.correlationId as string }),
      ...(input.causationId === undefined ? {} : { causationId: input.causationId as string }),
      metadata: input.metadata as Record<string, JsonValue>,
      payload: input.payload as T,
    },
    limits,
  );
}

export function serializeMessageEnvelope<T extends JsonValue>(
  envelope: MessageEnvelope<T>,
  limits: EnvelopeLimits = {},
): string {
  return JSON.stringify(validateMessageEnvelope<T>(envelope, limits));
}

export function parseMessageEnvelope<T extends JsonValue = JsonValue>(
  text: string,
  limits: EnvelopeLimits = {},
): MessageEnvelope<T> {
  const maximum = limitsOf(limits).maxBytes;
  if (typeof text !== 'string') throw new TypeError('Serialized envelope must be a string.');
  if (new TextEncoder().encode(text).byteLength > maximum) {
    throw new RangeError('Envelope exceeds the configured byte limit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('Serialized envelope is not valid JSON.');
  }
  return validateMessageEnvelope<T>(parsed, limits);
}
