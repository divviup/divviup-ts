import { XofTurboShake128 } from "@divviup/xof";
import { Prio3 } from "./index.js";
import { FlpGeneric } from "./genericFlp.js";
import { Count } from "./circuits/count.js";
import { Histogram } from "./circuits/histogram.js";
import { Sum } from "./circuits/sum.js";
import { SumVec } from "./circuits/sumVec.js";
import { Field128, Field64 } from "@divviup/field";

export class Prio3Count extends Prio3<boolean, number> {
  constructor({ shares }: { shares: number }) {
    super(
      XofTurboShake128,
      new FlpGeneric(new Count(new Field64())),
      shares,
      1,
      0,
    );
  }
}

export class Prio3Sum extends Prio3<number | bigint, number | bigint> {
  public readonly bits: number;
  constructor({ shares, bits }: { shares: number; bits: number }) {
    super(
      XofTurboShake128,
      new FlpGeneric(new Sum(new Field128(), bits)),
      shares,
      1,
      1,
    );
    this.bits = bits;
  }
}

interface HistogramArgs {
  shares: number;
  length: number;
  chunkLength: number;
}
export class Prio3Histogram extends Prio3<number, number[]> {
  public readonly chunkLength: number;
  public readonly length: number;
  constructor({ shares, length, chunkLength }: HistogramArgs) {
    super(
      XofTurboShake128,
      new FlpGeneric(new Histogram(new Field128(), length, chunkLength)),
      shares,
      1,
      3,
    );
    this.chunkLength = chunkLength;
    this.length = length;
  }
}

interface SumVecArgs {
  shares: number;
  length: number;
  chunkLength: number;
  bits: number;
}

export class Prio3SumVec extends Prio3<number[], number[]> {
  public readonly chunkLength: number;
  public readonly length: number;
  public readonly bits: number;
  constructor({ shares, length, chunkLength, bits }: SumVecArgs) {
    super(
      XofTurboShake128,
      new FlpGeneric(new SumVec(new Field128(), length, bits, chunkLength)),
      shares,
      1,
      2,
    );
    this.chunkLength = chunkLength;
    this.length = length;
    this.bits = bits;
  }
}
