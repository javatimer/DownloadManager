interface SpeedtestResult {
  dlStatus: number | string;
  ulStatus: number | string;
  pingStatus: number | string;
  jitterStatus: number | string;
  dlProgress: number;
  ulProgress: number;
  pingProgress: number;
  testState: number;
}

interface Speedtest {
  onupdate: (data: SpeedtestResult) => void;
  onend: (aborted: boolean) => void;
  start(): void;
  abort(): void;
  getState(): number;
  setParameter(name: string, value: string | number | boolean): void;
}

declare const Speedtest: {
  new(): Speedtest;
};
