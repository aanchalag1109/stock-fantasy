<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contests', function (Blueprint $table) {
            // Bot joining exact datetime (optional — agar set hai to use karo, warna bot_join_minutes_before)
            $table->dateTime('bot_join_at')->nullable()->after('bots_joined')
                ->comment('Exact datetime jab bots join karein (null = use bot_join_minutes_before)');
        });
    }

    public function down(): void
    {
        Schema::table('contests', function (Blueprint $table) {
            $table->dropColumn('bot_join_at');
        });
    }
};
