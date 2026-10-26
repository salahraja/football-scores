// Hand-written loader for the Goose data layer compiled to wasm64 (goose/wasm/build.sh -> goose-footy.wasm).
// No dependencies; works in browsers with memory64 support and in Node (22+). JSON goes in and out through
// linear memory. With memory64, pointers and lengths are BigInt on the JS side.
//   const g = await loadGooseWasm(bytes);          // or a Response / Promise<Response> from fetch()
//   g.standings(rawJsonText) -> output JSON text;  g.results(rawJsonText) -> output JSON text
// The module imports two functions, host_write (stderr text) and host_exit; both are only used on a crash.

interface Exports {
  memory: WebAssembly.Memory;
  goose_init(argc: number, argv: bigint): void;
  malloc(n: bigint): bigint;
  fs_in_reserve(n: bigint): void;
  fs_in_ptr(lenOut: bigint): bigint;
  fs_out_ptr(lenOut: bigint): bigint;
  fs_run(mode: number): bigint;
}

export interface GooseData {
  standings(rawJson: string): string;
  results(rawJson: string): string;
}

/** Inputs above this many bytes are refused: the wasm build has no guard pages, so a data stack that outgrows
 *  its 32 MB region would corrupt memory instead of stopping. 12 MB input was verified; 36 MB failed. */
export const MAX_INPUT_BYTES = 16 * 1024 * 1024;

export async function loadGooseWasm(source: BufferSource | Response | Promise<Response>): Promise<GooseData> {
  let ex: Exports;
  const log: number[] = [];
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const imports = {
    env: {
      host_write(_fd: number, p: bigint, n: bigint) {
        log.push(...new Uint8Array(ex.memory.buffer, Number(p), Number(n)));
      },
      host_exit(code: number) {
        throw new Error(`goose wasm exited with ${code}: ${dec.decode(new Uint8Array(log))}`);
      },
    },
  };
  const isBytes = source instanceof ArrayBuffer || ArrayBuffer.isView(source);
  const instance = isBytes
    ? (await WebAssembly.instantiate(source as BufferSource, imports)).instance
    : (await WebAssembly.instantiateStreaming(source as Response | Promise<Response>, imports)).instance;
  ex = instance.exports as unknown as Exports;
  ex.goose_init(0, 0n);
  const scratch = ex.malloc(16n);

  const call = (mode: number, text: string): string => {
    const bytes = enc.encode(text);
    if (bytes.length > MAX_INPUT_BYTES) throw new Error(`goose wasm: input of ${bytes.length} bytes is over the ${MAX_INPUT_BYTES} limit`);
    ex.fs_in_reserve(BigInt(bytes.length));
    const inPtr = ex.fs_in_ptr(scratch);
    new Uint8Array(ex.memory.buffer, Number(inPtr), bytes.length).set(bytes);
    const n = Number(ex.fs_run(mode));
    const outPtr = ex.fs_out_ptr(scratch);
    const out = dec.decode(new Uint8Array(ex.memory.buffer, Number(outPtr), Math.abs(n)));
    if (n < 0) throw new Error(`goose wasm: ${out}`);
    return out + "\n";
  };
  return { standings: (t) => call(0, t), results: (t) => call(1, t) };
}
