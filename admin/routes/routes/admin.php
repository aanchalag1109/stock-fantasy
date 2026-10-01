<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Admin\AdminContestController;
use App\Http\Controllers\Admin\ContestController;
use App\Http\Controllers\Admin\LivePriceFeedController;
use App\Http\Controllers\Admin\PerformanceController;
use App\Http\Controllers\Admin\ContestEntryController;
use App\Http\Controllers\Admin\TestingController;
use App\Http\Controllers\Admin\FixContestController;

// Admin Contest Routes
Route::prefix('admin')->name('admin.')->group(function () {
    Route::get('/contests', [ContestController::class, 'index'])->name('contests.index');
    Route::get('/contests/create', [ContestController::class, 'create'])->name('contests.create');
    Route::post('/contests', [ContestController::class, 'store'])->name('contests.store');
    Route::get('/contests/{id}/edit', [ContestController::class, 'edit'])->name('contests.edit');
    Route::put('/contests/{id}', [ContestController::class, 'update'])->name('contests.update');
    Route::delete('/contests/{id}', [ContestController::class, 'destroy'])->name('contests.destroy');
    Route::post('/contests/bulk-delete', [ContestController::class, 'bulkDelete'])->name('contests.bulk_delete');
    Route::get('/contests/{id}', [ContestController::class, 'show'])->name('contests.show');
    Route::post('/contests/{id}/status', [ContestController::class, 'updateStatus'])->name('contests.updateStatus');
    Route::get('/contests/{id}/export-participants', [ContestController::class, 'exportParticipants'])->name('contests.exportParticipants');
    Route::post('/contests/{id}/cancel', [ContestController::class, 'cancelContest'])->name('contests.cancel');
    
    // Contest Entries Routes
    Route::get('/contest-entries', [ContestEntryController::class, 'index'])->name('contest-entries.index');
    Route::get('/contest-entries/{id}', [ContestEntryController::class, 'show'])->name('contest-entries.show');
    Route::delete('/contest-entries/{id}', [ContestEntryController::class, 'destroy'])->name('contest-entries.destroy');
    
    // Performance Routes
    Route::get('/performance', [PerformanceController::class, 'index'])->name('performance.index');
    Route::get('/performance/{id}', [PerformanceController::class, 'show'])->name('performance.show');
    Route::get('/performance/{id}/live', [PerformanceController::class, 'liveData'])->name('performance.live');
    
    // Live Price Feeds Routes
    Route::get('/live-price-feeds', [LivePriceFeedController::class, 'index'])->name('live-price-feeds.index');
    
    // Testing Routes
    Route::get('/testing', [TestingController::class, 'index'])->name('testing.index');
    
    // Fix Routes
    Route::post('/fix-equal-prizes', [FixContestController::class, 'fixEqualPrizes'])->name('fix.equal-prizes');
});