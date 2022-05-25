import { AesCmac } from "aes-cmac";
import { Field } from "field";
import { nextPowerOf2Big, randomBytes } from "common";
import { octetStringToInteger } from "common";
import * as crypto from "crypto";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const webcrypto = crypto.webcrypto as unknown as { subtle: SubtleCrypto };
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const subtle = webcrypto.subtle;

const SEED_SIZE = 16;

export abstract class Prg {
  abstract next(_length: number): Promise<Buffer>;
  static deriveSeed(
    this: PrgConstructor,
    seed: Buffer,
    info: Buffer
  ): Promise<Buffer> {
    return new this(seed, info).next(this.seedSize);
  }

  static randomSeed(this: PrgConstructor): Buffer {
    return randomBytes(this.seedSize);
  }

  static async expandIntoVec(
    this: PrgConstructor,
    field: Field,
    seed: Buffer,
    info: Buffer,
    length: number
  ): Promise<bigint[]> {
    const m = nextPowerOf2Big(field.modulus) - 1n;
    const prg = new this(seed, info);
    const vec = [];
    while (vec.length < length) {
      const x = octetStringToInteger(await prg.next(field.encodedSize)) & m;
      if (x < field.modulus) {
        vec.push(x);
      }
    }
    return field.vec(vec);
  }
}

export interface PrgConstructor {
  seedSize: number;
  new (seed: Buffer, info: Buffer): Prg;
  deriveSeed(seed: Buffer, info: Buffer): Promise<Buffer>;
  randomSeed(): Buffer;
  expandIntoVec(
    field: Field,
    seed: Buffer,
    info: Buffer,
    length: number
  ): Promise<bigint[]>;
}

/**
 * Pseudorandom number generator for prio
 *
 * Starting with a cryptographically random seed, this produces a
 * predictable and reproducable sequence of bytes
 */
export const PrgAes128: PrgConstructor = class PrgAes128 extends Prg {
  static seedSize = 16;
  #lengthConsumed: number;
  #cryptoKey: CryptoKey | PromiseLike<CryptoKey>;

  /**
     @param {Buffer} seed - Exactly 16 cryptographically random bytes
     @throws This will throw an Error at runtime if the provided seed is not exactly 16 bytes.
   */
  constructor(seed: Buffer, info: Buffer) {
    super();

    if (seed.length != SEED_SIZE) {
      throw new Error("PrgAes128 seed length must be exactly 16");
    }

    this.#lengthConsumed = 0;
    const hasher = new AesCmac(seed);
    const key = hasher.calculate(info);
    this.#cryptoKey = subtle.importKey("raw", key, "AES-CTR", false, [
      "encrypt",
    ]);
  }

  /** returns the subsequent `length` bytes */
  async next(length: number): Promise<Buffer> {
    const block = Math.floor(this.#lengthConsumed / 16);
    const offset = this.#lengthConsumed % 16;

    // constructors are necessarily not async, so we kick off the key
    // import promise in the constructor and wait for it to finish on
    // the first call to next
    if ("then" in this.#cryptoKey) {
      this.#cryptoKey = await this.#cryptoKey;
    }

    // using a nonzero counter and starting at `offset` allows us to
    // avoid reencrypting `this.lengthConsumed` bytes every time we
    // call next, which would get progressively slower as we read more
    // data.
    const counter = new ArrayBuffer(16);
    new DataView(counter).setUint32(12, block, false);

    const encryptedData = (await subtle.encrypt(
      {
        name: "AES-CTR",
        length: 128,
        counter,
      },
      this.#cryptoKey,
      new Uint8Array(offset + length)
    )) as ArrayBuffer;

    this.#lengthConsumed += length;
    return Buffer.from(encryptedData.slice(-length));
  }
};
