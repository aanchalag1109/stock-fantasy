<?php

namespace App\Http\Controllers;

use App\Models\SavedBasket;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class SavedBasketController extends Controller
{
    
    
    
    
    
    
    
public function store(Request $request): JsonResponse
{
    $isStandalone = $request->boolean('is_standalone', false);

    $rules = [
        'user_id' => 'required|integer|exists:users,id',
        'assets' => 'required|array|min:1',
        'multipliers' => 'required|array|min:1',
        'multipliers.*.index' => 'required|integer',
        'multipliers.*.asset_name' => 'required|string',
        'multipliers.*.multiplier' => 'required|numeric|min:1',
        'multipliers.*.prediction' => 'required|in:UP,DOWN,NONE',
        'multipliers.*.selected' => 'boolean',
    ];

    if ($isStandalone) {
        $rules['session_id'] = 'required|string';
    } else {
        $rules['contest_id'] = 'required|integer|exists:contests,id';
        $rules['session_id'] = 'required|string';
    }

    $validated = $request->validate($rules);

    // Filter only selected multipliers
    $selectedMultipliers = array_filter($validated['multipliers'], function($multiplier) {
        return isset($multiplier['selected']) && $multiplier['selected'] === true;
    });

    // For contest baskets, check if user already has a basket and update it
    if (!$isStandalone && isset($validated['contest_id'])) {
        $existingBasket = SavedBasket::where('user_id', $validated['user_id'])
            ->where('contest_id', $validated['contest_id'])
            ->first();
            
        if ($existingBasket) {
            $existingBasket->update([
                'assets' => $validated['assets'],
                'multipliers' => array_values($selectedMultipliers),
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Contest basket updated successfully',
                'data' => $existingBasket
            ]);
        }
        
        // If no existing contest basket, find standalone basket and convert it
        $standaloneBasket = SavedBasket::where('user_id', $validated['user_id'])
            ->where('session_id', $validated['session_id'])
            ->where('is_standalone', 1)
            ->whereNotNull('assets')
            ->latest()
            ->first();
            
        if ($standaloneBasket && !empty(json_decode($standaloneBasket->assets, true))) {
            // Convert standalone basket to contest basket
            $standaloneBasket->update([
                'contest_id' => $validated['contest_id'],
                'is_standalone' => 0
            ]);
            
            return response()->json([
                'success' => true,
                'message' => 'Standalone basket converted to contest basket',
                'data' => $standaloneBasket
            ]);
        }
    }

    // Extract assets from selected multipliers if assets is empty
    $assetsToSave = $validated['assets'];
    if (empty($assetsToSave) && !empty($selectedMultipliers)) {
        $assetsToSave = array_map(function($mult) {
            return [
                'name' => $mult['asset_name'],
                'symbol' => $mult['asset_name'],
                'direction' => $mult['prediction'],
                'multiplier' => $mult['multiplier']
            ];
        }, $selectedMultipliers);
    }

    $basket = SavedBasket::create([
        'user_id' => $validated['user_id'],
        'contest_id' => $validated['contest_id'] ?? null,
        'session_id' => $validated['session_id'],
        'assets' => $assetsToSave,
        'multipliers' => array_values($selectedMultipliers),
        'total_score' => 0,
        'is_standalone' => $isStandalone,
    ]);

    return response()->json([
        'success' => true,
        'data' => $basket
    ]);
}



    public function index(): JsonResponse
    {
        $baskets = SavedBasket::with('contest')->get();
        
        return response()->json([
            'success' => true,
            'data' => $baskets
        ]);
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
            $basket = SavedBasket::create([
                'user_id' => $validated['user_id'],
                'contest_id' => null,
                'session_id' => $request->session_id,
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

    public function destroy($id): JsonResponse
    {
        $basket = SavedBasket::find($id);
        
        if (!$basket) {
            return response()->json([
                'success' => false,
                'message' => 'Basket not found'
            ], 404);
        }
        
        $basket->delete();
        
        return response()->json([
            'success' => true,
            'message' => 'Basket deleted successfully'
        ]);
    }
    
    public function cleanupEmptyBaskets(): JsonResponse
    {
        try {
            // Delete baskets with empty assets array
            $deleted = SavedBasket::where(function($query) {
                $query->where('assets', '[]')
                      ->orWhereNull('assets')
                      ->orWhere('assets', '')
                      ->orWhere('multipliers', '[]')
                      ->orWhereNull('multipliers')
                      ->orWhere('multipliers', '');
            })->delete();
            
            return response()->json([
                'success' => true,
                'message' => "Cleaned up {$deleted} empty baskets",
                'deleted_count' => $deleted
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
}