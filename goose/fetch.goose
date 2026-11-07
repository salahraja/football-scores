// Build-time fetch in Goose: Serie A from football-data.org (v4) into data/raw/standings.json, results.json and meta.json, the same
// bytes scripts/fetch-data.mjs writes. It never fails the build: with no token, or on any API problem, it warns and leaves the
// committed snapshot as it is. Nothing is written unless BOTH calls succeed and the converted data looks sane.
// The HTTPS request and the token live in goose/net.c; this file never sees the token.
//   fetch <dir>                    fetch and write (exit 0 even when it keeps the snapshot)
//   fetch standings|results|season  convert a saved reply on stdin and print it (for the tests; no network)
import std;
import os;
import json;
import ffi;

extern fn fd_has_token() -> i64;
extern fn fd_get(path: const u8&, status: i64&, retry_after: i64&, len: i64&) -> u64;
extern fn fd_free(p: u64);

let MAX_RETRY_WAIT_S = 65;

// Number.isInteger(v) && v >= 0, as the Node fetch checks.
fn count(n: json::Node?, key: u8[:], ok: bool&) -> i64 {
    let v, good = json::as_i64(json::member(n, key));
    if !good || v < 0 { ok = false; return 0; }
    return v;
}

// A team's short name when it has one, else its name.
fn team_name(t: json::Node?, ok: bool&) -> const u8[:] {
    let short, has = json::as_string(json::member(t, "shortName"));
    if has && short.len > 0 { return short; }
    let full, has_full = json::as_string(json::member(t, "name"));
    if !has_full { ok = false; return ""; }
    return full;
}

fn indent(out: u8[>..]&, depth: i64) {
    out.push('\n');
    for i in depth { out.push(' '); }
}

// JSON.stringify(rows, null, 1) for the two raw shapes, so the files match the Node fetch byte for byte.
fn field_int(out: u8[>..]&, depth: i64, key: u8[:], v: i64, last: bool) {
    indent(out, depth); json::format_key(out, key); out.push(' '); json::format_int(out, v);
    if !last { out.push(','); }
}
fn field_team(out: u8[>..]&, depth: i64, key: u8[:], id: i64, name: u8[:]) {
    indent(out, depth); json::format_key(out, key); out.append(" {");
    field_int(out, depth + 1, "id", id, false);
    indent(out, depth + 1); json::format_key(out, "name"); out.push(' '); json::format_string(out, name);
    indent(out, depth); out.append("},");
}
fn field_obj(out: u8[>..]&, depth: i64, key: u8[:], inner: u8[:], v: i64) {
    indent(out, depth); json::format_key(out, key); out.append(" {");
    field_int(out, depth + 1, inner, v, true);
    indent(out, depth); out.append("},");
}

fn to_standings(body: json::Node?, out: u8[>..]&, err: u8[>..]&) -> bool {
    var table: json::Node? = null;
    let lists = json::member(body, "standings");
    if lists {
        json::each(lists) { s =>
            let kind, ok = json::as_string(json::member(s, "type"));
            if ok && kind == "TOTAL" && table == null { table .= json::member(s, "table"); }
        };
    }
    guard table else { err.append("standings: no TOTAL table in the reply"); return false; }
    var rows = 0;
    var good = true;
    out.push('[');
    json::each(table) { r =>
        let t = json::member(r, "team");
        var ok = true;
        let id = count(t, "id", ok);
        let name = team_name(t, ok);
        let played = count(r, "playedGames", ok);
        let won = count(r, "won", ok);
        let draw = count(r, "draw", ok);
        let lost = count(r, "lost", ok);
        if !ok { good = false; }
        if rows > 0 { out.push(','); }
        rows += 1;
        indent(out, 1); out.push('{');
        field_int(out, 2, "id", id, false);
        field_int(out, 2, "position", 0, false);
        field_team(out, 2, "team", id, name);
        field_int(out, 2, "matches", played, false);
        field_int(out, 2, "wins", won, false);
        field_int(out, 2, "draws", draw, false);
        field_int(out, 2, "losses", lost, false);
        field_int(out, 2, "points", 0, true);
        indent(out, 1); out.push('}');
    };
    out.append("\n]");
    if rows == 0 { err.append("standings: no TOTAL table in the reply"); return false; }
    if !good { err.append("standings: a row has an unexpected shape"); return false; }
    return true;
}

