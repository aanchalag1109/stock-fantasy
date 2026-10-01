<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Exception;

class PriceValidationService
{
    private $priceFetcher;
    
    public function __construct(RobustPriceFetchingService $priceFetcher)
    {
        $this->priceFetcher = $priceFetcher;
    }
    
    /**
     * Cross-verify prices from multiple sources
     */
    public function crossVerifyPrice($symbol, $targetPrice, $tolerance = 5.0)
    {
        try {
            // Fetch from multiple sources
            $sources = ['rapidapi_nse', 'yahoo_finance', 'alpha_vantage'];
            $prices = [];
            $successful_sources = [];
            
            foreach ($sources as $source) {
                try {
                    $result = $this->priceFetcher->fetchStockPrice($symbol);
                    if ($result['success']) {
                        $prices[] = $result['price'];
                        $successful_sources[] = $result['source'];
                    }
                } catch (Exception $e) {
                    Log::warning("Source failed during cross-verification", [
                        'symbol' => $symbol,
                        'source' => $source,
                        'error' => $e->getMessage()
                    ]);
                }
            }
            
            if (empty($prices)) {
                return [
                    'verified' => false,
                    'reason' => 'No sources available for verification',
                    'confidence' => 0
                ];
            }
            
            // Calculate consensus price
            $avgPrice = array_sum($prices) / count($prices);
            $medianPrice = $this->calculateMedian($prices);
            
            // Check if our target price is within tolerance
            $avgDifference = abs(($targetPrice - $avgPrice) / $avgPrice * 100);
            $medianDifference = abs(($targetPrice - $medianPrice) / $medianPrice * 100);
            
            // Calculate confidence based on source agreement
            $priceVariance = $this->calculateVariance($prices);
            $confidence = $this->calculateConfidence($priceVariance, count($prices));
            
            $verified = ($avgDifference <= $tolerance && $medianDifference <= $tolerance);
            
            return [
                'verified' => $verified,
                'target_price' => $targetPrice,
                'consensus_avg' => $avgPrice,
                'consensus_median' => $medianPrice,
                'avg_difference_percent' => $avgDifference,
                'median_difference_percent' => $medianDifference,
                'confidence' => $confidence,
                'sources_used' => $successful_sources,
                'all_prices' => $prices,
                'variance' => $priceVariance,
                'tolerance' => $tolerance
            ];
            
        } catch (Exception $e) {
            Log::error("Price cross-verification failed", [
                'symbol' => $symbol,
                'target_price' => $targetPrice,
                'error' => $e->getMessage()
            ]);
            
            return [
                'verified' => false,
                'reason' => 'Verification failed: ' . $e->getMessage(),
                'confidence' => 0
            ];
        }
    }
    
