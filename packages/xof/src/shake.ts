import jsSHA from "jssha";
import type { XofConstructor } from "./xof.js";
import { Xof } from "./xof.js";

export const XofShake128: XofConstructor = class XofShake128 extends Xof {
  static seedSize = 16;
  #sha: jsSHA;
  #cacheSize = 512;
  #cache = new Uint8Array();
  #offset = 0;

  constructor(seed: Uint8Array, dst: Uint8Array, binder: Uint8Array) {
    super();
    if (seed.length !== XofShake128.seedSize) {
      throw new Error(
        `XofShake128 seed length must be exactly ${XofShake128.seedSize}`,
      );
    }
    if (dst.length > 255) {
      throw new Error("dst length must be one byte");
    }
    this.#sha = new jsSHA("SHAKE128", "UINT8ARRAY");
    this.#sha.update(Uint8Array.of(dst.length));
    this.#sha.update(dst);
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
