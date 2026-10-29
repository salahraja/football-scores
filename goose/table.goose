// Port of buildTable and groupByRound from football-scores src/data/helpers.ts.
// Usage: table table|rounds < input.json     (compact JSON on stdout)
import std;
import os;
import json;

struct Row {
    id: i64, position: i64, tid: i64, name: const u8[:],
    matches: i64, wins: i64, draws: i64, losses: i64, points: i64,
}

fn geti(n: json::Node?, key: u8[:]) -> i64 {
    let v, ok = json::as_i64(json::member(n, key));
    guard ok else { abort(str("bad field ", key)); }
    return v;
}

// Same order as TS: points desc, wins desc, then name (bytewise here).
fn before(a: Row&, b: Row&) -> bool {
    if a.points != b.points { return a.points > b.points; }
    if a.wins != b.wins { return a.wins > b.wins; }
    return compare(a.name, b.name) < 0;
}

fn table(root: json::Node&) {
    var rows: Row[>..] = [];
    json::each(root) { r =>
        let team = json::member(r, "team");
        let name, ok = json::as_string(json::member(team, "name"));
        guard ok else { abort("bad name"); }
        let wins = geti(r, "wins");
        let draws = geti(r, "draws");
        rows.push(Row {
            id: geti(r, "id"), position: 0, tid: geti(team, "id"), name: name,
            matches: geti(r, "matches"), wins: wins, draws: draws,
            losses: geti(r, "losses"), points: wins * 3 + draws,
        });
    };
    stable_sort(rows) { a, b => before(a, b) };
    var out: u8[>..] = [];
    out.push('[');
    var i = 0;
    for r in rows {
        i++;
        if i > 1 { out.push(','); }
        format(out, "{\"id\":", r.id, ",\"position\":", i, ",\"team\":{\"id\":", r.tid, ",\"name\":");
        json::format_string(out, r.name);
        format(out, "},\"matches\":", r.matches, ",\"wins\":", r.wins, ",\"draws\":", r.draws,
               ",\"losses\":", r.losses, ",\"points\":", r.points, "}");
    }
    out.push(']');
    write_stdout(out);
    write_stdout("\n");
}

// groupByRound: rounds newest first; events keep input order within a round (stable).
struct Ev { round: i64, id: i64 }

fn rounds(root: json::Node&) {
    var evs: Ev[>..] = [];
    json::each(root) { e =>
        let ri = json::member(e, "roundInfo");
        evs.push(Ev { round: geti(ri, "round"), id: geti(e, "id") });
    };
    stable_sort(evs) { a, b => a.round > b.round };
    var out: u8[>..] = [];
    out.push('[');
    var cur = -1;
    var first_group = true;
    var in_group = false;
    for e in evs {
        if !in_group || e.round != cur {
            if in_group { out.push(']'); out.push(']'); }
            if !first_group { out.push(','); }
            first_group = false;
            in_group = true;
            cur = e.round;
            format(out, "[", e.round, ",[", e.id);
        } else {
            format(out, ",", e.id);
        }
    }
    if in_group { out.push(']'); out.push(']'); }
    out.push(']');
    write_stdout(out);
    write_stdout("\n");
}

fn main() {
    var mode: u8[>..] = [];
    if arg_count() > 1 { arg(1, mode); } else { mode.append("table"); }
    var text: u8[>..] = [];
    read_stdin(text);
    var doc: json::Node[>..] = [];
    var decoded: u8[>..] = [];
    let root, err = json::parse(text, doc, decoded);
    guard root else { write_stderr(err); exit(1); }
    if compare(mode, "rounds") == 0 { rounds(root); } else { table(root); }
}
