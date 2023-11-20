import { arr, randomBytes } from "@divviup/common";
import { Buffer } from "buffer";

/** @internal */
export const VDAF_VERSION_NUMBER = 7;
export const VDAF_VERSION = "vdaf-07";

export abstract class Vdaf<
  Measurement,
  AggregationParameter,
  PublicShare,
  InputShare,
  OutputShare,
  AggregatorShare,
  AggregateResult,
  PreparationState,
  PreparationShare,
  PreparationMessage,
> {
  abstract id: number;
  abstract shares: number;
  abstract rounds: number;
  abstract verifyKeySize: number;
  abstract nonceSize: number;
  abstract randSize: number;

  abstract shard(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer,
  ): Promise<{ publicShare: PublicShare; inputShares: InputShare[] }>;

  async shardEncoded(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer,
  ): Promise<{ publicShare: Buffer; inputShares: Buffer[] }> {
    const { inputShares, publicShare } = await this.shard(
      measurement,
      nonce,
      rand,
    );
    return {
      publicShare: this.encodePublicShare(publicShare),
      inputShares: inputShares.map((inputShare) =>
        this.encodeInputShare(inputShare),
      ),
    };
  }

  abstract isValid(
    aggregationParameter: AggregationParameter,
    previousAggregationParameters: AggregationParameter[],
  ): boolean;

  abstract prepareInit(
    verifyKey: Buffer,
    aggregatorId: number,
    aggregationParameter: AggregationParameter,
    nonce: Buffer,
    publicShare: PublicShare,
    inputShare: InputShare,
  ): Promise<{
    preparationState: PreparationState;
    preparationShare: PreparationShare;
  }>;

  abstract prepareNext(
    preparationState: PreparationState,
    preparationMessage: PreparationMessage,
  ):
    | { preparationState: PreparationState; preparationShare: PreparationShare }
    | { outputShare: OutputShare };

  abstract unshardPreparationShares(
    aggregationParameter: AggregationParameter,
    preparationShares: PreparationShare[],
  ): Promise<PreparationMessage>;

  abstract aggregate(
    aggregationParameter: AggregationParameter,
    outputShares: OutputShare[],
  ): AggregatorShare;

  abstract unshard(
    aggregationParameter: AggregationParameter,
    aggregatorShares: AggregatorShare[],
    measurementCount: number,
  ): AggregateResult;

  domainSeparationTag(usage: number): Buffer {
    return formatDomainSeparationTag(0, this.id, usage);
  }

  run({
    aggregationParameter,
    verifyKey,
    nonces,
    measurements,
    rands,
  }: {
    aggregationParameter: AggregationParameter;
    measurements: Measurement[];
    verifyKey?: Buffer;
    nonces?: Buffer[];
    rands?: Buffer[];
  }): Promise<TestVector<AggregationParameter, Measurement, AggregateResult>> {
    return runVdaf({
      vdaf: this,
      verifyKey,
      aggregationParameter,
      nonces,
      measurements,
      rands,
    });
  }

  abstract encodeInputShare(inputShare: InputShare): Buffer;
  abstract encodePublicShare(publicShare: PublicShare): Buffer;
  abstract encodeAggregatorShare(aggregatorShare: AggregatorShare): Buffer;
  abstract encodeAggregationParameter(
    aggregationParameter: AggregationParameter,
  ): Buffer;
  abstract encodePreparationShare(preparationShare: PreparationShare): Buffer;
  abstract encodePreparationMessage(
    preparationMessage: PreparationMessage,
  ): Buffer;
  async test(
    aggregationParameter: AggregationParameter,
    measurements: Measurement[],
  ): Promise<AggregateResult> {
    return (await this.run({ aggregationParameter, measurements })).agg_result;
  }

  encodeTestVectorInputShare(inputShare: InputShare): string {
    return this.encodeInputShare(inputShare).toString("hex");
  }
  encodeTestVectorPublicShare(publicShare: PublicShare): string {
    return this.encodePublicShare(publicShare).toString("hex");
  }
  encodeTestVectorAggregatorShare(aggregatorShare: AggregatorShare): string {
    return this.encodeAggregatorShare(aggregatorShare).toString("hex");
  }
  encodeTestVectorPreparationShare(preparationShare: PreparationShare): string {
    return this.encodePreparationShare(preparationShare).toString("hex");
  }
  encodeTestVectorPreparationMessage(
    preparationMessage: PreparationMessage,
  ): string {
    return this.encodePreparationMessage(preparationMessage).toString("hex");
  }
  encodeTestVectorOutputShare(outputShare: OutputShare): string[] {
    outputShare;
    return [];
  }
}

export interface ClientVdaf<Measurement> {
  shares: number;
  rounds: number;
  randSize: number;
  nonceSize: number;

  shardEncoded(
    measurement: Measurement,
    nonce: Buffer,
    rand: Buffer,
  ): Promise<{
    publicShare: Buffer;
    inputShares: Buffer[];
  }>;
}

interface RunVdafArguments<M, AP, PuSh, IS, OS, AS, AR, PrSt, PrSh, PM> {
  vdaf: Vdaf<M, AP, PuSh, IS, OS, AS, AR, PrSt, PrSh, PM>;
  aggregationParameter: AP;
  measurements: M[];
  verifyKey?: Buffer;
  nonces?: Buffer[];
  rands?: Buffer[];
}

