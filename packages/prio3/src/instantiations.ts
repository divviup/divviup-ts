import { XofShake128 } from "@divviup/xof";
import { Prio3 } from "./index.js";
import { FlpGeneric } from "./genericFlp.js";
import { Count } from "./circuits/count.js";
import { Histogram } from "./circuits/histogram.js";
import { Sum } from "./circuits/sum.js";

export class Prio3Count extends Prio3<boolean, number> {
  constructor({ shares }: { shares: number }) {
    super(XofShake128, new FlpGeneric(new Count()), shares, 0);
  }
}

export class Prio3Sum extends Prio3<number | bigint, number | bigint> {
  public readonly bits: number;
  constructor({ shares, bits }: { shares: number; bits: number }) {
    super(XofShake128, new FlpGeneric(new Sum(bits)), shares, 1);
    this.bits = bits;
  }
}

export class Prio3Histogram extends Prio3<number, number[]> {
  public readonly buckets: number[];
  constructor({ shares, buckets }: { shares: number; buckets: number[] }) {
    super(XofShake128, new FlpGeneric(new Histogram(buckets)), shares, 2);
    this.buckets = buckets;
  }
}
