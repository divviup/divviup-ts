import { PrgAes128 } from "@divviup/prg";
import { Prio3 } from ".";
import { FlpGeneric } from "./genericFlp";
import { Count } from "./circuits/count";
import { Histogram } from "./circuits/histogram";
import { Sum } from "./circuits/sum";

export class Prio3Aes128Count extends Prio3<boolean> {
  constructor({ shares }: { shares: number }) {
    super(PrgAes128, new FlpGeneric(new Count()), shares, 0x00000000);
  }
}

export class Prio3Aes128Histogram extends Prio3<number> {
  constructor({ shares, buckets }: { shares: number; buckets: number[] }) {
    super(
      PrgAes128,
      new FlpGeneric(new Histogram(buckets)),
      shares,
      0x00000002
    );
  }
}

export class Prio3Aes128Sum extends Prio3<number | bigint> {
  constructor({ shares, bits }: { shares: number; bits: number }) {
    super(PrgAes128, new FlpGeneric(new Sum(bits)), shares, 0x00000001);
  }
}
