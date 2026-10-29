// C ABI demo: pointsFor and outcome from helpers.ts as exported C functions.
import std;
export "fs_points_for" fn points_for(wins: i32, draws: i32) -> i32 { wins * 3 + draws }
export "fs_outcome" fn outcome(home: i32, away: i32) -> i32 { if home > away { 1 } else if home < away { -1 } else { 0 } }
