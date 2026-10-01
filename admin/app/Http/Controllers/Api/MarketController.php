<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class MarketController extends Controller
{
    public function livePrices(Request $request): JsonResponse
    {
        try {
            $stocks = [
                'AAPL' => ['price' => 150.25, 'change' => 2.5, 'change_percent' => 1.69],
                'GOOGL' => ['price' => 2750.80, 'change' => -15.20, 'change_percent' => -0.55],
                'MSFT' => ['price' => 305.15, 'change' => 5.75, 'change_percent' => 1.92],
                'TSLA' => ['price' => 245.60, 'change' => -8.40, 'change_percent' => -3.31],
                'AMZN' => ['price' => 3200.45, 'change' => 25.30, 'change_percent' => 0.80]
            ];
            
            $crypto = [
                'BTC-USD' => ['price' => 45250.75, 'change' => 1250.25, 'change_percent' => 2.84],
                'ETH-USD' => ['price' => 3150.40, 'change' => -85.60, 'change_percent' => -2.65],
                'BNB-USD' => ['price' => 425.80, 'change' => 12.30, 'change_percent' => 2.98],
                'ADA-USD' => ['price' => 0.85, 'change' => 0.05, 'change_percent' => 6.25],
                'SOL-USD' => ['price' => 125.60, 'change' => -3.40, 'change_percent' => -2.63]
            ];
            
            return response()->json([
                'success' => true,
                'timestamp' => now()->toISOString(),
                'stocks' => $stocks,
                'crypto' => $crypto
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveStartPrices(Request $request): JsonResponse
    {
        try {
            $contestId = $request->input('contest_id');
            if (!$contestId) {
                return response()->json(['success' => false, 'error' => 'Contest ID required'], 400);
            }
            
            $livePricesResponse = $this->livePrices($request);
            $livePricesData = $livePricesResponse->getData(true);
            
            if (!$livePricesData['success']) {
                return response()->json(['success' => false, 'error' => 'Failed to get live prices'], 500);
            }
            
            $startPrices = array_merge($livePricesData['stocks'] ?? [], $livePricesData['crypto'] ?? []);
            
            DB::table('contests')->where('id', $contestId)->update([
                'start_prices' => json_encode($startPrices),
                'start_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Start prices saved successfully',
                'prices_count' => count($startPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function saveEndPrices(Request $request): JsonResponse
    {
        try {
            $contestId = $request->input('contest_id');
            if (!$contestId) {
                return response()->json(['success' => false, 'error' => 'Contest ID required'], 400);
            }
            
            $livePricesResponse = $this->livePrices($request);
            $livePricesData = $livePricesResponse->getData(true);
            
            if (!$livePricesData['success']) {
                return response()->json(['success' => false, 'error' => 'Failed to get live prices'], 500);
            }
            
            $endPrices = array_merge($livePricesData['stocks'] ?? [], $livePricesData['crypto'] ?? []);
            
            DB::table('contests')->where('id', $contestId)->update([
                'end_prices' => json_encode($endPrices),
                'end_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'End prices saved successfully',
                'prices_count' => count($endPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    public function addSamplePrices($contestId): JsonResponse
    {
        try {
            if (!$contestId) {
                return response()->json(['success' => false, 'message' => 'Contest ID required'], 400);
            }
            
            $contest = DB::table('contests')->where('id', $contestId)->first();
            if (!$contest) {
                return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
            }
            
            $sampleStartPrices = [
                'AAPL' => ['price' => 145.50, 'change' => 0, 'change_percent' => 0],
                'GOOGL' => ['price' => 2800.00, 'change' => 0, 'change_percent' => 0],
                'MSFT' => ['price' => 300.00, 'change' => 0, 'change_percent' => 0],
                'TSLA' => ['price' => 250.00, 'change' => 0, 'change_percent' => 0],
                'BTC-USD' => ['price' => 44000.00, 'change' => 0, 'change_percent' => 0],
                'ETH-USD' => ['price' => 3200.00, 'change' => 0, 'change_percent' => 0]
            ];
            
            $sampleEndPrices = [
                'AAPL' => ['price' => 148.75, 'change' => 3.25, 'change_percent' => 2.23],
                'GOOGL' => ['price' => 2765.50, 'change' => -34.50, 'change_percent' => -1.23],
                'MSFT' => ['price' => 307.80, 'change' => 7.80, 'change_percent' => 2.60],
                'TSLA' => ['price' => 242.30, 'change' => -7.70, 'change_percent' => -3.08],
                'BTC-USD' => ['price' => 46200.00, 'change' => 2200.00, 'change_percent' => 5.00],
                'ETH-USD' => ['price' => 3040.00, 'change' => -160.00, 'change_percent' => -5.00]
            ];
            
            DB::table('contests')->where('id', $contestId)->update([
                'start_prices' => json_encode($sampleStartPrices),
                'end_prices' => json_encode($sampleEndPrices),
                'start_prices_saved_at' => now(),
                'end_prices_saved_at' => now()
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Sample prices added successfully',
                'start_prices_count' => count($sampleStartPrices),
                'end_prices_count' => count($sampleEndPrices)
            ]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}