    /**
     * Validate all session prices
     */
    public function validateSessionPrices($sessionId, $tolerance = 3.0)
    {
        try {
            $sessionPrices = DB::table('session_asset_prices')
                ->where('league_session_id', $sessionId)
                ->get();
                
            if ($sessionPrices->isEmpty()) {
                return [
                    'success' => false,
                    'message' => 'No prices found for session'
                ];
            }
            
            $results = [];
            $totalPrices = 0;
            $validatedPrices = 0;
            $suspiciousPrices = 0;
            
            foreach ($sessionPrices as $priceRecord) {
                // Validate start price
                if ($priceRecord->start_price) {
                    $startValidation = $this->crossVerifyPrice(
                        $priceRecord->asset_symbol,
                        $priceRecord->start_price,
                        $tolerance
                    );
                    
                    $results[$priceRecord->asset_symbol]['start_price'] = [
                        'stored_price' => $priceRecord->start_price,
                        'validation' => $startValidation,
                        'status' => $startValidation['verified'] ? 'VALID' : 'SUSPICIOUS'
                    ];
                    
                    $totalPrices++;
                    if ($startValidation['verified']) {
                        $validatedPrices++;
                    } else {
                        $suspiciousPrices++;
                    }
                }
                
                // Validate end price
                if ($priceRecord->end_price) {
                    $endValidation = $this->crossVerifyPrice(
                        $priceRecord->asset_symbol,
                        $priceRecord->end_price,
                        $tolerance
                    );
                    
                    $results[$priceRecord->asset_symbol]['end_price'] = [
                        'stored_price' => $priceRecord->end_price,
                        'validation' => $endValidation,
                        'status' => $endValidation['verified'] ? 'VALID' : 'SUSPICIOUS'
                    ];
                    
                    $totalPrices++;
                    if ($endValidation['verified']) {
                        $validatedPrices++;
                    } else {
                        $suspiciousPrices++;
                    }
                }
            }
            
            $accuracyRate = ($totalPrices > 0) ? ($validatedPrices / $totalPrices * 100) : 0;
            
            return [
                'success' => true,
                'session_id' => $sessionId,
                'total_prices' => $totalPrices,
                'validated_prices' => $validatedPrices,
                'suspicious_prices' => $suspiciousPrices,
                'accuracy_rate' => $accuracyRate,
                'tolerance_used' => $tolerance,
                'results' => $results
            ];
            
        } catch (Exception $e) {
            Log::error("Session price validation failed", [
                'session_id' => $sessionId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    /**
     * Auto-correct suspicious prices
     */
    public function autoCorrectSuspiciousPrices($sessionId, $tolerance = 3.0, $dryRun = true)
    {
        try {
            $validation = $this->validateSessionPrices($sessionId, $tolerance);
            
            if (!$validation['success']) {
                return $validation;
            }
            
            $corrections = [];
            $correctionCount = 0;
            
            foreach ($validation['results'] as $symbol => $priceData) {
                foreach (['start_price', 'end_price'] as $priceType) {
                    if (isset($priceData[$priceType]) && $priceData[$priceType]['status'] === 'SUSPICIOUS') {
                        $storedPrice = $priceData[$priceType]['stored_price'];
                        $consensusPrice = $priceData[$priceType]['validation']['consensus_median'];
                        $confidence = $priceData[$priceType]['validation']['confidence'];
                        
                        // Only auto-correct if confidence is high enough
                        if ($confidence >= 0.8) {
                            $corrections[] = [
                                'symbol' => $symbol,
                                'price_type' => $priceType,
                                'old_price' => $storedPrice,
                                'new_price' => $consensusPrice,
                                'confidence' => $confidence,
                                'difference_percent' => abs(($storedPrice - $consensusPrice) / $consensusPrice * 100)
                            ];
                            
                            if (!$dryRun) {
                                // Apply correction to database
                                $updateField = $priceType === 'start_price' ? 'start_price' : 'end_price';
                                
                                DB::table('session_asset_prices')
                                    ->where('league_session_id', $sessionId)
                                    ->where('asset_symbol', $symbol)
                                    ->update([
                                        $updateField => $consensusPrice,
                                        'updated_at' => now(),
                                        'correction_applied' => true,
                                        'correction_reason' => "Auto-corrected: {$confidence} confidence"
                                    ]);
                                
                                Log::info("Price auto-corrected", [
                                    'session_id' => $sessionId,
                                    'symbol' => $symbol,
                                    'price_type' => $priceType,
                                    'old_price' => $storedPrice,
                                    'new_price' => $consensusPrice,
                                    'confidence' => $confidence
                                ]);
                            }
                            
                            $correctionCount++;
                        }
                    }
                }
            }
            
            return [
                'success' => true,
                'session_id' => $sessionId,
                'dry_run' => $dryRun,
                'corrections_needed' => $correctionCount,
                'corrections' => $corrections,
                'message' => $dryRun ? 
                    "Found {$correctionCount} prices that can be auto-corrected" :
                    "Applied {$correctionCount} price corrections"
            ];
            
        } catch (Exception $e) {
            Log::error("Auto-correction failed", [
                'session_id' => $sessionId,
                'error' => $e->getMessage()
            ]);
            
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
    
    private function calculateMedian($numbers)
    {
        sort($numbers);
        $count = count($numbers);
        $middle = floor($count / 2);
        
        if ($count % 2 == 0) {
            return ($numbers[$middle - 1] + $numbers[$middle]) / 2;
        } else {
            return $numbers[$middle];
        }
    }
    
    private function calculateVariance($numbers)
    {
        $mean = array_sum($numbers) / count($numbers);
        $variance = 0;
        
        foreach ($numbers as $number) {
            $variance += pow($number - $mean, 2);
        }
        
        return $variance / count($numbers);
    }
    
    private function calculateConfidence($variance, $sourceCount)
    {
        // Higher confidence with more sources and lower variance
        $baseConfidence = min($sourceCount / 3, 1.0); // Max confidence with 3+ sources
        $variancePenalty = min($variance / 1000, 0.5); // Reduce confidence for high variance
        
        return max(0, $baseConfidence - $variancePenalty);
    }
}