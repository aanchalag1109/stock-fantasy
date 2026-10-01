<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class BasketController extends Controller
{



 public function saveBasket(Request $request)
    {
        try {
            $userId = $request->input('user_id');
            $contestId = $request->input('contest_id');
            $sessionId = $request->input('session_id');
            $basketId = $request->input('basket_id');
            $assets = $request->input('assets', []);
            $multipliers = $request->input('multipliers', []);
            $isStandalone = $request->boolean('is_standalone', false);

            if (!$userId || !$sessionId) {
                return response()->json(['success' => false, 'message' => 'User ID and Session ID required'], 400);
            }

            // Normalize multipliers to only selected ones if they are objects
            $selectedMultipliers = [];
            if (is_array($multipliers) && !empty($multipliers)) {
                if (isset($multipliers[0]) && is_array($multipliers[0]) && isset($multipliers[0]['selected'])) {
                    $selectedMultipliers = array_values(array_filter($multipliers, function($multiplier) {
                        return isset($multiplier['selected']) && $multiplier['selected'] === true;
                    }));
                } else {
                    $selectedMultipliers = array_values($multipliers);
                }
            }

            // If basket_id is provided, update existing basket
            if ($basketId) {
                $basket = DB::table('saved_baskets')
                    ->where('id', $basketId)
                    ->where('user_id', $userId)
                    ->first();

                if (!$basket) {
                    return response()->json(['success' => false, 'message' => 'Basket not found or unauthorized'], 404);
                }

                DB::table('saved_baskets')
                    ->where('id', $basketId)
                    ->where('user_id', $userId)
                    ->update([
                        'assets' => json_encode($assets),
                        'multipliers' => json_encode($selectedMultipliers),
                        'updated_at' => Carbon::now()
                    ]);

                return response()->json(['success' => true, 'message' => 'Basket updated successfully', 'basket_id' => $basketId]);
            }

            // Only create standalone baskets here
            if ($isStandalone) {
                // Generate serial number (B1, B2, B3...)
                $maxSerial = DB::table('saved_baskets')
                    ->where('user_id', $userId)
                    ->where('session_id', $sessionId)
                    ->whereNotNull('serial_no')
                    ->max(DB::raw('CAST(SUBSTRING(serial_no, 2) AS UNSIGNED)'));
                
                $nextNumber = ($maxSerial ?? 0) + 1;
                $serialNo = 'B' . $nextNumber;
                
                $newBasketId = DB::table('saved_baskets')->insertGetId([
                    'user_id' => $userId,
                    'contest_id' => null,
                    'session_id' => $sessionId,
                    'serial_no' => $serialNo,
                    'assets' => json_encode($assets),
                    'multipliers' => json_encode($selectedMultipliers),
                    'total_score' => 0,
                    'is_standalone' => 1,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ]);
                
                return response()->json(['success' => true, 'message' => 'Standalone basket saved', 'basket_id' => $newBasketId, 'serial_no' => $serialNo]);
            }

            // If not standalone and no basket_id, return error
            return response()->json(['success' => false, 'message' => 'Invalid request: Use is_standalone=1 for new baskets'], 400);
            
        } catch (\Exception $e) {
            Log::error('Error saving basket: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'message' => 'Failed to save basket: ' . $e->getMessage()], 500);
        }
    }




public function storeStandalone(Request $request): JsonResponse
    {
        \Log::info('Session ID from API request', [
            'session_id' => $request->session_id,
            'all_request_data' => $request->all()
        ]);
        
        $validated = $request->validate([
            'user_id' => 'required|integer',
            'assets' => 'required|array|min:1',
            'assets.*.name' => 'required|string',
            'assets.*.sector' => 'required|string', 
            'assets.*.category_id' => 'required|integer',
            'assets.*.prediction' => 'required|in:UP,DOWN,NONE',
            'multipliers' => 'required|array|min:1',
            'multipliers.*.index' => 'required|integer',
            'multipliers.*.asset_name' => 'required|string',
            'multipliers.*.multiplier' => 'required|numeric|min:1',
            'multipliers.*.prediction' => 'required|in:UP,DOWN,NONE',
            'multipliers.*.selected' => 'boolean',
        ]);

        // Filter only selected multipliers
        $selectedMultipliers = array_filter($validated['multipliers'], function($multiplier) {
            return isset($multiplier['selected']) && $multiplier['selected'] === true;
        });

        try {
            // Generate serial number (B1, B2, B3...)
            $maxSerial = DB::table('saved_baskets')
                ->where('user_id', $validated['user_id'])
                ->where('session_id', $request->session_id)
                ->whereNotNull('serial_no')
                ->max(DB::raw('CAST(SUBSTRING(serial_no, 2) AS UNSIGNED)'));
            
            $nextNumber = ($maxSerial ?? 0) + 1;
            $serialNo = 'B' . $nextNumber;
            
            $basket = SavedBasket::create([
                'user_id' => $validated['user_id'],
                'contest_id' => null,
                'session_id' => $request->session_id,
                'serial_no' => $serialNo,
                'assets' => $validated['assets'], // Save all assets
                'multipliers' => array_values($selectedMultipliers), // Save only selected multipliers
                'total_score' => 0,
                'is_standalone' => true
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Standalone basket saved successfully',
                'data' => $basket
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            \Log::error('Database error creating standalone basket:', [
                'error' => $e->getMessage(),
                'validated_data' => $validated
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'Failed to save standalone basket'
            ], 500);
        }
    }

    


public function savedBaskets(Request $request)
    {
        $userId    = $request->query('user_id');
        $sessionId = $request->query('session_id');
        $contestId = $request->query('contest_id');
        $excludeJoined = $request->query('exclude_joined', false);
        $type      = $request->query('type'); // standalone | contest | null

        if (!$userId) {
            return response()->json([
                'success' => false,
                'error'   => 'user_id is required'
            ], 400);
        }

        try {
            $query = DB::table('saved_baskets')
                ->leftJoin('contests', 'saved_baskets.contest_id', '=', 'contests.id')
                ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
                ->select(
                    'saved_baskets.*',
                    'contests.entry_fee',
                    'contests.prize_pool',
                    'contests.category',
                    'league_sessions.name as session_name',
                    'league_sessions.id as league_session_id'
                )
                ->where('saved_baskets.user_id', $userId)
                ->where('saved_baskets.is_standalone', 1); // Only standalone baskets

            // Session filter
            if ($sessionId) {
                $query->where('saved_baskets.session_id', $sessionId);
            }

            // Exclude baskets already used in contest
            if ($contestId && $excludeJoined) {
                $joinedBasketIds = DB::table('contest_entries')
                    ->where('user_id', $userId)
                    ->where('contest_id', $contestId)
                    ->pluck('basket_id')
                    ->toArray();
                    
                if (!empty($joinedBasketIds)) {
                    $query->whereNotIn('saved_baskets.id', $joinedBasketIds);
                }
            }

            $baskets = $query
                ->orderBy('saved_baskets.created_at', 'desc')
                ->get();

            // Decode JSON fields and categorize assets
            $baskets = $baskets->map(function ($basket) use ($sessionId) {
                $basket = (array) $basket;
                $assets = json_decode($basket['assets'] ?? '[]', true);
                $multipliers = json_decode($basket['multipliers'] ?? '[]', true);
                
                // Get contest_id if this basket is joined in any contest
                $contestEntry = DB::table('contest_entries')
                    ->where('basket_id', $basket['id'])
                    ->first();
                
                $contestId = $contestEntry ? $contestEntry->contest_id : null;
                
                // Calculate points for each asset if session exists
                $assetsWithPoints = [];
                $totalPoints = 0;
                
                // Get session ID from basket or use the query parameter
                $basketSessionId = $basket['session_id'] ?? $sessionId;
                
                if ($basketSessionId) {
                    // Get start and end prices from session_asset_prices table
                    $startPrices = DB::table('session_asset_prices')
                        ->where('league_session_id', $basketSessionId)
                        ->whereNotNull('start_price')
                        ->get()
                        ->keyBy('asset_symbol');
                        
                    $endPrices = DB::table('session_asset_prices')
                        ->where('league_session_id', $basketSessionId)
                        ->whereNotNull('end_price')
                        ->get()
                        ->keyBy('asset_symbol');
                        
                    $calculationStarted = $endPrices->count() > 0;
                    
                    foreach ($assets as $index => $asset) {
                        $symbol = $asset['symbol'] ?? $asset['name'] ?? null;
                        $multiplierData = is_array($multipliers[$index] ?? 1) ? $multipliers[$index] : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
                        $multiplier = $multiplierData['multiplier'] ?? 1;
                        $prediction = strtoupper($multiplierData['prediction'] ?? 'UP');
                        
                        $points = 0;
                        if ($calculationStarted && $symbol && isset($startPrices[$symbol]) && isset($endPrices[$symbol])) {
                            $startPrice = $startPrices[$symbol]->start_price;
                            $endPrice = $endPrices[$symbol]->end_price;
                            
                            if ($startPrice > 0) {
                                $priceChangePercent = (($endPrice - $startPrice) / $startPrice) * 100;
                                
                                if ($prediction == 'UP') {
                                    $directionalPercent = $priceChangePercent > 0 ? $priceChangePercent : -abs($priceChangePercent);
                                } else {
                                    $directionalPercent = $priceChangePercent < 0 ? abs($priceChangePercent) : -$priceChangePercent;
                                }
                                
                                $weightedPercent = $directionalPercent * $multiplier;
                                $points = round($weightedPercent, 2) * 100;
                            }
                        }
                        
                        $totalPoints += $points;
                        
                        $assetWithPoints = array_merge($asset, [
                            'multiplier' => $multiplier,
                            'prediction' => $prediction,
                            'points' => $points
                        ]);
                        $assetsWithPoints[] = $assetWithPoints;
                    }
                } else {
                    // No session, just add multiplier and prediction without points
                    foreach ($assets as $index => $asset) {
                        $multiplierData = is_array($multipliers[$index] ?? 1) ? $multipliers[$index] : ['multiplier' => ($multipliers[$index] ?? 1), 'prediction' => 'UP'];
                        $assetWithPoints = array_merge($asset, [
                            'multiplier' => $multiplierData['multiplier'] ?? 1,
                            'prediction' => strtoupper($multiplierData['prediction'] ?? 'UP'),
                            'points' => 0
                        ]);
                        $assetsWithPoints[] = $assetWithPoints;
                    }
                }
                
                // Categorize assets into LC, MC, SC
                $categorizedAssets = [
                    'lc' => [],
                    'mc' => [],
                    'sc' => []
                ];
                
                foreach ($assetsWithPoints as $asset) {
                    $sector = $asset['sector'] ?? '';
                    if (str_contains(strtolower($sector), 'large cap')) {
                        $categorizedAssets['lc'][] = $asset;
                    } elseif (str_contains(strtolower($sector), 'mid cap')) {
                        $categorizedAssets['mc'][] = $asset;
                    } elseif (str_contains(strtolower($sector), 'small cap')) {
                        $categorizedAssets['sc'][] = $asset;
                    }
                }
                
                $basket['assets_by_category'] = $categorizedAssets;
                $basket['lc_count'] = count($categorizedAssets['lc']);
                $basket['mc_count'] = count($categorizedAssets['mc']);
                $basket['sc_count'] = count($categorizedAssets['sc']);
                $basket['multipliers'] = $multipliers;
                $basket['starting_prices'] = json_decode($basket['starting_prices'] ?? '[]', true);
                $basket['total_points'] = round($totalPoints, 2);
                $basket['total_score'] = floatval($basket['total_score'] ?? 0);
                $basket['entry_fee'] = floatval($basket['entry_fee'] ?? 0);
                $basket['prize_pool'] = floatval($basket['prize_pool'] ?? 0);
                $basket['is_standalone'] = (bool) ($basket['is_standalone'] ?? false);
                $basket['league_session_id'] = $basket['league_session_id'] ?? $basket['session_id'];
                $basket['basket_id'] = $basket['id'];
                $basket['serial_no'] = $basket['serial_no'] ?? null;
                
                unset($basket['assets']); 
                
                return $basket;
            });

            return response()->json([
                'success' => true,
                'data'    => $baskets
            ]);
        } catch (\Exception $e) {
            Log::error('Error fetching saved baskets: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to fetch baskets'], 500);
        }
    }

    public function deleteBasket(Request $request)
    {
        try {
            $basketId = $request->input('basket_id');
            $userId = $request->input('user_id');

            if (!$basketId || !$userId) {
                return response()->json([
                    'success' => false,
                    'message' => 'basket_id and user_id are required'
                ], 400);
            }

            $basket = DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->first();

            if (!$basket) {
                return response()->json([
                    'success' => false,
                    'message' => 'Basket not found or unauthorized'
                ], 404);
            }

            DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'Basket deleted successfully'
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to delete basket: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete basket: ' . $e->getMessage()
            ], 500);
        }
    }

    public function editBasket(Request $request)
    {
        try {
            $basketId = $request->input('basket_id');
            $userId = $request->input('user_id');
            $assets = $request->input('assets', []);
            $multipliers = $request->input('multipliers', []);

            if (!$basketId || !$userId) {
                return response()->json([
                    'success' => false,
                    'message' => 'basket_id and user_id are required'
                ], 400);
            }

            $basket = DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->first();

            if (!$basket) {
                return response()->json([
                    'success' => false,
                    'message' => 'Basket not found or unauthorized'
                ], 404);
            }

            // Handle multipliers in new format (array of objects) or old format (simple array)
            $selectedMultipliers = [];
            if (is_array($multipliers) && !empty($multipliers)) {
                // Check if it's the new format with objects that have a 'selected' key
                if (isset($multipliers[0]) && is_array($multipliers[0]) && array_key_exists('selected', $multipliers[0])) {
                    $selectedMultipliers = array_values(array_filter($multipliers, function($multiplier) {
                        return ($multiplier['selected'] ?? false) === true;
                    }));
                } else {
                    // Assume it's a simple array of multiplier values
                    $selectedMultipliers = array_values($multipliers);
                }
            }

            DB::table('saved_baskets') // Corrected: use DB facade
                ->where('id', $basketId)
                ->where('user_id', $userId)
                ->update([
                    'assets' => json_encode($assets),
                    'multipliers' => json_encode($selectedMultipliers),
                    'updated_at' => Carbon::now() // Corrected: use Carbon
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Basket updated successfully'
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update basket: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to update basket: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getContestBaskets(Request $request)
    {
        $contestId = $request->query('contest_id');
        $userId = $request->query('user_id');

        if (!$contestId || !$userId) {
            return response()->json(['success' => false, 'error' => 'contest_id and user_id required'], 400);
        }

        $baskets = DB::table('contest_entries')
            ->join('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
            ->where('contest_entries.contest_id', $contestId)
            ->where('contest_entries.user_id', $userId)
            ->select('saved_baskets.*')
            ->get()
            ->map(function($basket) {
                $basket->assets = json_decode($basket->assets, true);
                $basket->multipliers = json_decode($basket->multipliers, true);
                return $basket;
            });

        return response()->json(['success' => true, 'data' => $baskets]);
    }
}