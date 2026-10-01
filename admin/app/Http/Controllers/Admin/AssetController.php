<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AssetController extends Controller
{
    public function getAssetsByCategory($categoryId)
    {
        $assets = DB::table('assets')
            ->where('category_id', $categoryId)
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'symbol', 'name', 'type', 'image_url']);

        return response()->json($assets);
    }

    public function getCategoriesByType($type)
    {
        $categories = DB::table('market_type_categories')
            ->where('category_type', $type)
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json($categories);
    }
}