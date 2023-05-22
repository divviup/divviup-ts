import { PrgSha3 } from "@divviup/prg";
import { Prio3 } from ".";
import { FlpGeneric } from "./genericFlp";
import { Count } from "./circuits/count";
import { Histogram } from "./circuits/histogram";
import { Sum } from "./circuits/sum";

export class Prio3Count extends Prio3<boolean, number> {
  constructor({ shares }: { shares: number }) {
    super(PrgSha3, new FlpGeneric(new Count()), shares, 0);
  }
}

export class Prio3Sum extends Prio3<number | bigint, number | bigint> {
  public readonly bits: number;
  constructor({ shares, bits }: { shares: number; bits: number }) {
    super(PrgSha3, new FlpGeneric(new Sum(bits)), shares, 1);
    this.bits = bits;
  }
}

export class Prio3Histogram extends Prio3<number, number[]> {
  public readonly buckets: number[];
  constructor({ shares, buckets }: { shares: number; buckets: number[] }) {
    super(PrgSha3, new FlpGeneric(new Histogram(buckets)), shares, 2);
    this.buckets = buckets;
  }
}
