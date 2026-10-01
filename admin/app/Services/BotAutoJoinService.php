<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

/**
 * BotAutoJoinService
 *
 * Logic:
 * - Admin sets bot_count = total bots to fill (EXCLUDING real users)
 * - Real users jo join ho chuke hain unhe count karke remaining bots calculate karo
 * - Time-based speed: jitna kam time bacha, utni fast joining
 * - Har cron run (5 min) mein ek batch join karo
 */
class BotAutoJoinService
{
    public static function processAutoJoin(): array
    {
        $results = [];
        $now     = Carbon::now('Asia/Kolkata');

        // Sessions jo upcoming ya live hain aur bots abhi bhi join kar sakte hain
        $sessions = DB::table('league_sessions')
            ->whereIn('status', ['upcoming', 'live'])
            ->get();

        foreach ($sessions as $session) {
            $startTime   = Carbon::parse($session->start_time);
            $minutesLeft = $now->diffInMinutes($startTime, false); // positive = future, negative = past

            // Contests jo bots chahte hain
            $contests = DB::table('contests')
                ->where('league_session_id', $session->id)
                ->where('bot_count', '>', 0)
                ->where('bots_joined', 0) // 0 = not fully done
                ->whereNotIn('status', ['cancelled', 'completed'])
                ->get();

            foreach ($contests as $contest) {
                $shouldJoin = false;

                // Agar session already live hai toh bots turant join hone chahiye
                if ($session->status === 'live' || $minutesLeft <= 0) {
                    $shouldJoin = true;
                } elseif (!empty($contest->bot_join_at)) {
                    $joinAt = Carbon::parse($contest->bot_join_at);
                    if ($now->gte($joinAt)) $shouldJoin = true;
                } elseif (!empty($session->user_joining_start_time)) {
                    $joiningStart = Carbon::parse($session->user_joining_start_time);
                    if ($now->gte($joiningStart)) $shouldJoin = true;
                } else {
                    $joinBefore = intval($contest->bot_join_minutes_before ?? 30);
                    if ($minutesLeft <= $joinBefore && $minutesLeft >= 0) $shouldJoin = true;
                }

                if (!$shouldJoin) continue;

                $result = self::joinBotsToContest($contest, $session, $minutesLeft);
                $results[] = $result;
            }
        }

        return $results;
    }

