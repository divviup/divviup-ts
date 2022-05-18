import { PrgAes128 } from "prng";
import { Prio3 } from "prio3";
import { FlpGeneric } from "prio3/genericFlp";
import { Count } from "prio3/circuits/count";
import { Histogram } from "prio3/circuits/histogram";
import { Sum } from "prio3/circuits/sum";

export class Prio3Aes128Count extends Prio3<boolean> {
  constructor({ shares }: { shares: number }) {
    super(PrgAes128, new FlpGeneric(new Count()), shares);
  }
}

export class Prio3Aes128Histogram extends Prio3<number> {
  constructor({ shares, buckets }: { shares: number; buckets: number[] }) {
    super(PrgAes128, new FlpGeneric(new Histogram(buckets)), shares);
  }
}

export class Prio3Aes128Sum extends Prio3<number> {
  constructor({ shares, bits }: { shares: number; bits: number }) {
    super(PrgAes128, new FlpGeneric(new Sum(bits)), shares);
  }
}
