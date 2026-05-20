export type History<T> = {
  record(value: T): void;
  undo(): T | undefined;
  redo(): T | undefined;
  reset(value: T): void;
};

const MAX = 50;

export function createHistory<T>(initial: T): History<T> {
  let past: T[] = [];
  let present: T = initial;
  let future: T[] = [];

  return {
    record(value) {
      past.push(present);
      if (past.length > MAX) past.shift();
      present = value;
      future = [];
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined) return undefined;
      future.push(present);
      present = previous;
      return previous;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return undefined;
      past.push(present);
      present = next;
      return next;
    },
    reset(value) {
      past = [];
      future = [];
      present = value;
    },
  };
}
