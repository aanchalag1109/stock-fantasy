<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class BannerController extends Controller
{
    public function banners(): JsonResponse
    {
        try {
            $banners = DB::table('banners')
                ->where('status', 'active')
                ->orderBy('id', 'desc')
                ->get()
                ->map(function ($banner) {
                    $banner->image = asset($banner->image);
                    return $banner;
                });
            
            return response()->json(['success' => true, 'banners' => $banners]);
            
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}