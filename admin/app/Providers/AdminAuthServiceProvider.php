<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

class AdminAuthServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        Auth::shouldUse('admin');

        Auth::guard('admin')->guest(function () {
            if (Route::currentRouteName() !== 'admin.login') {
                return redirect()->route('admin.login');
            }
        });
    }
}