fn to_results(body: json::Node?, out: u8[>..]&, err: u8[>..]&) -> bool {
    let matches = json::member(body, "matches");
    guard matches else { err.append("matches: no matches list in the reply"); return false; }
    let is_list = match matches.val { Arr => true, _ => false };
    if !is_list { err.append("matches: no matches list in the reply"); return false; }
    var rows = 0;
    var good = true;
    out.push('[');
    json::each(matches) { m =>
        let status, has = json::as_string(json::member(m, "status"));
        if has && status == "FINISHED" {
            let ft = json::member(json::member(m, "score"), "fullTime");
            let ht = json::member(m, "homeTeam");
            let at = json::member(m, "awayTeam");
            var ok = true;
            let id = count(m, "id", ok);
            let h = count(ft, "home", ok);
            let a = count(ft, "away", ok);
            let day = count(m, "matchday", ok);
            let hid = count(ht, "id", ok);
            let aid = count(at, "id", ok);
            let hname = team_name(ht, ok);
            let aname = team_name(at, ok);
            if !ok { good = false; }
            if rows > 0 { out.push(','); }
            rows += 1;
            indent(out, 1); out.push('{');
            field_int(out, 2, "id", id, false);
            field_obj(out, 2, "homeScore", "current", h);
            field_team(out, 2, "homeTeam", hid, hname);
            field_obj(out, 2, "awayScore", "current", a);
            field_team(out, 2, "awayTeam", aid, aname);
            indent(out, 2); out.append("\"status\": {"); indent(out, 3); out.append("\"type\": \"finished\""); indent(out, 2); out.append("},");
            indent(out, 2); out.append("\"roundInfo\": {"); field_int(out, 3, "round", day, true); indent(out, 2); out.push('}');
            indent(out, 1); out.push('}');
        }
    };
    out.append("\n]");
    if !good { err.append("matches: a finished match has an unexpected shape"); return false; }
    if rows == 0 { err.append("matches: no finished matches yet"); return false; }
    return true;
}

fn year_of(date: u8[:]) -> i64 {
    if date.len < 5 || date[4] != '-' { return -1; }
    var y = 0;
    for i in 4 {
        let c = date[i];
        if c < '0' || c > '9' { return -1; }
        y = y * 10 + c - '0';
    }
    return y;
}

// "2026-27" from the season's dates ("2027" when both are the same year); nothing when they are missing.
fn season_label(body: json::Node?, out: u8[>..]&) -> bool {
    let season = json::member(body, "season");
    let s, ok1 = json::as_string(json::member(season, "startDate"));
    let e, ok2 = json::as_string(json::member(season, "endDate"));
    if !ok1 || !ok2 { return false; }
    let a = year_of(s);
    let b = year_of(e);
    if a < 0 || b < 0 { return false; }
    if a == b { format(out, a); } else { format(out, a, "-"); format_int(out, b % 100, 10, 2, '0'); }
    return true;
}

// new Date().toISOString(): 2026-11-07T21:10:51.050Z
fn iso_now(out: u8[>..]&) {
    let ns = time_ns();
    let ms = ns / 1000000;
    let secs = ms / 1000;
    var days = secs / 86400;
    let rem = secs % 86400;
    // civil_from_days (Howard Hinnant)
    days += 719468;
    let era = days / 146097;
    let doe = days - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    var y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    var m = mp + 3;
    if m > 12 { m -= 12; }
    if m <= 2 { y += 1; }
    format_int(out, y, 10, 4, '0'); out.push('-'); format_int(out, m, 10, 2, '0'); out.push('-'); format_int(out, d, 10, 2, '0');
    out.push('T'); format_int(out, rem / 3600, 10, 2, '0'); out.push(':'); format_int(out, (rem / 60) % 60, 10, 2, '0'); out.push(':');
    format_int(out, rem % 60, 10, 2, '0'); out.push('.'); format_int(out, ms % 1000, 10, 3, '0'); out.push('Z');
}

