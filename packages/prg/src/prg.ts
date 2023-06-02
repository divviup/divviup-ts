import { Field } from "@divviup/field";
import { nextPowerOf2Big, octetStringToIntegerLE } from "@divviup/common";

export abstract class Prg {
  abstract next(_length: number): Promise<Uint8Array>;
  static deriveSeed(
    this: PrgConstructor,
    seed: Uint8Array,
    dst: Uint8Array,
    binder: Uint8Array
  ): Promise<Uint8Array> {
    return new this(seed, dst, binder).next(this.seedSize);
  }

  async nextVec(field: Field, length: number): Promise<bigint[]> {
    const m = nextPowerOf2Big(field.modulus) - 1n;
    const array = new Array<bigint>(length);

    for (let i = 0; i < length; i++)
      do
        array[i] =
          octetStringToIntegerLE(await this.next(field.encodedSize)) & m;
      while (array[i] >= field.modulus);

    return array;
  }

  static async expandIntoVec(
    this: PrgConstructor,
    field: Field,
    seed: Uint8Array,
    dst: Uint8Array,
    binder: Uint8Array,
    length: number
  ): Promise<bigint[]> {
    return new this(seed, dst, binder).nextVec(field, length);
  }
}

export interface PrgConstructor {
  seedSize: number;
  new (seed: Uint8Array, dst: Uint8Array, binder: Uint8Array): Prg;
  deriveSeed(
    seed: Uint8Array,
    dst: Uint8Array,
    binder: Uint8Array
  ): Promise<Uint8Array>;
  expandIntoVec(
    field: Field,
    seed: Uint8Array,
    dst: Uint8Array,
    binder: Uint8Array,
    length: number
  ): Promise<bigint[]>;
}
