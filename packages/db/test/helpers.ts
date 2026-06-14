import { makeTestDb } from "../src/testing";

export { makeTestDb };
export type TestDb = Awaited<ReturnType<typeof makeTestDb>>["db"];