export async function runVdaf<M, AP, PuSh, IS, OS, AS, AR, PrSt, PrSh, PM>(
  args: RunVdafArguments<M, AP, PuSh, IS, OS, AS, AR, PrSt, PrSh, PM>,
): Promise<TestVector<AP, M, AR>> {
  const { vdaf, aggregationParameter, measurements } = args;
  const { verifyKeySize, randSize, nonceSize, rounds, shares } = vdaf;

  const verifyKey = args.verifyKey ?? Buffer.from(randomBytes(verifyKeySize));

  const testVector: Omit<TestVector<AP, M, AR>, "agg_result"> = {
    agg_param: aggregationParameter,
    agg_shares: [],
    prep: [],
    verify_key: verifyKey.toString("hex"),
    shares,
  };

  const outShares = await Promise.all(
    measurements.map(async (measurement, i) => {
      const nonce = args.nonces?.[i] ?? Buffer.from(randomBytes(nonceSize));
      const rand = args.rands?.[i] ?? Buffer.from(randomBytes(randSize));
      const { publicShare, inputShares } = await vdaf.shard(
        measurement,
        nonce,
        rand,
      );

      const prepTestVector: PrepTestVector<M> = {
        input_shares: inputShares.map((inputShare) =>
          vdaf.encodeTestVectorInputShare(inputShare),
        ),
        measurement,
        nonce: nonce.toString("hex"),
        out_shares: [],
        prep_messages: [],
        prep_shares: arr(rounds, () => []),
        public_share: vdaf.encodeTestVectorPublicShare(publicShare),
        rand: rand.toString("hex"),
      };

      let prepare = await Promise.all(
        inputShares.map((inputShare, aggregatorId) =>
          vdaf.prepareInit(
            verifyKey,
            aggregatorId,
            aggregationParameter,
            nonce,
            publicShare,
            inputShare,
          ),
        ),
      );

      prepTestVector.prep_shares[0] = prepare.map(({ preparationShare }) =>
        vdaf.encodeTestVectorPreparationShare(preparationShare),
      );

      for (let round = 0; round < rounds - 1; round++) {
        const preparationMessage = await vdaf.unshardPreparationShares(
          aggregationParameter,
          prepare.map(({ preparationShare }) => preparationShare),
        );
        prepTestVector.prep_messages.push(
          vdaf.encodeTestVectorPreparationMessage(preparationMessage),
        );
        prepare = prepare.map(({ preparationState }) => {
          const out = vdaf.prepareNext(preparationState, preparationMessage);
          if ("outputShare" in out) {
            throw new Error("expected preparationState and preparationShare");
          }
          return out;
        });

        prepTestVector.prep_shares[round] = prepare.map(
          ({ preparationShare }) =>
            vdaf.encodeTestVectorPreparationShare(preparationShare),
        );
      }

      const preparationMessage = await vdaf.unshardPreparationShares(
        aggregationParameter,
        prepare.map(({ preparationShare }) => preparationShare),
      );
      prepTestVector.prep_messages.push(
        vdaf.encodeTestVectorPreparationMessage(preparationMessage),
      );

      const outputShares = prepare.map(({ preparationState }) => {
        const out = vdaf.prepareNext(preparationState, preparationMessage);
        if ("preparationState" in out) {
          throw new Error("expected outputShare for the last share");
        }
        return out.outputShare;
      });

      prepTestVector.out_shares = outputShares.map((outputShare) =>
        vdaf.encodeTestVectorOutputShare(outputShare),
      );
      testVector.prep.push(prepTestVector);
      return outputShares;
    }),
  );

  const aggregatorShares = arr(shares, (aggregatorId) => {
    const aggregatorOutShares = outShares.reduce(
      (aggregatorOutShares, out) => [...aggregatorOutShares, out[aggregatorId]],
      [] as OS[],
    );

    const aggregatorShare = vdaf.aggregate(
      aggregationParameter,
      aggregatorOutShares,
    );

    testVector.agg_shares.push(
      vdaf.encodeTestVectorAggregatorShare(aggregatorShare),
    );
    return aggregatorShare;
  });

  const agg_result = vdaf.unshard(
    aggregationParameter,
    aggregatorShares,
    measurements.length,
  );

  return { ...testVector, agg_result };
}

export interface TestVector<AP, M, AR> {
  verify_key: string;
  shares: number;
  agg_param: AP;
  prep: PrepTestVector<M>[];
  agg_shares: string[];
  agg_result: AR;
}

export interface PrepTestVector<M> {
  input_shares: string[];
  measurement: M;
  nonce: string;
  out_shares: string[][];
  prep_messages: string[];
  prep_shares: string[][];
  public_share: string;
  rand: string;
}

export function formatDomainSeparationTag(
  algorithmClass: number,
  algorithm: number,
  usage: number,
): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt8(VDAF_VERSION_NUMBER, 0);
  buffer.writeUInt8(algorithmClass, 1);
  buffer.writeUInt32BE(algorithm, 2);
  buffer.writeUInt16BE(usage, 6);
  return buffer;
}
