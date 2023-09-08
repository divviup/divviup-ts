import { TaskId } from "./taskId.js";

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  taskid: string;
}

export class DAPError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly clientContext: string;
  readonly taskId: TaskId;
  readonly shortType: string;

  constructor(problem: Problem, clientContext: string) {
    const shortType = problem.type.split(":").slice(-1)[0];
    super(`${shortType}: ${problem.title}`);
    this.shortType = shortType;
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
    this.detail = problem.detail;
    this.instance = problem.instance;
    this.clientContext = clientContext;
    this.taskId = new TaskId(problem.taskid);
  }

  static async fromResponse(
    response: Response,
    description: string,
  ): Promise<DAPError | Error> {
    const contentType = response.headers.get("Content-Type");
    if (contentType && contentType.match(/^application\/problem\+json/)) {
      const body = (await response.json()) as Problem;
      return new DAPError(body, description);
    }

    return new Error(description);
  }
}
