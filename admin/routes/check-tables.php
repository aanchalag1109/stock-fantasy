<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;

Route::get('/check-tables', function() {
    try {
        // Check contests table structure
        $contestColumns = DB::select("SHOW COLUMNS FROM contests");
        
        // Check existing contest data
        $existingContests = DB::table('contests')->get();
        
        return response()->json([
            'contests_columns' => $contestColumns,
            'existing_contests' => $existingContests,
            'contests_count' => count($existingContests)
        ], 200, [], JSON_PRETTY_PRINT);
        
    } catch (Exception $e) {
        return response()->json([
            'error' => $e->getMessage()
        ], 500);
    }
});