import { randomBytes as cryptoRandomBytes } from "crypto";
import util from "util";

/** @ignore */
export function integerToOctetString(i: bigint, len: number): Uint8Array {
  const max = 256n ** BigInt(len);
  if (i >= max) {
    throw new Error(
      `Integer ${i} too large for ${len} byte array (max ${max}).`
    );
  }
  const octets = new Uint8Array(len);
  for (let index = octets.length - 1; index >= 0; index--) {
    octets[index] = Number(i % 256n);
    i /= 256n;
  }
  return octets;
}

/** @ignore */
export function octetStringToInteger(octetString: Uint8Array): bigint {
  return Buffer.from(octetString).reduceRight(
    (total, value, index) =>
      total + 256n ** BigInt(octetString.length - index - 1) * BigInt(value),
    0n
  );
}

/** @ignore */
export const VDAF_VERSION = "vdaf-00";

/** @ignore */
export function arr<T>(n: number, mapper: (n: number) => T): T[] {
  const a = new Array(n) as T[];
  for (let i = 0; i < n; i++) a[i] = mapper(i);
  return a;
}

/** @ignore */
export function nextPowerOf2(n: number): number {
  if (n > 0) {
    return 2 ** Math.ceil(Math.log2(n));
  } else {
    throw new Error("log of negative number");
  }
}

/** @ignore */
export function nextPowerOf2Big(n: bigint): bigint {
  if (n === 1n) {
    return 1n;
  } else if (n > 0n) {
    return 2n ** BigInt((n - 1n).toString(2).length);
  } else {
    throw new Error("log of negative number");
  }
}

/** @ignore */
export function randomBytes(n: number): Buffer {
  if (process.env.TEST_VECTOR) {
    return Buffer.alloc(n, 1);
  } else {
    return cryptoRandomBytes(n);
  }
}

/** @ignore */
export function dbg(o: unknown) {
  console.log(util.inspect(o, { depth: null }));
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  if (a.length !== b.length)
    throw new Error("could not zip two unequal arrays");
  return arr(a.length, (i) => [a[i], b[i]]);
}

export function xorWith(a: Buffer, b: Buffer) {
  if (a.length !== b.length)
    throw new Error("cannot xor two buffers of unequal length");
  const returnBuffer = Buffer.alloc(a.length);
  for (let i = 0; i < returnBuffer.length; i++) returnBuffer[i] = a[i] ^ b[i];
  return returnBuffer;
}

export function xorInPlace(
  bufferThatChanges: Buffer,
  bufferThatIsUnchanged: Buffer
) {
  if (bufferThatChanges.length !== bufferThatIsUnchanged.length)
    throw new Error("cannot xor two buffers of unequal length");

  for (let i = 0; i < bufferThatChanges.length; i++)
    bufferThatChanges[i] ^= bufferThatIsUnchanged[i];
}

export function split<T extends { slice(start: number, end?: number): T }>(
  sliceable: T,
  index: number
): [T, T] {
  return [sliceable.slice(0, index), sliceable.slice(index)];
}
