<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->float('wallet_balance')->default(0)->after('password');
            $table->float('total_winnings')->default(0)->after('wallet_balance');
            $table->string('referral_code')->unique()->nullable()->after('total_winnings');
            $table->string('referred_by')->nullable()->after('referral_code');
            $table->enum('kyc_status', ['pending', 'approved', 'rejected'])->default('pending')->after('referred_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['wallet_balance', 'total_winnings', 'referral_code', 'referred_by', 'kyc_status']);
        });
    }
};
