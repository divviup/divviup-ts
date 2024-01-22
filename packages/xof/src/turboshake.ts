import { turboshake128 } from "@noble/hashes/sha3-addons";
import type { XofConstructor } from "./xof.js";
import { Xof } from "./xof.js";
import type { HashXOF } from "@noble/hashes/utils";
import type { Keccak } from "@noble/hashes/sha3";

export const XofTurboShake128: XofConstructor = class XofTurboShake128 extends Xof {
  static seedSize = 16;
  #hash: HashXOF<HashXOF<Keccak>>;

  constructor(seed: Uint8Array, dst: Uint8Array, binder: Uint8Array) {
    super();
    if (seed.length !== XofTurboShake128.seedSize) {
      throw new Error(
        `XofTurboShake128 seed length must be exactly ${XofTurboShake128.seedSize}`,
      );
    }
    if (dst.length > 255) {
      throw new Error("dst length must be one byte");
    }
    this.#hash = turboshake128
      .create({ D: 1 })
      .update(Uint8Array.of(dst.length))
      .update(dst)
      .update(seed)
      .update(binder);
  }

  next(length: number): Promise<Uint8Array> {
    return Promise.resolve(this.#hash.xof(length));
  }
};
