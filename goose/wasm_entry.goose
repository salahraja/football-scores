// C ABI of the data layer, built for wasm32 by goose/wasm/build.sh. JSON goes in and out through linear memory:
//   fs_in_reserve(n); p = fs_in_ptr(&len); write n bytes at p; n = fs_run(0 standings | 1 results); q = fs_out_ptr(&len); read n bytes.
import std;
import .footy;

var inbuf: u8[>..] = [];
var outbuf: u8[>..] = [];

export "fs_in_reserve" fn in_reserve(n: i64) {
    inbuf.resize(n, 0);
}

export "fs_in_ptr" fn in_ptr() -> const u8[:] { inbuf }
export "fs_out_ptr" fn out_ptr() -> const u8[:] { outbuf }

// Returns the output length, or -1 with the message in the output buffer.
export "fs_run" fn run_mode(mode: i32) -> i64 {
    outbuf.resize(0, 0);
    let ok = run(if mode == 1 { "results" } else { "standings" }, inbuf, outbuf);
    if !ok { return -1; }
    return outbuf.len;
}
