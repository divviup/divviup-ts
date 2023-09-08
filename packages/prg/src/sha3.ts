import jsSHA from "jssha";
import { PrgConstructor, Prg } from "./prg.js";

export const PrgSha3: PrgConstructor = class PrgSha3 extends Prg {
  static seedSize = 16;
  #sha: jsSHA;
  #cacheSize = 512;
  #cache = new Uint8Array();
  #offset = 0;
  constructor(seed: Uint8Array, dst: Uint8Array, binder: Uint8Array) {
    super();
    if (seed.length !== PrgSha3.seedSize) {
      throw new Error(
        `PrgSha3 seed length must be exactly ${PrgSha3.seedSize}`,
      );
    }
    this.#sha = new jsSHA("CSHAKE128", "UINT8ARRAY", {
      customization: { value: dst, format: "UINT8ARRAY" },
    });

    this.#sha.update(seed);
    this.#sha.update(binder);
  }

  next(length: number): Promise<Uint8Array> {
    if (this.#offset + length > this.#cache.length) {
      this.#cache = this.#sha.getHash("UINT8ARRAY", {
        outputLen: (this.#cache.length + Math.max(this.#cacheSize, length)) * 8,
      });
      this.#cacheSize *= 2;
    }
    const hash = this.#cache.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return Promise.resolve(hash);
  }
};
