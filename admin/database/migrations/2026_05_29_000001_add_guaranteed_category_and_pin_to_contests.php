<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. contests.category enum me 'guaranteed' add karo
        // MariaDB me ENUM modify karte hain
        DB::statement("ALTER TABLE contests MODIFY COLUMN category ENUM('mega','equal','practice','guaranteed') NOT NULL");

        // 2. contests me is_pinned aur pin_order add karo
        Schema::table('contests', function (Blueprint $table) {
            $table->boolean('is_pinned')->default(false)->after('prize_distribution');
            $table->unsignedTinyInteger('pin_order')->default(0)->after('is_pinned');
            // Guaranteed contest ke liye fixed prize pool flag
            $table->boolean('is_fixed_prize')->default(false)->after('pin_order');
        });

        // 3. user_payment_details me usdt_wallet add karo
        Schema::table('user_payment_details', function (Blueprint $table) {
            $table->string('usdt_wallet_address')->nullable()->after('ifsc_code');
            $table->string('usdt_network')->nullable()->default('TRC20')->after('usdt_wallet_address');
        });

        // 4. withdrawal_requests me usdt_wallet_address add karo
        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->string('usdt_wallet_address')->nullable()->after('admin_message');
            $table->string('usdt_network')->nullable()->after('usdt_wallet_address');
        });

        // 5. bots auto-join ke liye contests me fields add karo
        Schema::table('contests', function (Blueprint $table) {
            $table->unsignedInteger('bot_count')->default(0)->after('is_fixed_prize')
                ->comment('Kitne bots auto-join karein');
            $table->unsignedInteger('bot_join_minutes_before')->default(30)->after('bot_count')
                ->comment('Session start se kitne minutes pehle bots join karein');
            $table->boolean('bots_joined')->default(false)->after('bot_join_minutes_before');
        });
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE contests MODIFY COLUMN category ENUM('mega','equal','practice') NOT NULL");

        Schema::table('contests', function (Blueprint $table) {
            $table->dropColumn(['is_pinned', 'pin_order', 'is_fixed_prize', 'bot_count', 'bot_join_minutes_before', 'bots_joined']);
        });

        Schema::table('user_payment_details', function (Blueprint $table) {
            $table->dropColumn(['usdt_wallet_address', 'usdt_network']);
        });

        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->dropColumn(['usdt_wallet_address', 'usdt_network']);
        });
    }
};
