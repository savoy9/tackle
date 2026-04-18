import type { Task } from '@chartroom/shared';

export interface ChartroomAPI {
  version: string;
  tasks: {
    list: () => Promise<Task[]>;
    get: (id: number) => Promise<Task | undefined>;
  };
}

declare global {
  interface Window {
    chartroom: ChartroomAPI;
  }
}
