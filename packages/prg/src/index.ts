import { AesCmac } from "aes-cmac";
import { Field } from "@divviup/field";
import { nextPowerOf2Big, randomBytes } from "@divviup/common";
import { octetStringToInteger } from "@divviup/common";
import { webcrypto } from "one-webcrypto";

const SEED_SIZE = 16;

export abstract class Prg {
  abstract next(_length: number): Promise<Uint8Array>;
  static deriveSeed(
    this: PrgConstructor,
    seed: Uint8Array,
    info: Uint8Array
  ): Promise<Uint8Array> {
    return new this(seed, info).next(this.seedSize);
  }

  static randomSeed(this: PrgConstructor): Uint8Array {
    return randomBytes(this.seedSize);
  }

  static async expandIntoVec(
    this: PrgConstructor,
    field: Field,
    seed: Uint8Array,
    info: Uint8Array,
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
    return vec;
  }
}

export interface PrgConstructor {
  seedSize: number;
  new (seed: Uint8Array, info: Uint8Array): Prg;
  deriveSeed(seed: Uint8Array, info: Uint8Array): Promise<Uint8Array>;
  randomSeed(): Uint8Array;
  expandIntoVec(
    field: Field,
    seed: Uint8Array,
    info: Uint8Array,
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
     @param {Uint8Array} seed - Exactly 16 cryptographically random bytes
     @throws This will throw an Error at runtime if the provided seed is not exactly 16 bytes.
   */
  constructor(seed: Uint8Array, info: Uint8Array) {
    super();

    if (seed.length != SEED_SIZE) {
      throw new Error("PrgAes128 seed length must be exactly 16");
    }

    this.#lengthConsumed = 0;
    this.#cryptoKey = new AesCmac(seed)
      .calculate(info)
      .then((key) =>
        webcrypto.subtle.importKey("raw", key, "AES-CTR", false, ["encrypt"])
      );
  }

  /** returns the subsequent `length` bytes */
  async next(length: number): Promise<Uint8Array> {
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
    const counter = new Uint8Array(16);
    new DataView(counter.buffer).setUint32(12, block, false);

    const encryptedData = await webcrypto.subtle.encrypt(
      {
        name: "AES-CTR",
        length: 128,
        counter,
      },
      this.#cryptoKey,
      new Uint8Array(offset + length)
    );

    this.#lengthConsumed += length;
    return new Uint8Array(encryptedData.slice(-length));
  }
};
