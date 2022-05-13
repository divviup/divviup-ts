export abstract class DAPError extends Error {
  abstract urn: string;
  taskID: string;
  constructor(description: string, taskID: string) {
    super(description);
    this.taskID = taskID;
  }

  fullyQualifiedURN(): `urn:ietf:params:ppm:error:${typeof this.urn}` {
    return `urn:ietf:params:ppm:error:${this.urn}`;
  }
}

export class UnrecognizedMessageError extends DAPError {
  urn = "unrecognizedMessage";
  constructor(taskID: string) {
    super(
      "The message type for a response was incorrect or the payload was malformed.",
      taskID
    );
  }
}

export class UnrecognizedTaskError extends DAPError {
  urn = "unrecognizedTask";
  constructor(taskID: string) {
    super("An endpoint received a message with an unknown task ID.", taskID);
  }
}
export class OutdatedConfigError extends DAPError {
  urn = "outdatedConfig";
  constructor(taskID: string) {
    super("The message was generated using an outdated configuration.", taskID);
  }
}

export class BatchInvalidError extends DAPError {
  urn = "batchInvalid";
  constructor(taskID: string) {
    super(
      "A collect or aggregate-share request was made with invalid batch parameters.",
      taskID
    );
  }
}

export class BatchMismatchError extends DAPError {
  urn = "batchMismatch";
  constructor(taskID: string) {
    super(
      "Aggregators disagree on the report shares that were aggregated in a batch.",
      taskID
    );
  }
}
