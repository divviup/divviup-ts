import { Response } from "undici";

interface Problem {
  type: string;
  title: string;
  status: string;
  detail: string;
  instance: string;
}

export class DAPError extends Error {
  type: string;
  title: string;
  status: string;
  detail: string;
  instance: string;
  clientContext: string;

  constructor(problem: Problem, clientContext: string) {
    super(`${problem.type}: ${problem.title}`);
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
    this.detail = problem.detail;
    this.instance = problem.instance;
    this.clientContext = clientContext;
  }

  static async fromResponse(
    response: Response,
    description: string
  ): Promise<DAPError | Error> {
    const contentType = response.headers.get("Content-Type");
    if (contentType && contentType.match(/^application\/problem\+json/)) {
      const body = (await response.json()) as Problem;
      return new DAPError(body, description);
    }

    return new Error(description);
  }
}
