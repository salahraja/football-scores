// football-scores data layer in Goose: the same logic as src/data/helpers.ts, producing the JSON the app imports.
//   standings_json: StandingRow[] -> StandingRow[]  (points filled, sorted points desc, wins desc, name, positions 1..n)
//   results_json:   MatchEvent[]  -> [{round, events:[MatchEvent + outcome]}], newest round first, input order inside a round
// Output is compact JSON with a fixed key order, byte-identical to what src/data/build.ts produces.
// Name order is the collation rule in scripts/gen-collation.mjs (accent/case aware, ICU en-US), not raw bytes.
import std;
import json;
import .collation_table;

fn geti(n: json::Node?, key: u8[:]) -> i64 {
    let v, ok = json::as_i64(json::member(n, key));
    guard ok else { abort(str("bad or missing integer field ", key)); }
    return v;
}

fn gets(n: json::Node?, key: u8[:]) -> const u8[:] {
    let v, ok = json::as_string(json::member(n, key));
    guard ok else { abort(str("bad or missing string field ", key)); }
    return v;
}

// ---- collation: a name becomes a byte key; bytewise order of keys is the documented name order ----
fn push_w3(key: u8[>..]&, v: i64) {
    key.push(((v >> 16) & 255) as u8);
    key.push(((v >> 8) & 255) as u8);
    key.push((v & 255) as u8);
}

// key = primaries (3 bytes each) ++ 000 ++ secondaries ++ tertiaries (1 byte each).
fn name_key(name: u8[:], key: u8[>..]&) {
    var sec: u8[>..] = [];
    var ter: u8[>..] = [];
    each_utf8(name) { cp =>
        var p = 0;
        var s = 0;
        var t = 0;
        if cp >= COLL_FROM && cp <= COLL_TO {
            let i = (cp - COLL_FROM) * 3;
            p = COLL[i] as i64;
            s = COLL[i + 1] as i64;
            t = COLL[i + 2] as i64;
        }
        if p == 0 { p = 0x10000 + cp; s = 0; t = 0; }
        push_w3(key, p);
        sec.push(s as u8);
        ter.push(t as u8);
    };
    key.push(0); key.push(0); key.push(0);
    key.append(sec);
    key.append(ter);
}

struct Row {
    id: i64, tid: i64, name: const u8[:], koff: i64, klen: i64,
    matches: i64, wins: i64, draws: i64, losses: i64, points: i64,
}

// points desc, wins desc, then the collation key of the name.
fn before(a: Row&, b: Row&, keys: u8[:]) -> bool {
    if a.points != b.points { return a.points > b.points; }
    if a.wins != b.wins { return a.wins > b.wins; }
    return compare(keys[a.koff..a.koff + a.klen], keys[b.koff..b.koff + b.klen]) < 0;
}

fn standings_json(root: json::Node&, keys: u8[>..]&, out: u8[>..]&) {
    var rows: Row[>..] = [];
    json::each(root) { r =>
        let team = json::member(r, "team");
        let name = gets(team, "name");
        let wins = geti(r, "wins");
        let draws = geti(r, "draws");
        let koff = keys.len;
        name_key(name, keys);
        rows.push(Row {
            id: geti(r, "id"), tid: geti(team, "id"), name: name, koff: koff, klen: keys.len - koff,
            matches: geti(r, "matches"), wins: wins, draws: draws,
            losses: geti(r, "losses"), points: wins * 3 + draws,
        });
    };
    stable_sort(rows) { a, b => before(a, b, keys) };
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
}

struct Ev {
    round: i64, id: i64, hs: i64, aws: i64,
    htid: i64, hname: const u8[:], atid: i64, aname: const u8[:], status: const u8[:],
}

fn outcome(h: i64, a: i64) -> const u8[:] {
    if h > a { return "home"; }
    if h < a { return "away"; }
    return "draw";
}

fn format_event(out: u8[>..]&, e: Ev&) {
    format(out, "{\"id\":", e.id, ",\"homeScore\":{\"current\":", e.hs, "},\"homeTeam\":{\"id\":", e.htid, ",\"name\":");
    json::format_string(out, e.hname);
    format(out, "},\"awayScore\":{\"current\":", e.aws, "},\"awayTeam\":{\"id\":", e.atid, ",\"name\":");
    json::format_string(out, e.aname);
    out.append("},\"status\":{\"type\":");
    json::format_string(out, e.status);
    format(out, "},\"roundInfo\":{\"round\":", e.round, "},\"outcome\":\"", outcome(e.hs, e.aws), "\"}");
}

fn results_json(root: json::Node&, out: u8[>..]&) {
    var evs: Ev[>..] = [];
    json::each(root) { e =>
        let ht = json::member(e, "homeTeam");
        let at = json::member(e, "awayTeam");
        evs.push(Ev {
            round: geti(json::member(e, "roundInfo"), "round"), id: geti(e, "id"),
            hs: geti(json::member(e, "homeScore"), "current"), aws: geti(json::member(e, "awayScore"), "current"),
            htid: geti(ht, "id"), hname: gets(ht, "name"), atid: geti(at, "id"), aname: gets(at, "name"),
            status: gets(json::member(e, "status"), "type"),
        });
    };
    stable_sort(evs) { a, b => a.round > b.round };
    out.push('[');
    var cur = 0;
    var open = false;
    for e in evs {
        if !open || e.round != cur {
            if open { out.append("]}"); out.push(','); }
            open = true;
            cur = e.round;
            format(out, "{\"round\":", e.round, ",\"events\":[");
        } else {
            out.push(',');
        }
        format_event(out, e);
    }
    if open { out.append("]}"); }
    out.push(']');
}

// mode "standings" | "results". Returns false and puts a message in out when the input is not valid JSON.
fn run(mode: u8[:], text: u8[:], out: u8[>..]&) -> bool {
    var doc: json::Node[>..] = [];
    var decoded: u8[>..] = [];
    let root, err = json::parse(text, doc, decoded);
    guard root else { out.append(err); return false; }
    if compare(mode, "results") == 0 {
        results_json(root, out);
    } else {
        var keys: u8[>..] = [];
        standings_json(root, keys, out);
    }
    return true;
}
