export type Polynom = Vector;

// CLASS DEFINITION
// ================================================================================================
export class Vector {
  readonly values: bigint[];
  readonly elementSize: number;

  // CONSTRUCTOR
  // --------------------------------------------------------------------------------------------
  constructor(values: bigint[], elementSize: number) {
    this.values = values;
    this.elementSize = elementSize;
  }

  // PROPERTIES
  // --------------------------------------------------------------------------------------------
  get length(): number {
    return this.values.length;
  }

  toValues(): bigint[] {
    return this.values;
  }
}
