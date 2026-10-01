<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * StatsController
 *
 * Session ke live/completed stocks ki performance stats.
 * - Konse stocks sabse zyada % badhe (gainers)
 * - Konse stocks sabse zyada % gire (losers)
 * - Har 5 min mein live session ke dauran update hoti hai
 */
class StatsController extends Controller
{
    /**
     * GET /api/v1/session-stats/{sessionId}
     * Query params:
     *   filter = all | positive | negative  (default: all)
     *   user_id = optional
     */
    public function sessionStats(Request $request, int $sessionId)
    {
        try {
            $filter = $request->query('filter', 'all'); // all | positive | negative

            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                return response()->json(['success' => false, 'error' => 'Session not found'], 404);
            }

            // Only live or completed sessions have price data
            if (!in_array($session->status, ['live', 'completed', 'completing'])) {
                return response()->json([
                    'success'      => true,
                    'session_id'   => $sessionId,
                    'session_name' => $session->name,
                    'status'       => $session->status,
                    'stats'        => [],
                    'message'      => 'Stats available once session goes live.',
                ]);
            }

            // Get all asset prices for this session (DISTINCT by symbol)
            $prices = DB::table('session_asset_prices')
                ->leftJoin('assets', 'session_asset_prices.asset_symbol', '=', 'assets.symbol')
                ->where('session_asset_prices.league_session_id', $sessionId)
                ->whereNotNull('session_asset_prices.start_price')
                ->select(
                    'session_asset_prices.asset_symbol as symbol',
                    'assets.name as asset_name',
                    'session_asset_prices.start_price',
                    'session_asset_prices.end_price',
                    'session_asset_prices.end_price_fetched_at as last_updated'
                )
                ->groupBy(
                    'session_asset_prices.asset_symbol',
                    'assets.name',
                    'session_asset_prices.start_price',
                    'session_asset_prices.end_price',
                    'session_asset_prices.end_price_fetched_at'
                )
                ->get()
                ->unique('symbol'); // Extra safety: deduplicate by symbol

            $stats = [];
            foreach ($prices as $price) {
                $startPrice   = floatval($price->start_price);
                $currentPrice = floatval($price->end_price ?? $price->start_price);

                if ($startPrice <= 0) continue;

                $changePercent = (($currentPrice - $startPrice) / $startPrice) * 100;
                $changePercent = round($changePercent, 4);

                // Apply filter
                if ($filter === 'positive' && $changePercent <= 0) continue;
                if ($filter === 'negative' && $changePercent >= 0) continue;

                $stats[] = [
                    'symbol'         => $price->symbol,
                    'name'           => $price->asset_name ?? $price->symbol,
                    'start_price'    => $startPrice,
                    'current_price'  => $currentPrice,
                    'change_percent' => $changePercent,
                    'change_amount'  => round($currentPrice - $startPrice, 4),
                    'direction'      => $changePercent > 0 ? 'up' : ($changePercent < 0 ? 'down' : 'flat'),
                    'last_updated'   => $price->last_updated,
                ];
            }

            // Sort: gainers first (desc), then losers (asc)
            if ($filter === 'negative') {
                usort($stats, fn($a, $b) => $a['change_percent'] <=> $b['change_percent']); // most negative first
            } else {
                usort($stats, fn($a, $b) => $b['change_percent'] <=> $a['change_percent']); // most positive first
            }

            return response()->json([
                'success'      => true,
                'session_id'   => $sessionId,
                'session_name' => $session->name,
                'status'       => $session->status,
                'filter'       => $filter,
                'total'        => count($stats),
                'stats'        => $stats,
                'last_updated' => now()->toDateTimeString(),
                'unread_notifications' => NotificationController::getUnreadCount($request->query('user_id')),
            ]);

        } catch (\Exception $e) {
            Log::error('StatsController error: ' . $e->getMessage());
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