    private static function joinBotsToContest(object $contest, object $session, int $minutesLeft): string
    {
        try {
            $botCount = intval($contest->bot_count);
            if ($botCount <= 0) return "Contest #{$contest->id}: bot_count=0, skip";

            // ── Count bots already joined ─────────────────────────────────────
            $botsAlreadyJoined = DB::table('contest_entries')
                ->join('users', 'contest_entries.user_id', '=', 'users.id')
                ->where('contest_entries.contest_id', $contest->id)
                ->where('users.is_test_user', 1)
                ->count();

            // ── bot_count = EXACT bots to join (separate from real users) ─────
            // bot_count = 100 means 100 bots will join regardless of real users
            $botsNeeded = $botCount;
            $botsRemaining = max(0, $botsNeeded - $botsAlreadyJoined);

            if ($botsRemaining <= 0) {
                DB::table('contests')->where('id', $contest->id)->update(['bots_joined' => 1]);
                return "Contest #{$contest->id}: All bots done (needed={$botsNeeded}, already={$botsAlreadyJoined}) ✅";
            }

            // ── Simple time-based logic ───────────────────────────────────────
            $startTime = Carbon::parse($session->start_time);
            $now       = Carbon::now('Asia/Kolkata');

            // Bot joining window start time
            if (!empty($contest->bot_join_at)) {
                $windowStart = Carbon::parse($contest->bot_join_at);
            } elseif (!empty($session->user_joining_start_time)) {
                $windowStart = Carbon::parse($session->user_joining_start_time);
            } else {
                $joinBefore  = intval($contest->bot_join_minutes_before ?? 30);
                $windowStart = $startTime->copy()->subMinutes($joinBefore);
            }

            // Total window in seconds
            $totalWindowSecs = max(1, $windowStart->diffInSeconds($startTime));

            // Interval: har kitne seconds mein 1 bot join kare
            $intervalSecs = max(1, intval($totalWindowSecs / max(1, $botsNeeded)));

            // Seconds elapsed since window started
            $secsElapsed = max(0, $windowStart->diffInSeconds($now, false));

            // ── CRITICAL FIX: Agar 2 min ya kam bacha hai toh SAARE remaining bots join karo ──
            $minutesUntilStart = $now->diffInMinutes($startTime, false);
            if ($minutesUntilStart <= 2) {
                // Force all remaining bots to join NOW
                $toJoinNow = $botsRemaining;
            } else {
                // Normal time-based calculation
                $expectedBots = min($botsNeeded, intval(floor($secsElapsed / $intervalSecs)));
                $toJoinNow = max(0, $expectedBots - $botsAlreadyJoined);
                $toJoinNow = min($toJoinNow, $botsRemaining);
            }

            if ($toJoinNow <= 0) {
                return "Contest #{$contest->id}: No bots this run (interval={$intervalSecs}s, remaining={$botsRemaining}, done={$botsAlreadyJoined})";
            }

            // ── Get available bots ────────────────────────────────────────────
            $bots = DB::table('users')
                ->where('is_test_user', 1)
                ->whereNotIn('id', function ($q) use ($contest) {
                    $q->select('user_id')->from('contest_entries')->where('contest_id', $contest->id);
                })
                ->inRandomOrder()
                ->limit($toJoinNow)
                ->get(['id', 'name']);

            if ($bots->isEmpty()) {
                return "Contest #{$contest->id}: No available bots";
            }

            // ── Session assets ────────────────────────────────────────────────
            $assets = DB::table('league_session_assets')
                ->join('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
                ->where('league_session_assets.league_session_id', $session->id)
                ->select('league_session_assets.asset_symbol as symbol', 'market_type_categories.name as category_name', 'league_session_assets.category_id')
                ->get();

            if ($assets->isEmpty()) {
                return "Contest #{$contest->id}: No assets for session";
            }

            $maxStocks = intval($session->max_stocks ?? 5);
            $joined    = 0;

            // ── Join bots with correct timestamps ─────────────────────────────
            DB::beginTransaction();
            try {
                foreach ($bots as $i => $bot) {
                    // Calculate exact join time for this bot
                    $botIndex = $botsAlreadyJoined + $i;
                    $joinTime = $windowStart->copy()->addSeconds($botIndex * $intervalSecs);
                    // If joinTime is in future, use now (shouldn't happen but safety)
                    if ($joinTime->gt($now)) $joinTime = $now->copy()->subSeconds(rand(5, 30));

                    $selectedAssets = self::buildRandomBasket($assets, $maxStocks);
                    $multipliers    = self::buildRandomMultipliers($selectedAssets);

                    $maxSerial = DB::table('saved_baskets')
                        ->where('user_id', $bot->id)
                        ->where('session_id', $session->id)
                        ->max(DB::raw('CAST(SUBSTRING(serial_no, 2) AS UNSIGNED)'));
                    $serialNo = 'B' . (($maxSerial ?? 0) + 1);

                    $basketId = DB::table('saved_baskets')->insertGetId([
                        'user_id'       => $bot->id,
                        'contest_id'    => null,
                        'session_id'    => $session->id,
                        'serial_no'     => $serialNo,
                        'assets'        => json_encode($selectedAssets),
                        'multipliers'   => json_encode($multipliers),
                        'total_score'   => 0,
                        'is_standalone' => 1,
                        'created_at'    => $joinTime,
                        'updated_at'    => $joinTime,
                    ]);

                    DB::table('contest_entries')->insert([
                        'user_id'     => $bot->id,
                        'contest_id'  => $contest->id,
                        'basket_id'   => $basketId,
                        'session_id'  => $session->id,
                        'total_score' => 0,
                        'rank'        => null,
                        'created_at'  => $joinTime,
                        'updated_at'  => $joinTime,
                    ]);

                    $joined++;
                }

                // Mark fully done if all needed bots joined
                $totalBotsNow = $botsAlreadyJoined + $joined;
                if ($totalBotsNow >= $botsNeeded) {
                    DB::table('contests')->where('id', $contest->id)->update(['bots_joined' => 1]);
                }

                DB::commit();
                return "🤖 Contest #{$contest->id}: +{$joined} bots (needed={$botsNeeded}, done={$totalBotsNow}, interval={$intervalSecs}s)";

            } catch (\Exception $e) {
                DB::rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            Log::error("BotAutoJoin failed for contest #{$contest->id}: " . $e->getMessage());
            return "❌ Contest #{$contest->id}: " . $e->getMessage();
        }
    }

    private static function buildRandomBasket($assets, int $maxStocks): array
    {
        // Group by category
        $byCategory = [];
        foreach ($assets as $asset) {
            $cat = $asset->category_name ?? 'Other';
            $byCategory[$cat][] = [
                'name'        => $asset->symbol,
                'symbol'      => $asset->symbol,
                'sector'      => $cat,
                'category_id' => $asset->category_id,
                'prediction'  => rand(0, 1) ? 'UP' : 'DOWN',
            ];
        }

        $selected = [];

        // Step 1: Minimum 1 from each category
        foreach ($byCategory as $catAssets) {
            if (count($selected) >= $maxStocks) break;
            $idx = array_rand($catAssets);
            $selected[] = $catAssets[$idx];
        }

        // Step 2: Fill remaining slots randomly
        $allAssets = [];
        foreach ($byCategory as $catAssets) {
            foreach ($catAssets as $a) $allAssets[] = $a;
        }
        shuffle($allAssets);

        foreach ($allAssets as $asset) {
            if (count($selected) >= $maxStocks) break;
            $alreadyIn = false;
            foreach ($selected as $s) {
                if ($s['symbol'] === $asset['symbol']) { $alreadyIn = true; break; }
            }
            if (!$alreadyIn) $selected[] = $asset;
        }

        return array_slice($selected, 0, $maxStocks);
    }

    private static function buildRandomMultipliers(array $assets): array
    {
        $count      = count($assets);
        $alphaIdx   = rand(0, max(0, $count - 1));
        $betaIdx    = ($alphaIdx + 1) % max(1, $count);
        $multipliers = [];

        foreach ($assets as $i => $asset) {
            $mult = 1;
            if ($i === $alphaIdx) $mult = 2;
            elseif ($i === $betaIdx) $mult = 1.5;

            $multipliers[] = [
                'index'      => $i,
                'asset_name' => $asset['symbol'],
                'multiplier' => $mult,
                'prediction' => $asset['prediction'],
                'selected'   => true,
            ];
        }

        return $multipliers;
    }
}
