<?php

namespace App\Http\Controllers;

use App\Models\Asset;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class AssetController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'symbol' => 'required|string|unique:assets',
            'name' => 'required|string',
            'type' => 'required|string',
            'category_id' => 'required|integer|exists:market_type_categories,id',
            'image_url' => 'nullable|url',
            'status' => 'nullable|string|in:active,inactive'
        ]);

        $asset = Asset::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Asset saved successfully',
            'data' => $asset
        ], 201);
    }

    public function index(): JsonResponse
    {
        $assets = Asset::with('category')->get();
        
        return response()->json([
            'success' => true,
            'data' => $assets
        ]);
    }
}