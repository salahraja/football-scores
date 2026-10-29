// CLI: footy standings|results < raw.json > generated.json   (compact JSON plus a newline on stdout)
import std;
import os;
import .footy;

fn main() {
    var mode: u8[>..] = [];
    if arg_count() > 1 { arg(1, mode); } else { mode.append("standings"); }
    var text: u8[>..] = [];
    read_stdin(text);
    var out: u8[>..] = [];
    if !run(mode, text, out) { write_stderr(out); write_stderr("\n"); exit(1); }
    out.push('\n');
    write_stdout(out);
}
