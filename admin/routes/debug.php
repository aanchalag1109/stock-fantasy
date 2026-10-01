<?php

Route::get('/debug-contest/{contestId}', function($contestId) {
    $entries = \DB::table('contest_entries')
        ->where('contest_id', $contestId)
        ->get();
    
    $entriesWithJoin = \DB::table('contest_entries')
        ->join('users', 'contest_entries.user_id', '=', 'users.id')
        ->leftJoin('saved_baskets', 'contest_entries.basket_id', '=', 'saved_baskets.id')
        ->leftJoin('users as basket_users', 'saved_baskets.user_id', '=', 'basket_users.id')
        ->where('contest_entries.contest_id', $contestId)
        ->select('contest_entries.*', 'users.name as user_name', 'users.mobile', 'saved_baskets.serial_no', 'basket_users.name as basket_owner')
        ->get();
    
    return response()->json([
        'contest_id' => $contestId,
        'raw_entries_count' => $entries->count(),
        'raw_entries' => $entries,
        'joined_entries_count' => $entriesWithJoin->count(),
        'joined_entries' => $entriesWithJoin
    ], 200, [], JSON_PRETTY_PRINT);
});
