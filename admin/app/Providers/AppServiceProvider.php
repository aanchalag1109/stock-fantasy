<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;
use Illuminate\Pagination\Paginator;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Force HTTPS when behind proxy (ngrok, cloudflare, etc.)
        if (request()->header('X-Forwarded-Proto') === 'https' || 
            request()->header('X-Forwarded-Ssl') === 'on' ||
            env('FORCE_HTTPS', false)) {
            URL::forceScheme('https');
        }
        
        // Use Bootstrap 5 for pagination
        Paginator::useBootstrapFive();
        
        // Register observer
        \App\Models\LeagueSession::observe(\App\Observers\LeagueSessionObserver::class);
    }
}