// GET path; the body on success. err says what went wrong, in words safe to print.
fn get(path: u8[:], body: u8[>..]&, err: u8[>..]&) -> bool {
    var p: u8[>..] = [];
    p.append(path); p.push(0);
    for attempt in 2 {
        var status = 0; var wait = -1; var len = 0;
        let buf = fd_get(p[0], status, wait, len);
        if buf == 0 { format(err, path, ": could not reach football-data.org"); return false; }
        if status == 200 { ffi::bytes(buf, len, body); fd_free(buf); return true; }
        fd_free(buf);
        if status == 429 {
            var w = wait;
            if w <= 0 { w = 60; }
            if attempt == 0 && w <= MAX_RETRY_WAIT_S {
                write_stderr(str("fetch-data: rate limited on ", path, ", waiting ", w, "s before one retry\n"));
                sleep(w);
            } else { format(err, path, ": rate limited (429)"); return false; }
        } else { format(err, path, ": HTTP ", status); return false; }
    }
    format(err, path, ": rate limited (429)");
    return false;
}

fn keep(dir: u8[:], why: u8[:]) {
    write_stderr(str("fetch-data: warning: ", why, "; keeping the committed snapshot in ", dir, "\n"));
}

fn fetch(dir: u8[:]) {
    if fd_has_token() == 0 {
        write_stderr(str("fetch-data: warning: FOOTBALL_DATA_TOKEN is not set, keeping the committed snapshot in ", dir, "\n"));
        return;
    }
    var err: u8[>..] = [];
    var s_text: u8[>..] = [];
    if !get("/competitions/SA/standings", s_text, err) { keep(dir, err); return; }
    var s_doc: json::Node[>..] = []; var s_dec: u8[>..] = [];
    let s_root, s_bad = json::parse(s_text, s_doc, s_dec);
    guard s_root else { keep(dir, "/competitions/SA/standings: unreadable reply"); return; }
    var standings: u8[>..] = [];
    if !to_standings(s_root, standings, err) { keep(dir, err); return; }
    var m_text: u8[>..] = [];
    if !get("/competitions/SA/matches", m_text, err) { keep(dir, err); return; }
    var m_doc: json::Node[>..] = []; var m_dec: u8[>..] = [];
    let m_root, m_bad = json::parse(m_text, m_doc, m_dec);
    guard m_root else { keep(dir, "/competitions/SA/matches: unreadable reply"); return; }
    var results: u8[>..] = [];
    if !to_results(m_root, results, err) { keep(dir, err); return; }
    make_dir(dir);
    standings.push('\n'); results.push('\n');
    var meta: u8[>..] = [];
    meta.append("{\"source\":\"live\",\"fetchedAt\":\"");
    iso_now(meta);
    meta.push('"');
    var season: u8[>..] = [];
    if season_label(s_root, season) { meta.append(",\"season\":"); json::format_string(meta, season); }
    meta.append("}\n");
    if !write_file_atomic(str(dir, "/standings.json"), standings) || !write_file_atomic(str(dir, "/results.json"), results) ||
       !write_file_atomic(str(dir, "/meta.json"), meta) {
        keep(dir, "could not write the files");
        return;
    }
    print(str("fetch-data: wrote ", standings_rows(standings), " table rows and ", results_rows(results), " finished matches to ", dir));
}

fn standings_rows(s: u8[:]) -> i64 { return occurrences(s, "\n {"); }
fn results_rows(s: u8[:]) -> i64 { return occurrences(s, "\n {"); }
fn occurrences(s: u8[:], sub: u8[:]) -> i64 {
    var n = 0;
    var i = 0;
    while i + sub.len <= s.len {
        if starts_with(s[i..], sub) { n += 1; i += sub.len; } else { i += 1; }
    }
    return n;
}

fn main() {
    var mode: u8[>..] = [];
    if arg_count() > 1 { arg(1, mode); }
    if mode == "standings" || mode == "results" || mode == "season" {
        var text: u8[>..] = [];
        read_stdin(text);
        var doc: json::Node[>..] = []; var dec: u8[>..] = [];
        let root, bad = json::parse(text, doc, dec);
        guard root else { write_stderr(bad); exit(1); }
        var out: u8[>..] = []; var err: u8[>..] = [];
        var ok = true;
        if mode == "standings" { ok = to_standings(root, out, err); }
        else if mode == "results" { ok = to_results(root, out, err); }
        else { season_label(root, out); }
        if !ok { write_stderr(err); write_stderr("\n"); exit(1); }
        out.push('\n');
        write_stdout(out);
        return;
    }
    guard mode.len > 0 else { write_stderr("usage: fetch <dir> | fetch standings|results|season < reply.json\n"); exit(2); }
    fetch(mode);
}
