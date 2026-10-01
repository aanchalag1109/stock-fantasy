<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class PriceErrorAnalysisController extends Controller
{
    public function analyzePriceErrors($sessionId)
    {
        try {
            $session = DB::table('league_sessions')->where('id', $sessionId)->first();
            if (!$session) {
                return response()->json(['success' => false, 'error' => 'Session not found']);
            }

            $prices = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->get();

            $analysisResults = [];
            foreach ($prices as $price) {
                $errors = $this->analyzeAssetPriceErrors($price, $session);
                if (!empty($errors)) {
                    $analysisResults = array_merge($analysisResults, $errors);
                }
            }

            return response()->json([
                'success' => true,
                'analysis_results' => $analysisResults
            ]);

        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()]);
        }
    }

    private function analyzeAssetPriceErrors($price, $session)
    {
        $errors = [];
        $sessionStart = Carbon::parse($session->start_time);
        $sessionEnd = Carbon::parse($session->end_time);

        // Analyze start price errors
        if ($price->start_price) {
            $startPriceErrors = $this->analyzeSpecificPrice(
                $price, 
                'start', 
                $price->start_price, 
                $price->start_price_fetched_at,
                $sessionStart
            );
            $errors = array_merge($errors, $startPriceErrors);
        }

        // Analyze end price errors
        if ($price->end_price) {
            $endPriceErrors = $this->analyzeSpecificPrice(
                $price, 
                'end', 
                $price->end_price, 
                $price->end_price_fetched_at,
                $sessionEnd
            );
            $errors = array_merge($errors, $endPriceErrors);
        }

        return $errors;
    }

    private function analyzeSpecificPrice($price, $priceType, $priceValue, $fetchedAt, $expectedTime)
    {
        $errors = [];

        // Check for null or invalid prices
        if (is_null($priceValue) || $priceValue <= 0) {
            $errors[] = [
                'asset_symbol' => $price->asset_symbol,
                'price_type' => ucfirst($priceType) . ' Price',
                'error_category' => 'critical',
                'error_title' => 'Missing or Invalid Price',
                'our_price' => $priceValue ?? 0,
                'expected_price' => null,
                'difference_percent' => 100,
                'root_cause' => 'API endpoint returned null/zero value or database constraint failed',
                'impact_level' => 'High - Contest calculations will be incorrect',
                'timestamp' => $fetchedAt ?? now(),
                'solutions' => [
                    'Check API endpoint connectivity and response format',
                    'Verify database constraints and data types',
                    'Implement fallback price sources',
                    'Add price validation before saving'
                ],
                'technical_details' => "Price value: " . ($priceValue ?? 'NULL') . ", Expected: > 0"
            ];
            return $errors;
        }

        // Check timing issues
        if ($fetchedAt && $expectedTime) {
            $timeDiff = Carbon::parse($fetchedAt)->diffInMinutes($expectedTime);
            
            if ($timeDiff > 30) {
                $errors[] = [
                    'asset_symbol' => $price->asset_symbol,
                    'price_type' => ucfirst($priceType) . ' Price',
                    'error_category' => 'timing',
                    'error_title' => 'Significant Timing Deviation',
                    'our_price' => $priceValue,
                    'expected_price' => null,
                    'difference_percent' => 0,
                    'root_cause' => 'Price fetched ' . $timeDiff . ' minutes ' . 
                                   (Carbon::parse($fetchedAt)->gt($expectedTime) ? 'after' : 'before') . 
                                   ' expected time',
                    'impact_level' => 'Medium - May affect contest fairness',
                    'timestamp' => $fetchedAt,
                    'solutions' => [
                        'Optimize cron job scheduling and execution time',
                        'Implement price caching with proper TTL',
                        'Add buffer time for API calls',
                        'Monitor system performance and API response times'
                    ],
                    'technical_details' => "Expected: " . $expectedTime->format('Y-m-d H:i:s') . 
                                         ", Actual: " . Carbon::parse($fetchedAt)->format('Y-m-d H:i:s')
                ];
            }
        }

        // Check for extreme price values (potential data errors)
        $extremeThreshold = $this->getExtremeThreshold($price->asset_symbol);
        if ($priceValue > $extremeThreshold['max'] || $priceValue < $extremeThreshold['min']) {
            $errors[] = [
                'asset_symbol' => $price->asset_symbol,
                'price_type' => ucfirst($priceType) . ' Price',
                'error_category' => 'data',
                'error_title' => 'Extreme Price Value',
                'our_price' => $priceValue,
                'expected_price' => ($extremeThreshold['min'] + $extremeThreshold['max']) / 2,
                'difference_percent' => 0,
                'root_cause' => 'Price outside normal range - possible API data corruption or wrong symbol mapping',
                'impact_level' => 'High - Unrealistic price affects all calculations',
                'timestamp' => $fetchedAt ?? now(),
                'solutions' => [
                    'Verify asset symbol mapping in API calls',
                    'Implement price range validation',
                    'Add historical price comparison checks',
                    'Set up alerts for extreme price movements'
                ],
                'technical_details' => "Price: ₹{$priceValue}, Expected range: ₹{$extremeThreshold['min']} - ₹{$extremeThreshold['max']}"
            ];
        }

        // Check for duplicate prices (start == end, indicating no update)
        if ($priceType === 'end' && $price->start_price && abs($priceValue - $price->start_price) < 0.01) {
            $errors[] = [
                'asset_symbol' => $price->asset_symbol,
                'price_type' => 'End Price',
                'error_category' => 'api',
                'error_title' => 'No Price Movement Detected',
                'our_price' => $priceValue,
                'expected_price' => $price->start_price,
                'difference_percent' => 0,
                'root_cause' => 'End price identical to start price - API may not have updated or market was closed',
                'impact_level' => 'Medium - Zero returns for all participants',
                'timestamp' => $fetchedAt ?? now(),
                'solutions' => [
                    'Check if market was open during session time',
                    'Verify API is returning real-time data',
                    'Implement market hours validation',
                    'Add minimum price movement threshold'
                ],
                'technical_details' => "Start: ₹{$price->start_price}, End: ₹{$priceValue}, Difference: ₹" . abs($priceValue - $price->start_price)
            ];
        }

        return $errors;
    }

    private function getExtremeThreshold($assetSymbol)
    {
        // Define reasonable price ranges for different asset types
        $thresholds = [
            // Indian stocks (most are between ₹1 - ₹50,000)
            'default_stock' => ['min' => 0.1, 'max' => 100000],
            
            // Crypto (highly volatile)
            'BTC-USD' => ['min' => 1000000, 'max' => 10000000], // ₹10L - ₹1Cr
            'ETH-USD' => ['min' => 50000, 'max' => 1000000],    // ₹50K - ₹10L
            'default_crypto' => ['min' => 0.01, 'max' => 1000000],
        ];

        // Check if it's a crypto symbol
        if (strpos($assetSymbol, '-USD') !== false) {
            $cryptoSymbol = str_replace('-USD', '', $assetSymbol);
            return $thresholds[$assetSymbol] ?? $thresholds['default_crypto'];
        }

        // For stocks, use default stock range
        return $thresholds['default_stock'];
    }
}